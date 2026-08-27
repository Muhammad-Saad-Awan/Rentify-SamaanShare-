"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AdminActionType, UserStatus } from "@/generated/prisma/enums";
import { writeAdminAction } from "@/lib/admin/log";
import { getActiveAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { listingIdSchema } from "@/lib/validations/listing";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * Granting and withdrawing identity verification. Admin only.
 *
 * WHAT THE FLAG MEANS, AND WHY IT IS NOT AUTOMATIC. `User.isVerified` renders as "Identity verified
 * by SamaanShare" on a public page and gates the top trust band. That is the strongest claim the
 * platform makes about a stranger, so it is deliberately not something a user can give themselves.
 * Confirming an email does not set it - `emailVerified` is a different column and a much weaker
 * claim, weighted 0.4 against 1.0 in the trust score for exactly that reason.
 *
 * A HUMAN DECISION, RECORDED. Phone OTP (+92) and CNIC checks against NADRA are Phase 2 and need
 * providers this deployment does not have. Until then verification is an administrator confirming a
 * document out of band, which is a perfectly ordinary way to run this - as long as the decision is
 * attributable. `verifiedAt` and `verifiedById` are what make it so, the same way
 * `Payment.confirmedById` records who vouched for money arriving.
 *
 * NOTE WHAT IS ABSENT: any way for a user to reach this. There is no self-service path, because a
 * badge a user can grant themselves is not a verification, it is a checkbox.
 */

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

const setVerifiedSchema = z.object({
  userId: listingIdSchema,
  verified: z.boolean({ error: "Choose whether to verify this account." }),
});

/**
 * Sets or clears a member's identity verification.
 *
 * One action for both directions rather than two. Withdrawing is not an exceptional case - a
 * document that turns out to be forged, or an account that changes hands, both need it - and
 * splitting them would give the reversal its own code path that nobody exercises.
 */
export async function setIdentityVerified(
  input: unknown
): Promise<ActionResult> {
  const parsed = setVerifiedSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the request.",
    };
  }

  const admin = await getActiveAdmin();

  if (!admin) {
    // One message for a signed-out caller and a signed-in non-admin, so this cannot be used to
    // discover whether an account holds the role.
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const { userId, verified } = parsed.data;

  /**
   * An admin cannot verify themselves.
   *
   * The whole value of the flag is that someone other than its subject decided it. A self-grant is
   * the one case where the audit trail would record a decision nobody independent made, and it is
   * also the first thing a compromised admin account would reach for.
   */
  if (userId === admin.id) {
    return {
      success: false,
      error: "You cannot verify your own account. Ask another administrator.",
    };
  }

  try {
    const target = await prisma.user.findFirst({
      // Soft-deleted accounts are out: there is nobody left to verify, and the row survives only to
      // keep old bookings and reviews intact.
      where: { id: userId, deletedAt: null },
      select: { id: true, isVerified: true, status: true, role: true },
    });

    if (!target) {
      return { success: false, error: "That member was not found." };
    }

    if (target.isVerified === verified) {
      // Idempotent, and reported as such: re-stamping would overwrite who originally decided it and
      // when, which is the one thing these columns exist to preserve.
      return { success: true, data: undefined };
    }

    /**
     * A suspended account cannot be granted verification.
     *
     * Publishing "identity verified" about someone moderation has just acted against would put the
     * platform's strongest endorsement on the account least entitled to it. Withdrawing verification
     * from a suspended account stays permitted, which is the direction that case actually needs.
     */
    if (verified && target.status !== UserStatus.ACTIVE) {
      return {
        success: false,
        error: "That account is not active, so it cannot be verified.",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: target.id },
        data: verified
          ? {
              isVerified: true,
              verifiedAt: new Date(),
              verifiedById: admin.id,
            }
          : {
              isVerified: false,
              // Cleared together. A `verifiedAt` left behind on an unverified account would read as
              // a current grant to anything querying the column rather than the flag.
              verifiedAt: null,
              verifiedById: null,
            },
      });

      /**
       * The same audit row every other administrator action writes.
       *
       * `verifiedAt`/`verifiedById` stay - the trust score reads them, and they are the current
       * state rather than a history. This adds the history: a verification granted, withdrawn and
       * granted again leaves three rows here where the columns would show only the last one.
       *
       * No reason is collected for this action, unlike suspension, so the record says which way it
       * went rather than inventing an explanation nobody typed.
       */
      await writeAdminAction(tx, {
        actorId: admin.id,
        subjectId: target.id,
        type: verified
          ? AdminActionType.VERIFY_IDENTITY
          : AdminActionType.WITHDRAW_VERIFICATION,
        reason: verified
          ? "Identity verified by an administrator."
          : "Identity verification withdrawn by an administrator.",
        previousValue: String(target.isVerified),
        newValue: String(verified),
      });
    });

    /**
     * Refreshes what the badge appears on.
     *
     * The member's own profile, and every listing page - `OwnerCard` renders the verified badge, and
     * the trust panel's top band depends on this flag. `/listings` is included because the browse
     * grid is cached and an owner card can appear in it.
     */
    revalidatePath(`/users/${target.id}`, "page");
    revalidatePath("/listings", "page");
    revalidatePath("/admin/users", "page");

    return { success: true, data: undefined };
  } catch (error) {
    console.error("setIdentityVerified failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}
