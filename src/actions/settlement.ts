"use server";

import { revalidatePath } from "next/cache";

import { AdminActionType } from "@/generated/prisma/enums";
import { writeAdminAction } from "@/lib/admin/log";
import { getActiveAdmin } from "@/lib/auth/session";
import { createNotifications } from "@/lib/notifications/create";
import { buildPaymentNotifications } from "@/lib/notifications/payment-messages";
import {
  computeSettlement,
  settlementReadiness,
} from "@/lib/payments/settlement";
import { prisma } from "@/lib/prisma";
import { publishAfterCommit } from "@/lib/realtime/publish";
import { formatPKR } from "@/lib/utils/currency";
import {
  recordDepositReturnSchema,
  recordOwnerPayoutSchema,
  settleBookingSchema,
} from "@/lib/validations/settlement";

import type { SettlementBreakdown } from "@/lib/payments/settlement";
import type { ActionResult } from "@/types";

/**
 * Settlement: the platform decides what a finished rental owes, and records paying the owner.
 *
 * ADMINISTRATOR ONLY, END TO END. Neither party settles their own booking and neither is asked to
 * agree - the platform collected the money and the platform disburses it, which is the whole
 * difference between this and the offline flow in `payments.ts` where the owner vouched for cash
 * they had received themselves.
 *
 * NO AMOUNT IS EVER ACCEPTED FROM A CALLER. Every figure is derived by `computeSettlement` from
 * the verified payment, the rate frozen at verification and the resolved claim. The administrator
 * decides *that* the booking settles; the arithmetic decides for how much. See the note in
 * `validations/settlement.ts` on why there is no payout field to fill in.
 *
 * THE BOOKING LIFECYCLE IS NOT TOUCHED HERE EITHER, for the same reason as in
 * `payment-verification.ts`. A settled booking is a `COMPLETED` or `REVIEWED` booking that now
 * has a `Settlement` row; the status describes the rental, not the money.
 *
 * THE TWO TRANSFERS ARE SEPARATE ACTS AND SO ARE THEIR RECORDS. Settling decides the figures;
 * `recordOwnerPayout` and `recordDepositReturn` stamp the money actually leaving, in either
 * order, because they go to different people and nothing makes one wait on the other.
 *
 * WHAT IS STILL NOT HERE. The offline flow's `markDepositReturned()` and the column it writes,
 * `Payment.depositReturnedAt`, survive alongside this. They are not redundant yet: the user
 * interface still drives the offline flow end to end, so that action is the only path a real
 * booking has today, and deleting it would leave every finished rental with no way to record a
 * deposit coming back at all. Both go when the interface switches over - see
 * `depositReturnedAtOf`, which is the one place that has to know both exist.
 */

const CONCURRENT_CHANGE_ERROR =
  "This settlement was just updated somewhere else. Please refresh and try again.";

const NOT_FOUND_ERROR = "That booking was not found.";

/** Identical to `NOT_FOUND_ERROR` on purpose - see the note in `payment-verification.ts`. */
const ADMIN_ONLY_ERROR = NOT_FOUND_ERROR;

/** Refreshes the surfaces a settlement touches. */
function revalidateSettlementPaths(): void {
  for (const path of [
    "/admin/payments",
    "/admin/bookings",
    "/dashboard/bookings",
    "/dashboard/requests",
  ]) {
    revalidatePath(path, "page");
  }

  revalidatePath("/dashboard", "layout");
}

/**
 * Everything settlement needs to decide, in one read.
 *
 * Includes the claim and any existing settlement, because both are eligibility inputs rather than
 * details to fetch later: a live claim blocks, and an existing row makes the call idempotent.
 */
async function loadBookingForSettlement(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      ownerId: true,
      renterId: true,
      // For the notification copy - see `buildPaymentNotifications`.
      listing: { select: { title: true } },
      payment: {
        select: {
          id: true,
          status: true,
          amount: true,
          securityDeposit: true,
          commissionRateBps: true,
          refundedAt: true,
        },
      },
      claim: { select: { status: true, amountUpheld: true } },
      settlement: {
        select: {
          id: true,
          rentalAmount: true,
          commissionRateBps: true,
          commissionAmount: true,
          ownerRentalAmount: true,
          securityDeposit: true,
          damageCompensationAmount: true,
          depositReturnedAmount: true,
        },
      },
    },
  });
}

