import {
  BookingStatus,
  PaymentProvider,
  PaymentStatus,
} from "@/generated/prisma/enums";

/**
 * The headline badge on a booking card, for both parties.
 *
 * WHY THE PAYMENT IS READ HERE. A booking stays `PAYMENT_PENDING` after its payment is confirmed -
 * verifying money is deliberately not starting a rental, and the status only moves at the
 * handover. Labelled from the status alone, a booking the renter had PAID read "Awaiting payment",
 * while an unpaid request for the same item read "Approved". On a live owner dashboard that put
 * the wrong card first in the reader's eye, contradicting the "Payment confirmed" notification
 * and the note inside the paid card. The payment row is the fact; the badge now says what it says.
 *
 * Pure, so the mapping is asserted without rendering.
 */

export type BadgeVariant = "default" | "secondary" | "outline" | "destructive";

export interface BookingBadge {
  label: string;
  variant: BadgeVariant;
}

const BY_STATUS: Record<BookingStatus, BookingBadge> = {
  [BookingStatus.PENDING]: { label: "Awaiting owner", variant: "secondary" },
  // Said outright: an approved booking has not been paid for, and an owner scanning a list of
  // requests for the same item must be able to tell it from one that has.
  [BookingStatus.APPROVED]: {
    label: "Approved · not paid yet",
    variant: "secondary",
  },
  [BookingStatus.PAYMENT_PENDING]: {
    label: "Awaiting payment",
    variant: "secondary",
  },
  [BookingStatus.ACTIVE]: { label: "Rented out", variant: "default" },
  [BookingStatus.COMPLETED]: { label: "Completed", variant: "outline" },
  [BookingStatus.REVIEWED]: { label: "Reviewed", variant: "outline" },
  [BookingStatus.DECLINED]: { label: "Declined", variant: "destructive" },
  [BookingStatus.CANCELLED]: { label: "Cancelled", variant: "outline" },
  [BookingStatus.EXPIRED]: { label: "Expired", variant: "outline" },
};

export function bookingBadge(
  status: BookingStatus,
  payment: { provider: PaymentProvider; status: PaymentStatus } | null
): BookingBadge {
  if (status !== BookingStatus.PAYMENT_PENDING || !payment) {
    return BY_STATUS[status];
  }

  if (payment.status === PaymentStatus.COMPLETED) {
    return { label: "Paid · ready for pickup", variant: "default" };
  }

  if (payment.provider === PaymentProvider.STRIPE) {
    return payment.status === PaymentStatus.FAILED
      ? { label: "Card payment failed", variant: "destructive" }
      : { label: "Card payment processing", variant: "secondary" };
  }

  // Bank transfer, not yet verified: unchanged.
  return BY_STATUS[BookingStatus.PAYMENT_PENDING];
}
