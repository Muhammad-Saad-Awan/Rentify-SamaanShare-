"use server";

import { revalidatePath } from "next/cache";

import { HandoverConfirmation } from "@/generated/prisma/enums";
import { getActiveUser } from "@/lib/auth/session";
import { canConfirmHandover } from "@/lib/handover/rules";
import { createNotifications } from "@/lib/notifications/create";
import { buildHandoverNotifications } from "@/lib/notifications/handover-messages";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { confirmHandoverSchema } from "@/lib/validations/handover";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * Answering a handover record.
 *
 * THE COUNTERPARTY'S ONLY VOICE. The record is written by whoever performed the handover - under the
 * current lifecycle always the owner, since both transitions are owner-driven. This is where the
 * other person gets to say whether they agree, and to put their own account on the row if they do
 * not. Without it a condition record would be one party's uncontested statement about the other's
 * conduct, which is not evidence so much as an accusation with a timestamp.
 *
 * NEVER REQUIRED, AND NEVER BLOCKING. The booking has already moved on by the time this is offered.
 * Requiring an answer would let a silent party freeze someone else's rental and deposit; what is
 * recorded instead is which of agreed, disputed or unanswered actually happened.
 *
 * ANSWERED ONCE, by compare-and-swap on `PENDING`. A renter who could switch from agreed to disputed
 * after a deposit came back - or the reverse under pressure from an owner - would make the field
 * describe the last conversation rather than the handover.
 */

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

/** Answers per user per hour. A person answers one or two; a script would not. */
const CONFIRM_RATE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 };

export async function confirmHandover(input: unknown): Promise<ActionResult> {
  const parsed = confirmHandoverSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check your answer.",
    };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(
    `handover-confirm:${user.id}`,
    CONFIRM_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  const { handoverId, agreed, note } = parsed.data;

  try {
    const record = await prisma.handoverRecord.findFirst({
      where: {
        id: handoverId,
        /**
         * Membership of the booking, enforced in the query.
         *
         * A caller who is neither party gets the same "not found" as a record that does not exist,
         * so this cannot be used to probe ids or to learn that a given rental happened at all.
         */
        booking: {
          OR: [{ ownerId: user.id }, { renterId: user.id }],
        },
      },
      select: {
        id: true,
        type: true,
        confirmation: true,
        recordedById: true,
        booking: {
          select: {
            id: true,
            listingId: true,
            ownerId: true,
            renterId: true,
            listing: { select: { title: true } },
          },
        },
      },
    });

    if (!record) {
      return { success: false, error: "That handover record was not found." };
    }

    const eligibility = canConfirmHandover({
      confirmation: record.confirmation,
      // The author cannot answer their own record - a signature on your own statement reads as
      // corroboration in the queue while being nothing of the kind.
      isCounterparty: record.recordedById !== user.id,
    });

    if (!eligibility.allowed) {
      return { success: false, error: eligibility.reason };
    }

    const outcome = agreed
      ? HandoverConfirmation.AGREED
      : HandoverConfirmation.DISPUTED;

    const applied = await prisma.$transaction(async (tx) => {
      /**
       * Compare-and-swap on `PENDING`, the same shape as every other one-way transition here.
       * Checked in the write rather than trusted from the read above, which is outside this
       * transaction and can be stale by now.
       */
      const claimed = await tx.handoverRecord.updateMany({
        where: { id: record.id, confirmation: HandoverConfirmation.PENDING },
        data: {
          confirmation: outcome,
          confirmedById: user.id,
          confirmedAt: new Date(),
          ...(note ? { confirmationNote: note } : {}),
        },
      });

      if (claimed.count === 0) {
        return false;
      }

      /**
       * Only a disagreement notifies, and only the record's author.
       *
       * Agreement is the expected path; a notification for the expected path is noise, and noise is
       * what makes an unread badge untrustworthy - the one thing a badge has to be. A dispute is
       * different: it is the other party contesting a written account of their conduct, and the
       * person who wrote it needs to know while the item is still in front of them.
       */
      await createNotifications(
        tx,
        buildHandoverNotifications({
          bookingId: record.booking.id,
          listingTitle: record.booking.listing.title,
          type: record.type,
          outcome,
          // Addressed to whoever wrote the record, not to a fixed role: the lifecycle may later let
          // a renter file their own, and this would silently notify the wrong person.
          recordedById: record.recordedById,
          parties: {
            renterId: record.booking.renterId,
            ownerId: record.booking.ownerId,
          },
        })
      );

      return true;
    });

    if (!applied) {
      return { success: false, error: "You have already answered this." };
    }

    for (const path of [
      "/dashboard/bookings",
      "/dashboard/requests",
      "/dashboard/notifications",
    ]) {
      revalidatePath(path, "page");
    }

    revalidatePath("/dashboard", "layout");

    return { success: true, data: undefined };
  } catch (error) {
    console.error("confirmHandover failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}
