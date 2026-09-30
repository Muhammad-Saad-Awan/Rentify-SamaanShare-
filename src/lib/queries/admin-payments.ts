import { PaymentStatus } from "@/generated/prisma/enums";
import { computeCommission } from "@/lib/payments/commission";
import { prisma } from "@/lib/prisma";

import type { PaymentMethod } from "@/generated/prisma/enums";
import type { PaginatedResult } from "@/types";

/**
 * The payment verification queue. Admin reads only.
 *
 * WHAT AN ADMINISTRATOR IS ACTUALLY DOING HERE is reconciling a claim against a bank or wallet
 * statement: somebody says they sent money, and the only question is whether it arrived. So the
 * row leads with the reference and the amount, because those are what gets typed into a search
 * box on another screen, and the proof - which is corroboration, not identification - sits
 * underneath.
 *
 * CARRIES THE SPLIT THE DECISION WILL FREEZE. Verifying is the moment the commission rate is
 * fixed for that booking, and an administrator ought to see what they are fixing before they fix
 * it rather than discover it on the settlement screen weeks later. The figures shown are computed
 * from the CURRENT configured rate, because for an unverified payment that is the rate that will
 * be frozen - and for one already verified, from the rate stored on the row, which is what
 * settlement will actually use.
 *
 * ORDERED OLDEST FIRST, like every other queue here. A queue sorted newest first quietly
 * abandons the person who has waited longest, which for a payment is the person whose rental
 * cannot start.
 */

/** Payments shown per page. */
export const PAYMENTS_PAGE_SIZE = 20;

export interface AdminPaymentSummary {
  bookingId: string;
  paymentId: string;
  status: PaymentStatus;
  method: PaymentMethod;
  /** The rental charge. The deposit is separate and is never commissioned. */
  amount: number;
  securityDeposit: number;
  transactionRef: string | null;
  submittedAt: Date | null;
  confirmedAt: Date | null;
  confirmedByName: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  /** Cloudinary URL of the receipt, when the renter attached one. */
  proofUrl: string | null;
  /**
   * What the split will be, or was.
   *
   * `rateBps` is the frozen rate once verified and the configured one before that - see the note
   * on the module. Shown either way so the screen never presents a decision without its
   * consequence.
   */
  rateBps: number;
  commissionAmount: number;
  ownerRentalAmount: number;
  renter: { id: string; name: string | null; email: string };
  owner: { id: string; name: string | null };
  listing: { id: string; title: string };
  /** Whether the booking has already been settled, which closes off reversal and refund. */
  settled: boolean;
  refundedAt: Date | null;
}

interface PaymentQueueOptions {
  status: PaymentStatus;
  configuredRateBps: number;
  page?: number;
  pageSize?: number;
}

/**
 * One page of payments in a given state.
 *
 * Reads from `Booking` rather than from `Payment`, even though the payment is the subject. A
 * payment row on its own names nobody and nothing - the renter, the owner and the item all hang
 * off the booking, and the queue is unusable without them. `Booking.paymentId` is unique, so this
 * is the same set either way.
 */
export async function getPaymentQueue({
  status,
  configuredRateBps,
  page = 1,
  pageSize = PAYMENTS_PAGE_SIZE,
}: PaymentQueueOptions): Promise<PaginatedResult<AdminPaymentSummary>> {
  const currentPage = Math.max(1, Math.trunc(page));
  const where = { payment: { status } };

  /**
   * Oldest first by SUBMISSION, falling back to when the payment row was made.
   *
   * `submittedAt` is null on a payment the renter has not recorded yet, so ordering by it alone
   * would scatter those unpredictably. The secondary key keeps the order total.
   */
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: [
        { payment: { submittedAt: "asc" } },
        { payment: { createdAt: "asc" } },
      ],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        renter: { select: { id: true, name: true, email: true } },
        owner: { select: { id: true, name: true } },
        listing: { select: { id: true, title: true } },
        settlement: { select: { id: true } },
        payment: {
          select: {
            id: true,
            status: true,
            method: true,
            amount: true,
            securityDeposit: true,
            transactionRef: true,
            submittedAt: true,
            confirmedAt: true,
            confirmedBy: { select: { name: true } },
            rejectedAt: true,
            rejectionReason: true,
            proofUrl: true,
            commissionRateBps: true,
            refundedAt: true,
          },
        },
      },
    }),
    prisma.booking.count({ where }),
  ]);

  const items = rows.flatMap((row) => {
    /**
     * Unreachable: `where` filtered on the payment's status, so every row has one. Skipped rather
     * than asserted because a `flatMap` costs nothing and a non-null assertion here would be a
     * claim about a Prisma filter that no type checks.
     */
    if (!row.payment) {
      return [];
    }

    const payment = row.payment;
    const rateBps = payment.commissionRateBps ?? configuredRateBps;

    const { commissionAmount, ownerRentalAmount } = computeCommission({
      rentalAmount: payment.amount,
      rateBps,
    });

    return [
      {
        bookingId: row.id,
        paymentId: payment.id,
        status: payment.status,
        method: payment.method,
        amount: payment.amount,
        securityDeposit: payment.securityDeposit,
        transactionRef: payment.transactionRef,
        submittedAt: payment.submittedAt,
        confirmedAt: payment.confirmedAt,
        confirmedByName: payment.confirmedBy?.name ?? null,
        rejectedAt: payment.rejectedAt,
        rejectionReason: payment.rejectionReason,
        proofUrl: payment.proofUrl,
        rateBps,
        commissionAmount,
        ownerRentalAmount,
        renter: row.renter,
        owner: row.owner,
        listing: row.listing,
        settled: row.settlement !== null,
        refundedAt: payment.refundedAt,
      } satisfies AdminPaymentSummary,
    ];
  });

  return {
    items,
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * How many payments are waiting to be looked at.
 *
 * Its own query so the admin overview can show the number without paging through the queue -
 * the same shape `getUnreadNotificationCount` uses, and for the same reason.
 */
export async function getPendingVerificationCount(): Promise<number> {
  return prisma.booking.count({
    where: { payment: { status: PaymentStatus.PENDING_VERIFICATION } },
  });
}
