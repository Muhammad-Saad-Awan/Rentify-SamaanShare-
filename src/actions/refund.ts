"use server";

import { revalidatePath } from "next/cache";

import { AdminActionType, PaymentStatus } from "@/generated/prisma/enums";
import { writeAdminAction } from "@/lib/admin/log";
import { getActiveAdmin } from "@/lib/auth/session";
import { createNotifications } from "@/lib/notifications/create";
import { buildPaymentNotifications } from "@/lib/notifications/payment-messages";
import { refundReadiness } from "@/lib/payments/refund";
import { prisma } from "@/lib/prisma";
import { publishAfterCommit } from "@/lib/realtime/publish";
import { formatPKR } from "@/lib/utils/currency";
import { recordRefundSchema } from "@/lib/validations/payment";

import type { ActionResult } from "@/types";

/**
 * Giving the money back.
 *
 * THE SECOND OF TWO TERMINAL MONEY OUTCOMES. A booking that collected money either settles or
 * refunds, never both. `Settlement` already refuses a refunded payment; this refuses a settled
 * booking, and between them a booking cannot pay the owner and the renter out of the same money.
 * Neither check is worth anything alone, which is why they were written a phase apart and are
 * asserted together.
 *
 * ITS OWN FILE, like `settlement.ts`. `payment-verification.ts` is about establishing that money
 * arrived; this is about it leaving again, and the two have different subjects, different
 * preconditions and no shared helpers beyond the error strings.
 *
 * NO PARTIAL REFUND, and the omission is the design. A partial refund is the output of a
 * cancellation policy and this product has none - `canRenterCancel` refuses outright once a
 * payment is confirmed for exactly that reason. A free text amount here would be that policy
 * invented at the keyboard, one booking at a time, with nothing to review it against. When a
 * policy exists it will produce the figure, and `computeRefund` is the one place that has to
 * change.
 */

const CONCURRENT_CHANGE_ERROR =
  "This payment was just updated somewhere else. Please refresh and try again.";

const NOT_FOUND_ERROR = "That booking was not found.";

/** Identical to `NOT_FOUND_ERROR` on purpose - see the note in `payment-verification.ts`. */
const ADMIN_ONLY_ERROR = NOT_FOUND_ERROR;

/**
 * An administrator returns everything collected for a booking.
 *
 * MOVES THE PAYMENT TO `REFUNDED`, which has a consequence worth stating: `canStartBooking()`
 * requires `COMPLETED`, so a refunded booking can no longer be handed over. That is the correct
 * outcome and it falls out of the status change rather than needing its own guard - but it does
 * mean this action can strand a booking whose owner is standing next to the renter, which is why
 * it demands a reason and writes an audit row.
 *
 * The booking's own status is untouched, like everywhere else here. What happened to the rental
 * and what happened to the money are different facts.
 */
export async function recordRefund(
  input: unknown
): Promise<ActionResult<{ refundAmount: number }>> {
  const parsed = recordRefundSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? NOT_FOUND_ERROR,
    };
  }

  const admin = await getActiveAdmin();

  if (!admin) {
    return { success: false, error: ADMIN_ONLY_ERROR };
  }

  const booking = await prisma.booking.findUnique({
    where: { id: parsed.data.bookingId },
    select: {
      id: true,
      renterId: true,
      ownerId: true,
      listing: { select: { title: true } },
      payment: {
        select: {
          id: true,
          status: true,
          amount: true,
          securityDeposit: true,
          refundedAt: true,
        },
      },
      settlement: { select: { id: true } },
    },
  });

  if (!booking?.payment) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  const payment = booking.payment;

  const readiness = refundReadiness({
    paymentStatus: payment.status,
    amount: payment.amount,
    securityDeposit: payment.securityDeposit,
    refunded: payment.refundedAt !== null,
    settled: booking.settlement !== null,
  });

  if (!readiness.ready) {
    return { success: false, error: readiness.reason };
  }

  const refundedAt = new Date();
  const { refundAmount } = readiness;

  const created = await prisma.$transaction(async (tx) => {
    /**
     * Compare-and-swap on both the status and the absence of a refund.
     *
     * Two conditions rather than one because they guard different races: another administrator
     * refunding at the same moment, and a reversal of the verification landing in between. Either
     * would otherwise let this write a refund against money the record no longer says arrived.
     */
    const updated = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: PaymentStatus.COMPLETED,
        refundedAt: null,
      },
      data: {
        status: PaymentStatus.REFUNDED,
        refundedAt,
        refundAmount,
        refundRef: parsed.data.refundRef,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    /**
     * The subject is the RENTER: it is their money coming back, and their account history that
     * has to answer when. The owner is not notified, because under this flow they were never
     * paid - there is nothing to take back from them and nothing for them to do.
     */
    await writeAdminAction(tx, {
      actorId: admin.id,
      subjectId: booking.renterId,
      type: AdminActionType.RECORD_REFUND,
      reason: `Refunded ${formatPKR(refundAmount)} against reference ${parsed.data.refundRef}. ${parsed.data.reason}`,
      previousValue: PaymentStatus.COMPLETED,
      newValue: PaymentStatus.REFUNDED,
    });

    return createNotifications(
      tx,
      buildPaymentNotifications({
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
        event: { event: "refunded", amount: refundAmount },
      })
    );
  });

  if (!created) {
    return { success: false, error: CONCURRENT_CHANGE_ERROR };
  }

  publishAfterCommit(created);

  for (const path of [
    "/admin/payments",
    "/admin/bookings",
    "/dashboard/bookings",
    "/dashboard/requests",
  ]) {
    revalidatePath(path, "page");
  }

  revalidatePath("/dashboard", "layout");

  return { success: true, data: { refundAmount } };
}