/** Rebuilds the display shape from a stored row, so a repeat call answers with the record. */
function breakdownFromRow(row: {
  rentalAmount: number;
  commissionRateBps: number;
  commissionAmount: number;
  ownerRentalAmount: number;
  securityDeposit: number;
  damageCompensationAmount: number;
  depositReturnedAmount: number;
}): SettlementBreakdown {
  return {
    ...row,
    totalOwnerPayout: row.ownerRentalAmount + row.damageCompensationAmount,
  };
}

export interface SettlementResult {
  settlementId: string;
  breakdown: SettlementBreakdown;
}

/**
 * An administrator settles a finished rental.
 *
 * Writes the `Settlement` row: what the rental was, what SamaanShare kept, what the owner is owed
 * for the rental, what an upheld claim adds to that, and what goes back to the renter. It records
 * the decision - the two transfers are stamped as they happen, by `recordOwnerPayout` here and by
 * the deposit phase later.
 *
 * THE UNIQUE INDEX IS THE COMPARE-AND-SWAP. `Settlement.bookingId` is unique, so two
 * administrators settling the same booking at the same moment produce one row and one constraint
 * violation rather than two payouts. This is the one place in the payment code where the guard is
 * an insert rather than a conditional update, for the simple reason that there is no prior row to
 * put a condition on.
 */
export async function settleBooking(
  input: unknown
): Promise<ActionResult<SettlementResult>> {
  const parsed = settleBookingSchema.safeParse(input);

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

  const booking = await loadBookingForSettlement(parsed.data.bookingId);

  if (!booking?.payment) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  /**
   * Idempotent, like the already-verified case in `verifyPayment`: an administrator looking at a
   * stale queue is not doing anything wrong, and the honest answer is the settlement that exists.
   * The stored figures are returned rather than recomputed - the row is the record, and if a
   * recomputation today disagreed with it, showing today's answer would hide that.
   */
  if (booking.settlement) {
    return {
      success: true,
      data: {
        settlementId: booking.settlement.id,
        breakdown: breakdownFromRow(booking.settlement),
      },
    };
  }

  const payment = booking.payment;

  const readiness = settlementReadiness({
    bookingStatus: booking.status,
    paymentStatus: payment.status,
    commissionRateBps: payment.commissionRateBps,
    refunded: payment.refundedAt !== null,
    settled: false,
    claim: booking.claim,
  });

  if (!readiness.ready) {
    return { success: false, error: readiness.reason };
  }

  let breakdown: SettlementBreakdown;

  try {
    breakdown = computeSettlement({
      rentalAmount: payment.amount,
      // The frozen rate, handed back by the readiness check that refused a missing one.
      rateBps: readiness.commissionRateBps,
      securityDeposit: payment.securityDeposit,
      damageCompensationAmount: readiness.damageCompensationAmount,
    });
  } catch (error) {
    /**
     * Only reachable from data that should not exist - an upheld claim above the deposit, a
     * fractional amount in an `Int` column. Logged and refused rather than settled around,
     * because the settlement that would result is one nobody chose.
     */
    console.error("settleBooking: refused to compute a settlement", {
      bookingId: booking.id,
      error,
    });

    return {
      success: false,
      error:
        "The figures on this booking do not add up. Check the payment and the claim before settling.",
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    /**
     * Re-read inside the transaction, narrowing the window between deciding and writing.
     *
     * It does not close it - read committed will not stop a refund landing between this and the
     * insert. The invariant survives anyway because the two sides guard each other: settlement
     * refuses a refunded payment, the refund path refuses a settled booking, and the unique index
     * on `bookingId` means that whichever of them commits first is the one that stands.
     */
    const current = await tx.payment.findUnique({
      where: { id: payment.id },
      select: { status: true, refundedAt: true },
    });

    if (current?.status !== payment.status || current.refundedAt !== null) {
      return null;
    }

    const created = await tx.settlement.create({
      data: {
        bookingId: booking.id,
        paymentId: payment.id,
        rentalAmount: breakdown.rentalAmount,
        commissionRateBps: breakdown.commissionRateBps,
        commissionAmount: breakdown.commissionAmount,
        ownerRentalAmount: breakdown.ownerRentalAmount,
        securityDeposit: breakdown.securityDeposit,
        damageCompensationAmount: breakdown.damageCompensationAmount,
        depositReturnedAmount: breakdown.depositReturnedAmount,
        settledById: admin.id,
        ...(parsed.data.notes ? { notes: parsed.data.notes } : {}),
      },
      select: { id: true },
    });

    /**
     * The subject is the OWNER, per the note on `AdminActionType` in the schema: settlement is a
     * decision about what this account is paid, and it is the owner's history a later reviewer
     * would be reading. Verification, by the same rule, is about the renter.
     *
     * The reason is synthesised because `AdminAction.reason` is required and the justification is
     * genuinely in the figures. It states all four, separately: an audit line reading "paid
     * 27,000" is unreviewable when the question six months later is whether the split was right.
     */
    await writeAdminAction(tx, {
      actorId: admin.id,
      subjectId: booking.ownerId,
      type: AdminActionType.SETTLE_BOOKING,
      reason:
        `Settled rental ${formatPKR(breakdown.rentalAmount)}: commission ${breakdown.commissionRateBps}bps = ` +
        `${formatPKR(breakdown.commissionAmount)}, owner rental ${formatPKR(breakdown.ownerRentalAmount)}` +
        `${breakdown.damageCompensationAmount > 0 ? `, damage compensation ${formatPKR(breakdown.damageCompensationAmount)}` : ""}` +
        `. Deposit ${formatPKR(breakdown.securityDeposit)}, returning ${formatPKR(breakdown.depositReturnedAmount)} to the renter.` +
        `${parsed.data.notes ? ` ${parsed.data.notes}` : ""}`,
      newValue: String(breakdown.totalOwnerPayout),
    });

    /**
     * Each side is told their own half. The owner sees the commission they were charged; the
     * renter sees what is coming back and nothing about the platform's cut - see the copy module.
     */
    const notifications = await createNotifications(
      tx,
      buildPaymentNotifications({
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
        event: {
          event: "settled",
          ownerRentalAmount: breakdown.ownerRentalAmount,
          commissionAmount: breakdown.commissionAmount,
          damageCompensationAmount: breakdown.damageCompensationAmount,
          depositReturnedAmount: breakdown.depositReturnedAmount,
        },
      })
    );

    /**
     * Both leave together. The settlement id is what the caller answers with; the notifications
     * are what gets published, and publishing must wait for this transaction to commit - so they
     * travel out as a return value rather than being sent from inside it.
     */
    return { settlementId: created.id, notifications };
  });

  if (!result) {
    return { success: false, error: CONCURRENT_CHANGE_ERROR };
  }

  publishAfterCommit(result.notifications);

  revalidateSettlementPaths();

  return {
    success: true,
    data: { settlementId: result.settlementId, breakdown },
  };
}

