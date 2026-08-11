import { BookingStatus, PaymentStatus } from "@/generated/prisma/enums";

/**
 * Booking state rules.
 *
 * Pure, so the transition table and the expiry cutoff are unit-testable without a database.
 * The actions apply these; nothing here queries.
 */

/**
 * How long a request waits for the owner before it expires.
 *
 * 48 hours, per docs/TODO.md. The window matters more than it looks: a PENDING request holds
 * the dates, so this is also how long one renter can keep an owner's calendar occupied
 * without an answer.
 */
export const PENDING_EXPIRY_HOURS = 48;

/**
 * Whether a request has outlived the window.
 *
 * `now` is injected rather than read from the clock so this is testable and so a single sweep
 * evaluates every booking against one instant.
 */
export function isPendingExpired(createdAt: Date, now: Date): boolean {
  return (
    now.getTime() - createdAt.getTime() >= PENDING_EXPIRY_HOURS * 3_600_000
  );
}

/** The cutoff `createdAt` for a sweep: anything at or before this has expired. */
export function pendingExpiryCutoff(now: Date): Date {
  return new Date(now.getTime() - PENDING_EXPIRY_HOURS * 3_600_000);
}

/**
 * Which statuses a booking may move to next.
 *
 * A table rather than scattered conditionals, for the same reason the listing statuses use
 * one: the rules are readable in a single place and adding a state fails at the type level
 * rather than silently permitting everything.
 *
 * Note what CANNOT happen. `ACTIVE` has no path to `CANCELLED`: once the item has physically
 * changed hands there is nothing to cancel, only a return to complete, and offering a Cancel
 * button there would leave a rental with no ending and dates released while the item is still
 * out. `COMPLETED` reaches only `REVIEWED`, so a finished rental can never be reopened.
 */
export const ALLOWED_BOOKING_TRANSITIONS: Readonly<
  Record<BookingStatus, readonly BookingStatus[]>
> = {
  [BookingStatus.PENDING]: [
    BookingStatus.APPROVED,
    BookingStatus.DECLINED,
    BookingStatus.CANCELLED,
    BookingStatus.EXPIRED,
  ],
  // Approval moves straight to awaiting payment; the payment slice owns what follows.
  [BookingStatus.APPROVED]: [
    BookingStatus.PAYMENT_PENDING,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.PAYMENT_PENDING]: [
    BookingStatus.ACTIVE,
    BookingStatus.CANCELLED,
  ],
  [BookingStatus.ACTIVE]: [BookingStatus.COMPLETED],
  [BookingStatus.COMPLETED]: [BookingStatus.REVIEWED],
  // Terminal.
  [BookingStatus.REVIEWED]: [],
  [BookingStatus.DECLINED]: [],
  [BookingStatus.CANCELLED]: [],
  [BookingStatus.EXPIRED]: [],
};

/**
 * Statuses whose bookings still occupy their dates.
 *
 * The single source of truth for "is this booking holding the calendar". A booking in any of
 * these keeps its `UnavailableDate` rows; anything else has released them. Getting this list
 * wrong in either direction is a real failure - too narrow allows a double booking, too wide
 * leaves an owner's calendar blocked by a declined request.
 *
 * PENDING is included deliberately: a request reserves the dates while the owner decides, so
 * two renters cannot both be told yes. The 48-hour expiry is what stops that reservation
 * becoming indefinite.
 */
export const DATE_HOLDING_STATUSES = [
  BookingStatus.PENDING,
  BookingStatus.APPROVED,
  BookingStatus.PAYMENT_PENDING,
  BookingStatus.ACTIVE,
] as const;

/** Whether a booking in this status is still occupying its dates. */
export function holdsDates(status: BookingStatus): boolean {
  return (DATE_HOLDING_STATUSES as readonly BookingStatus[]).includes(status);
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_BOOKING_TRANSITIONS[from].includes(to);
}

/** Whether a booking has reached a state no action can move it out of. */
export function isTerminal(status: BookingStatus): boolean {
  return ALLOWED_BOOKING_TRANSITIONS[status].length === 0;
}

/** The outcome of a cancellation eligibility check, with the reason when refused. */
export type CancelEligibility =
  { allowed: true } | { allowed: false; reason: string };

interface RenterCancelInput {
  status: BookingStatus;
  /** `null` when no `Payment` row exists yet - the renter has not chosen how to pay. */
  paymentStatus: PaymentStatus | null;
}

/**
 * Whether the renter may still cancel, and why not when they may not.
 *
 * THE PAYMENT RULE IS THE IMPORTANT ONE. Cancelling before the owner has confirmed receiving
 * money is free: nothing has moved, so the dates go back and both sides are where they started.
 * Once the owner has confirmed receipt, the cash or the transfer is in *their* hands and
 * SamaanShare is nowhere in the money path - payment is offline in this phase. A Cancel button
 * there would imply a refund the platform cannot perform, and the renter would discover that
 * only after clicking it. So it is refused, with the only honest instruction available: talk to
 * the owner.
 *
 * That reasoning is why this takes the payment status rather than inferring from the booking
 * status alone. PAYMENT_PENDING covers both "method chosen, nothing paid" and "paid, owner has
 * confirmed", and those two are on opposite sides of this rule.
 *
 * Pure and total over the enum, so a new status has to be classified here rather than falling
 * through to permitted.
 */
export function canRenterCancel({
  status,
  paymentStatus,
}: RenterCancelInput): CancelEligibility {
  switch (status) {
    case BookingStatus.PENDING:
    case BookingStatus.APPROVED:
      return { allowed: true };

    case BookingStatus.PAYMENT_PENDING:
      return paymentStatus === PaymentStatus.COMPLETED
        ? {
            allowed: false,
            reason:
              "The owner has already confirmed receiving your payment, so this cannot be cancelled here. Contact the owner to sort out the money directly - SamaanShare does not hold it.",
          }
        : { allowed: true };

    case BookingStatus.ACTIVE:
      return {
        allowed: false,
        reason:
          "This rental has already started. Return the item to the owner and they will mark it complete.",
      };

    case BookingStatus.COMPLETED:
    case BookingStatus.REVIEWED:
      return { allowed: false, reason: "This rental has already finished." };

    case BookingStatus.DECLINED:
    case BookingStatus.CANCELLED:
    case BookingStatus.EXPIRED:
      return {
        allowed: false,
        reason: "This booking is already closed.",
      };
  }
}

/**
 * Whether the item may be marked as collected.
 *
 * Gated on the payment being confirmed, not merely arranged. The owner is the one handing over
 * an item worth many times the rental, and `PAYMENT_PENDING` with an unconfirmed `Payment` row
 * means the renter has only said how they intend to pay.
 *
 * THIS IS ALSO WHERE THE TRUST & SAFETY HANDOVER RECORD WILL BE REQUIRED. When that lands, a
 * sealed pickup record becomes a second condition here rather than a rewrite of the action:
 * the guard is already the single place that decides whether a pickup may proceed.
 */
export function canStartBooking({
  status,
  paymentStatus,
}: RenterCancelInput): CancelEligibility {
  if (status !== BookingStatus.PAYMENT_PENDING) {
    return {
      allowed: false,
      reason:
        status === BookingStatus.APPROVED
          ? "The renter has not chosen how to pay yet."
          : "This booking is not ready for collection.",
    };
  }

  if (paymentStatus !== PaymentStatus.COMPLETED) {
    return {
      allowed: false,
      reason:
        "Confirm you have received the rental payment before marking the item as collected.",
    };
  }

  return { allowed: true };
}
