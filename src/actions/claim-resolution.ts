"use server";

import { revalidatePath } from "next/cache";

import { ClaimStatus } from "@/generated/prisma/enums";
import { getActiveAdmin } from "@/lib/auth/session";
import { canResolveClaim } from "@/lib/claims/rules";
import { createNotifications } from "@/lib/notifications/create";
import { buildClaimNotifications } from "@/lib/notifications/claim-messages";
import { prisma } from "@/lib/prisma";
import { resolveClaimSchema } from "@/lib/validations/claim";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * Deciding a disputed claim. Admin only.
 *
 * WHAT A DETERMINATION IS. Not a transfer - the platform holds nothing and moves nothing. It is a
 * statement of how much of the deposit the owner may keep, which `depositState` then reflects as a
 * reduced obligation. Both parties are told the same two figures, so a settled dispute cannot
 * restart because each side heard a different half.
 *
 * DISPUTED ONLY. An accepted claim is settled by agreement between the two people, and overruling it
 * would be the platform inserting itself into a resolution both sides reached without it. An open
 * one is still the renter's to answer; if they never do, the lazy sweep escalates it here rather
 * than letting an administrator jump the queue.
 *
 * SEPARATE FILE FROM `claims.ts`, matching the reports/moderation split: one surface belongs to the
 * two people in the rental, the other to staff, and keeping them apart keeps the admin-only actions
 * out of a module the parties' components import.
 */

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

export async function resolveDamageClaim(
  input: unknown
): Promise<ActionResult> {
  const parsed = resolveClaimSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the decision.",
    };
  }

  const admin = await getActiveAdmin();

  if (!admin) {
    // One message for a signed-out caller and a signed-in non-admin, so this cannot be used to
    // discover whether an account holds the role.
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const { claimId, amountUpheld, resolution } = parsed.data;

  try {
    const claim = await prisma.damageClaim.findUnique({
      where: { id: claimId },
      select: {
        id: true,
        status: true,
        amountClaimed: true,
        booking: {
          select: {
            id: true,
            ownerId: true,
            renterId: true,
            securityDeposit: true,
            listing: { select: { title: true } },
            payment: { select: { securityDeposit: true } },
          },
        },
      },
    });

    if (!claim) {
      return { success: false, error: "That claim was not found." };
    }

    const eligibility = canResolveClaim(
      claim.status,
      amountUpheld,
      claim.amountClaimed
    );

    if (!eligibility.allowed) {
      return { success: false, error: eligibility.reason };
    }

    // Same precedence as everywhere else: the payment's figure is what the money moved against.
    const securityDeposit =
      claim.booking.payment?.securityDeposit ?? claim.booking.securityDeposit;

    const applied = await prisma.$transaction(async (tx) => {
      /**
       * Compare-and-swap on `DISPUTED`.
       *
       * Two administrators working the same queue is the normal case, not a hypothetical, and
       * without the guard a claim could be decided twice - the second determination silently
       * overwriting the first, including its amount.
       */
      const claimed = await tx.damageClaim.updateMany({
        where: { id: claim.id, status: ClaimStatus.DISPUTED },
        data: {
          status: ClaimStatus.RESOLVED,
          amountUpheld,
          resolution,
          resolvedById: admin.id,
          resolvedAt: new Date(),
        },
      });

      if (claimed.count === 0) {
        return false;
      }

      /**
       * Both parties, with the same two figures in each message.
       *
       * Telling each side only their own half is how a settled dispute restarts: the two would go
       * on to describe different outcomes to each other.
       */
      await createNotifications(
        tx,
        buildClaimNotifications({
          bookingId: claim.booking.id,
          listingTitle: claim.booking.listing.title,
          parties: {
            renterId: claim.booking.renterId,
            ownerId: claim.booking.ownerId,
          },
          event: { event: "resolved", amountUpheld, securityDeposit },
        })
      );

      return true;
    });

    if (!applied) {
      return {
        success: false,
        error: "That claim has already been decided.",
      };
    }

    for (const path of [
      "/admin/claims",
      "/dashboard/bookings",
      "/dashboard/requests",
      "/dashboard/notifications",
    ]) {
      revalidatePath(path, "page");
    }

    revalidatePath("/dashboard", "layout");

    return { success: true, data: undefined };
  } catch (error) {
    console.error("resolveDamageClaim failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}
