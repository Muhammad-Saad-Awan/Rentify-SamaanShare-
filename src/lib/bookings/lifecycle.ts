import { BookingStatus } from "@/generated/prisma/enums";

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
 * Only the transitions the spine implements are populated. The later ones - ACTIVE from
 * PAYMENT_PENDING, COMPLETED, REVIEWED - land with the payment and completion slices; leaving
 * them empty means an action cannot half-implement them by accident.
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