/**
 * An administrator records the transfer that paid the owner.
 *
 * SEPARATE FROM SETTLING, because they are separate events. Deciding what is owed happens at a
 * desk; the transfer happens in a banking app minutes or hours later, and the reference only
 * exists afterwards. Folding them together would mean either inventing a reference at settlement
 * time or holding the settlement open until the transfer cleared - and the second is how a
 * booking ends up with money owed and no record of what was decided.
 *
 * Stamps `ownerPaidAt` once. The timestamp is the record of when the money left, so a repeat call
 * returns the existing one rather than moving it.
 */
export async function recordOwnerPayout(
  input: unknown
): Promise<ActionResult<{ ownerPaidAt: Date }>> {
  const parsed = recordOwnerPayoutSchema.safeParse(input);

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

  const settlement = await prisma.settlement.findUnique({
    where: { bookingId: parsed.data.bookingId },
    select: {
      id: true,
      ownerPaidAt: true,
      ownerRentalAmount: true,
      damageCompensationAmount: true,
      booking: {
        select: {
          id: true,
          ownerId: true,
          renterId: true,
          listing: { select: { title: true } },
        },
      },
    },
  });

  if (!settlement) {
    return {
      success: false,
      error: "Settle this booking before recording a payout.",
    };
  }

  if (settlement.ownerPaidAt) {
    return { success: true, data: { ownerPaidAt: settlement.ownerPaidAt } };
  }

  const ownerPaidAt = new Date();
  const paid =
    settlement.ownerRentalAmount + settlement.damageCompensationAmount;

  const created = await prisma.$transaction(async (tx) => {
    // Guarded on `ownerPaidAt: null`, so two administrators recording the same transfer produce
    // one stamp and one refusal rather than a timestamp that quietly moved.
    const updated = await tx.settlement.updateMany({
      where: { id: settlement.id, ownerPaidAt: null },
      data: { ownerPaidAt, ownerPayoutRef: parsed.data.payoutRef },
    });

    if (updated.count !== 1) {
      return null;
    }

    /**
     * `SETTLE_BOOKING` again rather than a type of its own. The enum already has five payment
     * entries and this is the second half of the act the first one records - a reviewer reading
     * an owner's history sees the decision and then the transfer, under one heading, in order.
     */
    await writeAdminAction(tx, {
      actorId: admin.id,
      subjectId: settlement.booking.ownerId,
      type: AdminActionType.SETTLE_BOOKING,
      reason:
        `Paid owner ${formatPKR(paid)} against reference ${parsed.data.payoutRef}.` +
        `${parsed.data.note ? ` ${parsed.data.note}` : ""}`,
      newValue: parsed.data.payoutRef,
    });

    // The owner alone: the renter's deposit is a separate transfer with its own message.
    return createNotifications(
      tx,
      buildPaymentNotifications({
        bookingId: settlement.booking.id,
        listingTitle: settlement.booking.listing.title,
        parties: {
          renterId: settlement.booking.renterId,
          ownerId: settlement.booking.ownerId,
        },
        event: { event: "owner-paid", amount: paid },
      })
    );
  });

  if (!created) {
    return { success: false, error: CONCURRENT_CHANGE_ERROR };
  }

  publishAfterCommit(created);

  revalidateSettlementPaths();

  return { success: true, data: { ownerPaidAt } };
}

