import { BookingStatus } from "@/generated/prisma/enums";

/**
 * A booking's history, reconstructed from what was actually recorded. Pure.
 *
 * WHY THIS IS RECONSTRUCTED RATHER THAN READ. There is no per-transition audit table for bookings,
 * and deliberately so: `admin_actions` records what *staff* do, and a booking's transitions are the
 * two parties acting on their own rental. What exists instead is a set of lifecycle timestamps -
 * `createdAt`, `startedAt`, `completedAt`, `cancelledAt`, the payment's `confirmedAt` and
 * `depositReturnedAt` - which the schema notes were added precisely because `updatedAt` cannot carry
 * them: every transition overwrites it.
 *
 * SO SOME TRANSITIONS ARE NOT RECOVERABLE, AND THIS SAYS SO RATHER THAN GUESSING. There is no
 * `approvedAt`, `declinedAt` or `expiredAt` column. For a booking that has moved on, when the owner
 * approved it is simply gone; for one sitting in a terminal state, `updatedAt` is the best available
 * answer and is marked `approximate` so nobody reads it as the recorded moment. Inventing a precise
 * timestamp from `updatedAt` would be worse than admitting the gap - a support conversation or a
 * deposit dispute is exactly where a confidently wrong time does damage.
 *
 * PURE, SO IT IS TESTABLE AND SO ONE INSTANT COVERS THE WHOLE PAGE. Nothing here reads the clock or
 * the database; the caller passes what it read.
 */

/** How each status reads on screen. A total record, so a new state fails `tsc` here. */
export const BOOKING_STATUS_LABELS: Readonly<Record<BookingStatus, string>> = {
  [BookingStatus.PENDING]: "Awaiting the owner",
  [BookingStatus.APPROVED]: "Approved",
  [BookingStatus.PAYMENT_PENDING]: "Awaiting payment",
  [BookingStatus.ACTIVE]: "Out on rent",
  [BookingStatus.COMPLETED]: "Returned",
  [BookingStatus.REVIEWED]: "Reviewed",
  [BookingStatus.DECLINED]: "Declined",
  [BookingStatus.CANCELLED]: "Cancelled",
  [BookingStatus.EXPIRED]: "Expired unanswered",
};

/** One thing that happened, with the time it was recorded. */
export interface BookingTimelineEntry {
  /** Stable key for rendering, and what the tests assert on. */
  kind: string;
  at: Date;
  label: string;
  /** The reason, the party, the amount - whatever the record carries. */
  detail: string | null;
  /**
   * True when `at` is the row's `updatedAt` rather than a timestamp recorded for this event.
   *
   * The screen prints this as "as last changed", so a decline shown against a time nobody stamped
   * cannot be quoted back as the moment it happened.
   */
  approximate: boolean;
}

/** An event from a related record - a handover, a claim, a review - already reduced to text. */
export interface BookingTimelineExtra {
  kind: string;
  at: Date;
  label: string;
  detail?: string | null;
}

export interface BookingTimelineInput {
  status: BookingStatus;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  /** Which side cancelled, when someone did. `statusReason` cannot answer this. */
  cancelledByRole: "renter" | "owner" | "someone else" | null;
  /** The decline or cancellation reason, which share one column by design. */
  statusReason: string | null;
  /** When the owner confirmed the offline payment arrived. */
  paymentConfirmedAt: Date | null;
  /** When the owner recorded the deposit as returned. */
  depositReturnedAt: Date | null;
  /** Handover records, claim milestones and reviews, folded in chronologically. */
  extra?: readonly BookingTimelineExtra[];
}

/**
 * Everything recorded about one booking, oldest first.
 *
 * Oldest-first, unlike every queue in this codebase. A queue is a list of unrelated items where the
 * newest matters most; this is one story, and a story told backwards is unreadable - "deposit
 * returned, item returned, item collected, paid, requested" forces the reader to reverse it in their
 * head while trying to work out what went wrong.
 *
 * Ties keep insertion order, which puts the lifecycle entries before related-record entries stamped
 * in the same transaction - a handover recorded as part of `startBooking` reads after the pickup it
 * describes rather than before it.
 */
export function buildBookingTimeline(
  input: BookingTimelineInput
): BookingTimelineEntry[] {
  const entries: BookingTimelineEntry[] = [
    {
      kind: "requested",
      at: input.createdAt,
      label: "Requested",
      detail: null,
      approximate: false,
    },
  ];

  const add = (
    kind: string,
    at: Date | null,
    label: string,
    detail: string | null = null
  ): void => {
    if (at) {
      entries.push({ kind, at, label, detail, approximate: false });
    }
  };

  add(
    "paid",
    input.paymentConfirmedAt,
    "Payment confirmed by the owner",
    // Named as the owner's assertion, not as a fact the platform verified. Payment is offline;
    // nothing here saw the money.
    "Offline payment - recorded by the owner, not verified by the platform"
  );
  add("started", input.startedAt, "Item collected");
  add("completed", input.completedAt, "Item returned");
  add(
    "cancelled",
    input.cancelledAt,
    input.cancelledByRole
      ? `Cancelled by the ${input.cancelledByRole}`
      : "Cancelled",
    input.statusReason
  );
  add("deposit-returned", input.depositReturnedAt, "Deposit returned");

  /**
   * The terminal statuses with no timestamp of their own: DECLINED and EXPIRED.
   *
   * Both end a booking and neither has a column. `updatedAt` is the last time anything changed on
   * the row, which for a terminal booking is almost always the transition itself - so it is shown,
   * marked approximate, rather than leaving the timeline stopping at "Requested" for a booking that
   * plainly ended.
   */
  if (
    input.status === BookingStatus.DECLINED ||
    input.status === BookingStatus.EXPIRED
  ) {
    entries.push({
      kind: input.status === BookingStatus.DECLINED ? "declined" : "expired",
      at: input.updatedAt,
      label:
        input.status === BookingStatus.DECLINED
          ? "Declined by the owner"
          : "Expired with no answer",
      detail: input.statusReason,
      approximate: true,
    });
  }

  for (const event of input.extra ?? []) {
    entries.push({
      kind: event.kind,
      at: event.at,
      label: event.label,
      detail: event.detail ?? null,
      approximate: false,
    });
  }

  // A stable sort, which `Array.prototype.sort` is required to be as of ES2019 - so equal
  // timestamps keep the insertion order the comment above depends on.
  return entries.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * The statuses where a booking is waiting on somebody.
 *
 * Used by the admin queue's "needs attention" view. Not the same as `holdsDates`: ACTIVE holds the
 * calendar and is *not* stuck - the item is out on rent, which is the system working - whereas
 * PENDING, APPROVED and PAYMENT_PENDING are all a booking waiting for a person, which is what a
 * support screen is asked about.
 */
export const AWAITING_ACTION_STATUSES = [
  BookingStatus.PENDING,
  BookingStatus.APPROVED,
  BookingStatus.PAYMENT_PENDING,
] as const;

/** Whether this booking is waiting on one of the two parties to do something. */
export function isAwaitingAction(status: BookingStatus): boolean {
  return (AWAITING_ACTION_STATUSES as readonly BookingStatus[]).includes(
    status
  );
}
