import { describe, expect, it } from "vitest";

import {
  BookingStatus,
  PaymentProvider,
  PaymentStatus,
} from "@/generated/prisma/enums";
import { bookingBadge } from "@/lib/bookings/status-badge";
import { ownerPaymentNote, ownerPaymentView } from "@/lib/payments/owner-view";

/**
 * The live "Wedding dress" report, reproduced from the staging rows.
 *
 * The owner had three cards for the same item and the same renter. Two were paid by card
 * (PAYMENT_PENDING + STRIPE/COMPLETED) and one was an older request approved but never paid. The
 * paid cards were badged "Awaiting payment" and the unpaid one "Approved", so the owner read the
 * unpaid card's "Waiting for the renter to choose a payment method" as the paid booking's status -
 * while the notification said "Payment confirmed". Every card must now say what its own payment
 * row says, in the badge and in the note.
 */

const LIVE_ROWS = [
  {
    // cmux4ckqh000006jyd451kytr - 27-29 Oct, Rs 1,500
    status: BookingStatus.APPROVED,
    payment: null,
    totalPrice: 1_500,
    securityDeposit: 0,
  },
  {
    // cmvpfdkld000408l98t1hf946 - 31 Oct - 7 Nov, Rs 3,500
    status: BookingStatus.PAYMENT_PENDING,
    payment: {
      provider: PaymentProvider.STRIPE,
      status: PaymentStatus.COMPLETED,
    },
    totalPrice: 3_500,
    securityDeposit: 0,
  },
  {
    // cmvpg6hxk000007l6d4550zdy - 11-30 Nov, Rs 9,000
    status: BookingStatus.PAYMENT_PENDING,
    payment: {
      provider: PaymentProvider.STRIPE,
      status: PaymentStatus.COMPLETED,
    },
    totalPrice: 9_000,
    securityDeposit: 0,
  },
] as const;

describe("live Wedding dress regression", () => {
  it("badges and notes every paid card as paid, and only the unpaid one as unpaid", () => {
    const [unpaid, ...paid] = LIVE_ROWS;

    for (const row of paid) {
      const badge = bookingBadge(row.status, row.payment);
      const note = ownerPaymentNote(ownerPaymentView(row.payment), row);

      expect(badge.label).toBe("Paid · ready for pickup");
      expect(badge.label).not.toMatch(/awaiting payment/i);
      expect(note).toMatch(/payment confirmed/i);
      expect(note).toMatch(/paid SamaanShare by card/i);
      expect(note).not.toMatch(/choose a payment method/i);
    }

    expect(bookingBadge(unpaid.status, unpaid.payment).label).toBe(
      "Approved · not paid yet"
    );
    expect(ownerPaymentNote(ownerPaymentView(unpaid.payment), unpaid)).toMatch(
      /choose a payment method/i
    );
  });
});

describe("bookingBadge", () => {
  it("labels a card payment in progress and a failed one", () => {
    expect(
      bookingBadge(BookingStatus.PAYMENT_PENDING, {
        provider: PaymentProvider.STRIPE,
        status: PaymentStatus.PROCESSING,
      }).label
    ).toBe("Card payment processing");

    expect(
      bookingBadge(BookingStatus.PAYMENT_PENDING, {
        provider: PaymentProvider.STRIPE,
        status: PaymentStatus.FAILED,
      })
    ).toEqual({ label: "Card payment failed", variant: "destructive" });
  });

  it("marks a verified bank transfer as paid too", () => {
    expect(
      bookingBadge(BookingStatus.PAYMENT_PENDING, {
        provider: PaymentProvider.OFFLINE,
        status: PaymentStatus.COMPLETED,
      }).label
    ).toBe("Paid · ready for pickup");
  });

  /** The manual flow before verification is unchanged. */
  it("keeps 'Awaiting payment' for an unverified bank transfer", () => {
    for (const status of [
      PaymentStatus.AWAITING_CONFIRMATION,
      PaymentStatus.PENDING_VERIFICATION,
      PaymentStatus.REJECTED,
    ]) {
      expect(
        bookingBadge(BookingStatus.PAYMENT_PENDING, {
          provider: PaymentProvider.OFFLINE,
          status,
        }).label
      ).toBe("Awaiting payment");
    }
  });

  /** Once the rental has moved on, the booking status is the headline, whatever the payment. */
  it("ignores the payment outside PAYMENT_PENDING", () => {
    const paid = {
      provider: PaymentProvider.STRIPE,
      status: PaymentStatus.COMPLETED,
    };

    expect(bookingBadge(BookingStatus.ACTIVE, paid).label).toBe("Rented out");
    expect(bookingBadge(BookingStatus.CANCELLED, paid).label).toBe("Cancelled");
  });

  it("covers every booking status", () => {
    for (const status of Object.values(BookingStatus)) {
      expect(bookingBadge(status, null).label).toBeTruthy();
    }
  });
});