/**
 * An administrator records the transfer that returned the deposit to the renter.
 *
 * The mirror of `recordOwnerPayout`, and separate from it for the same reason settling is
 * separate from either: the reference only exists once somebody has made the transfer. Neither
 * waits on the other. A renter whose deposit is clean should not be kept waiting because the
 * owner's bank is slow, and an owner should not be kept waiting because the renter's is.
 *
 * REFUSES WHEN THERE IS NOTHING TO SEND. An upheld claim can consume the whole deposit, and then
 * `depositReturnedAmount` is zero: no transfer happens, so stamping one would record a payment
 * that was never made. `settlementTransfers()` reports that case as `nothing-to-send` rather than
 * as outstanding, which is what keeps such a settlement from sitting on the queue forever.
 */
export async function recordDepositReturn(
  input: unknown
): Promise<ActionResult<{ depositReturnedAt: Date }>> {
  const parsed = recordDepositReturnSchema.safeParse(input);

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

  const settlement = await prisma.settlement.findUnique({
    where: { bookingId: parsed.data.bookingId },
    select: {
      id: true,
      depositReturnedAt: true,
      depositReturnedAmount: true,
      booking: {
        select: {
          id: true,
          ownerId: true,
          renterId: true,
          listing: { select: { title: true } },
        },
      },
    },
  });

  if (!settlement) {
    return {
      success: false,
      error: "Settle this booking before returning the deposit.",
    };
  }

  if (settlement.depositReturnedAt) {
    return {
      success: true,
      data: { depositReturnedAt: settlement.depositReturnedAt },
    };
  }

  if (settlement.depositReturnedAmount <= 0) {
    return {
      success: false,
      error:
        "There is nothing to return - the whole deposit went to the owner as damage compensation.",
    };
  }

  const depositReturnedAt = new Date();

  const created = await prisma.$transaction(async (tx) => {
    const updated = await tx.settlement.updateMany({
      where: { id: settlement.id, depositReturnedAt: null },
      data: { depositReturnedAt, depositReturnRef: parsed.data.returnRef },
    });

    if (updated.count !== 1) {
      return null;
    }

    /**
     * The subject is the RENTER. This is their money going back to them, and it is their account
     * history that has to answer "when did SamaanShare return my deposit" - the same rule that
     * puts verification on the renter and the payout on the owner.
     */
    await writeAdminAction(tx, {
      actorId: admin.id,
      subjectId: settlement.booking.renterId,
      type: AdminActionType.SETTLE_BOOKING,
      reason:
        `Returned ${formatPKR(settlement.depositReturnedAmount)} of the deposit against reference ${parsed.data.returnRef}.` +
        `${parsed.data.note ? ` ${parsed.data.note}` : ""}`,
      newValue: parsed.data.returnRef,
    });

    /**
     * The renter alone, and the body points at us rather than at the owner - under this flow the
     * platform sent the money, so the platform is who they chase if it does not arrive.
     */
    return createNotifications(
      tx,
      buildPaymentNotifications({
        bookingId: settlement.booking.id,
        listingTitle: settlement.booking.listing.title,
        parties: {
          renterId: settlement.booking.renterId,
          ownerId: settlement.booking.ownerId,
        },
        event: {
          event: "deposit-returned",
          amount: settlement.depositReturnedAmount,
        },
      })
    );
  });

  if (!created) {
    return { success: false, error: CONCURRENT_CHANGE_ERROR };
  }

  publishAfterCommit(created);

  revalidateSettlementPaths();

  return { success: true, data: { depositReturnedAt } };
}
