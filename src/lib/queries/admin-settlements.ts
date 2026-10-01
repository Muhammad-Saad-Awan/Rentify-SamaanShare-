import { BookingStatus, PaymentStatus } from "@/generated/prisma/enums";
import {
  computeSettlement,
  settlementReadiness,
  settlementTransfers,
} from "@/lib/payments/settlement";
import { prisma } from "@/lib/prisma";

import type {
  SettlementBreakdown,
  SettlementTransfers,
} from "@/lib/payments/settlement";
import type { PaginatedResult } from "@/types";

/**
 * The settlement queue. Admin reads only.
 *
 * TWO JOBS WEARING ONE NAME. "Settling" is deciding what a finished rental owes, and it is also
 * the two transfers that follow - and they happen at different times, by different people, on
 * different screens from the administrator's point of view. So the queue has two working views:
 * what still needs deciding, and what has been decided but not sent.
 *
 * EVERY FIGURE COMES FROM THE SAME FUNCTIONS THE ACTIONS USE. The screen computes nothing of its
 * own: `settlementReadiness` says whether a booking can be settled and why not, `computeSettlement`
 * produces the figures it would produce, and `settlementTransfers` says what is still owed. A
 * queue that did its own arithmetic would eventually disagree with the action behind the button,
 * and the disagreement would be invisible until somebody was paid the wrong amount.
 */

/** Settlements shown per page. */
export const SETTLEMENTS_PAGE_SIZE = 20;

/** Which of the queue's views. */
export type SettlementView = "to-settle" | "to-send" | "done";

interface Party {
  id: string;
  name: string | null;
}

export interface AdminSettlementRow {
  bookingId: string;
  listing: { id: string; title: string };
  renter: Party;
  owner: Party;
  completedAt: Date | null;
  /**
   * `null` before the booking has been settled.
   *
   * Its absence is what distinguishes the two working views, so it is also what the card
   * branches on rather than a separate flag that could disagree with it.
   */
  settlement:
    | (SettlementBreakdown &
        SettlementTransfers & {
          settledAt: Date;
          settledByName: string | null;
          ownerPayoutRef: string | null;
          depositReturnRef: string | null;
          notes: string | null;
        })
    | null;
  /**
   * What settling WOULD produce, and whether it can happen.
   *
   * Only present in the `to-settle` view. The refusal is carried rather than the button simply
   * being hidden: "the damage claim is still being decided" tells an administrator what to go
   * and do, where a missing button tells them nothing.
   */
  pending:
    | { ready: true; breakdown: SettlementBreakdown }
    | { ready: false; reason: string }
    | null;
}

/** The booking shape both views read, so the two cannot drift. */
const rowSelect = {
  id: true,
  status: true,
  completedAt: true,
  listing: { select: { id: true, title: true } },
  renter: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true } },
  claim: { select: { status: true, amountUpheld: true } },
  payment: {
    select: {
      status: true,
      amount: true,
      securityDeposit: true,
      commissionRateBps: true,
      refundedAt: true,
    },
  },
  settlement: {
    select: {
      rentalAmount: true,
      commissionRateBps: true,
      commissionAmount: true,
      ownerRentalAmount: true,
      securityDeposit: true,
      damageCompensationAmount: true,
      depositReturnedAmount: true,
      ownerPaidAt: true,
      ownerPayoutRef: true,
      depositReturnedAt: true,
      depositReturnRef: true,
      settledAt: true,
      settledBy: { select: { name: true } },
      notes: true,
    },
  },
} as const;

/**
 * Where each view looks.
 *
 * `to-settle` is deliberately WIDER than "can be settled right now": it includes finished
 * bookings whose claim is still open, because those are the ones an administrator has to chase.
 * A queue that hid them would be a queue that looked empty while work was outstanding.
 */
function whereFor(view: SettlementView) {
  const finished = {
    status: { in: [BookingStatus.COMPLETED, BookingStatus.REVIEWED] },
    payment: { status: PaymentStatus.COMPLETED, refundedAt: null },
  };

  switch (view) {
    case "to-settle":
      return { ...finished, settlement: { is: null } };
    case "to-send":
      return {
        settlement: {
          is: {
            OR: [{ ownerPaidAt: null }, { depositReturnedAt: null }],
          },
        },
      };
    case "done":
      return {
        settlement: {
          is: { ownerPaidAt: { not: null }, depositReturnedAt: { not: null } },
        },
      };
  }
}

interface QueueOptions {
  view: SettlementView;
  page?: number;
  pageSize?: number;
}

export async function getSettlementQueue({
  view,
  page = 1,
  pageSize = SETTLEMENTS_PAGE_SIZE,
}: QueueOptions): Promise<PaginatedResult<AdminSettlementRow>> {
  const currentPage = Math.max(1, Math.trunc(page));
  const where = whereFor(view);

  /** Oldest finished first, like every other queue - the longest wait is served first. */
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: [{ completedAt: "asc" }, { createdAt: "asc" }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: rowSelect,
    }),
    prisma.booking.count({ where }),
  ]);

  const items = rows.map((row): AdminSettlementRow => {
    const base = {
      bookingId: row.id,
      listing: row.listing,
      renter: row.renter,
      owner: row.owner,
      completedAt: row.completedAt,
    };

    if (row.settlement) {
      const s = row.settlement;

      return {
        ...base,
        settlement: {
          rentalAmount: s.rentalAmount,
          commissionRateBps: s.commissionRateBps,
          commissionAmount: s.commissionAmount,
          ownerRentalAmount: s.ownerRentalAmount,
          securityDeposit: s.securityDeposit,
          damageCompensationAmount: s.damageCompensationAmount,
          depositReturnedAmount: s.depositReturnedAmount,
          // Derived rather than stored - see the note on the `Settlement` model.
          totalOwnerPayout: s.ownerRentalAmount + s.damageCompensationAmount,
          ...settlementTransfers(s),
          settledAt: s.settledAt,
          settledByName: s.settledBy?.name ?? null,
          ownerPayoutRef: s.ownerPayoutRef,
          depositReturnRef: s.depositReturnRef,
          notes: s.notes,
        },
        pending: null,
      };
    }

    /**
     * Unsettled. Ask the same function the action asks, so the screen and the button agree about
     * whether this can be settled and - when it cannot - about why.
     */
    const payment = row.payment;

    if (!payment) {
      return {
        ...base,
        settlement: null,
        pending: { ready: false, reason: "This booking has no payment." },
      };
    }

    const readiness = settlementReadiness({
      bookingStatus: row.status,
      paymentStatus: payment.status,
      commissionRateBps: payment.commissionRateBps,
      refunded: payment.refundedAt !== null,
      settled: false,
      claim: row.claim,
    });

    if (!readiness.ready) {
      return { ...base, settlement: null, pending: readiness };
    }

    return {
      ...base,
      settlement: null,
      pending: {
        ready: true,
        breakdown: computeSettlement({
          rentalAmount: payment.amount,
          rateBps: readiness.commissionRateBps,
          securityDeposit: payment.securityDeposit,
          damageCompensationAmount: readiness.damageCompensationAmount,
        }),
      },
    };
  });

  return {
    items,
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
