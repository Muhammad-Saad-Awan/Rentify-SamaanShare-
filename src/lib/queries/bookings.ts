import { BookingStatus } from "@/generated/prisma/enums";
import { depositState } from "@/lib/bookings/deposit";
import { expireStalePendingBookings } from "@/lib/bookings/expire";
import { canRenterCancel, canStartBooking } from "@/lib/bookings/lifecycle";
import { releaseDueReviews } from "@/lib/reviews/release";
import { canReviewBooking } from "@/lib/reviews/rules";
import { prisma } from "@/lib/prisma";
import { LISTINGS_PAGE_SIZE } from "@/lib/queries/listings";

import type { DepositState } from "@/lib/bookings/deposit";
import type { CancelEligibility } from "@/lib/bookings/lifecycle";
import type { ReviewEligibility } from "@/lib/reviews/rules";
import { HandoverConfirmation } from "@/generated/prisma/enums";

import type {
  HandoverCondition,
  HandoverType,
  PaymentMethod,
  PaymentStatus,
} from "@/generated/prisma/enums";
import type { PaginatedResult } from "@/types";

/**
 * Read-only booking queries for the two dashboards.
 *
 * Both sweep expired requests before reading. That is the other half of lazy expiry: without
 * it an owner would see a 3-day-old request as still actionable, click approve, and get an
 * error - the sweep makes the list tell the truth at the moment it is rendered.
 */

export interface BookingSummary {
  id: string;
  status: BookingStatus;
  startDate: Date;
  endDate: Date;
  totalPrice: number;
  securityDeposit: number;
  notes: string | null;
  pickupInstructions: string | null;
  statusReason: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  listing: {
    id: string;
    title: string;
    city: string;
    imageUrl: string | null;
  };
  /** The other party: the owner for a renter's view, the renter for an owner's. */
  counterparty: { name: string | null };
  /** `null` until the renter has chosen how to pay. */
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    confirmedAt: Date | null;
  } | null;
  /**
   * Where the security deposit stands, computed server-side.
   *
   * Derived here rather than in the card because it depends on the current time, and a countdown
   * evaluated in the browser against server-rendered HTML is a hydration mismatch. Every row in
   * one list is measured against the same instant.
   */
  deposit: DepositState;
  /**
   * What each side is allowed to do next, decided by the pure lifecycle rules.
   *
   * Pre-computed so the card renders permissions rather than re-deriving them. The action still
   * enforces every one of these independently - these exist to keep the UI from offering a button
   * that would only fail, not to be the check.
   */
  eligibility: {
    renterCanCancel: CancelEligibility;
    ownerCanStart: CancelEligibility;
  };
  /**
   * Review state for the viewer of this row.
   *
   * `counterpart` is populated ONLY once the review has been released. That filter is applied here,
   * on the server, rather than in the card: a withheld review that crossed to the client would be
   * readable in the RSC payload regardless of what the UI chose to render, and reciprocal
   * withholding would be decorative.
   */
  /** Pickup and return condition records, oldest first. At most one of each. */
  handovers: HandoverSnapshot[];
  review: {
    /** Whether this viewer may write one now, and why not if they may not. */
    canWrite: ReviewEligibility;
    /** What this viewer wrote, if anything. Always visible to its own author. */
    mine: ReviewSnapshot | null;
    /** What the other party wrote about this viewer - released reviews only. */
    counterpart: ReviewSnapshot | null;
  };
}

export interface ReviewSnapshot {
  rating: number;
  comment: string | null;
  createdAt: Date;
  /** `null` means written but still withheld pending the counterpart. */
  publishedAt: Date | null;
  /**
   * When a moderator removed it. Only ever set on a review the viewer wrote themselves.
   *
   * A removed review never reaches the other party at all - see `counterpart` below - but its author
   * is told, because the alternative is their words disappearing with no explanation and no way to
   * tell that from a bug.
   */
  removedAt: Date | null;
}

/** One handover condition record, as either party sees it. */
export interface HandoverSnapshot {
  id: string;
  type: HandoverType;
  condition: HandoverCondition;
  notes: string | null;
  recordedAt: Date;
  /** Whether the viewer wrote this record, which decides whether they may answer it. */
  isMine: boolean;
  confirmation: HandoverConfirmation;
  confirmedAt: Date | null;
  /** The answering party's own account, when they left one. */
  confirmationNote: string | null;
  photos: { id: string; url: string }[];
  /**
   * Whether this viewer can still answer it.
   *
   * Computed here rather than in the card, so the button and the action agree about who may answer -
   * the action refuses an author answering their own record, and a card that offered the control
   * anyway would be a button that always fails.
   */
  canConfirm: boolean;
}

/**
 * Selection shared by both dashboards.
 *
 * One projection rather than two, so the card component can render either side. Note the
 * counterparty selects `name` only - never `email`, which would be a privacy leak on a screen
 * that only needs to say who you are dealing with.
 */
const bookingSelect = {
  id: true,
  status: true,
  startDate: true,
  endDate: true,
  totalPrice: true,
  securityDeposit: true,
  notes: true,
  pickupInstructions: true,
  statusReason: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  listing: {
    select: {
      id: true,
      title: true,
      city: true,
      images: { orderBy: { order: "asc" }, take: 1, select: { url: true } },
    },
  },
  renter: { select: { name: true } },
  owner: { select: { name: true } },
  /**
   * The payment, for the status the two dashboards branch on.
   *
   * `securityDeposit` comes from the payment rather than the booking, because the deposit clock
   * is about the money actually arranged - the two agree today, and reading the one the deposit
   * state is derived from keeps them from silently disagreeing later.
   */
  payment: {
    select: {
      method: true,
      status: true,
      confirmedAt: true,
      securityDeposit: true,
      depositReturnedAt: true,
    },
  },
  // Both sides' reviews. Which of them the viewer is allowed to see is decided in `toSummary`.
  //
  // Moderator-removed reviews are fetched rather than filtered out here, which is deliberate. The
  // row is still what `@@unique([bookingId, reviewerId])` is protecting, so dropping it would make
  // `alreadyReviewed` false and offer the author a form whose submission the database refuses.
  // Whether a removed review is *readable* is decided below, per viewer.
  reviews: {
    select: {
      reviewerId: true,
      rating: true,
      comment: true,
      createdAt: true,
      publishedAt: true,
      removedAt: true,
    },
  },
  /**
   * The condition records for this rental. Both sides see both, in full.
   *
   * No withholding here, unlike reviews. A condition record is a statement about the item one party
   * has already made to the platform, and the other party is being asked to agree or disagree with
   * it - which they cannot do without reading it. The reciprocal-release argument does not apply,
   * because there is no second record to be influenced by writing.
   */
  handovers: {
    orderBy: { recordedAt: "asc" },
    select: {
      id: true,
      type: true,
      condition: true,
      notes: true,
      recordedById: true,
      recordedAt: true,
      confirmation: true,
      confirmedAt: true,
      confirmationNote: true,
      photos: {
        orderBy: { order: "asc" },
        select: { id: true, url: true },
      },
    },
  },
} as const;

type BookingRow = {
  id: string;
  status: BookingStatus;
  startDate: Date;
  endDate: Date;
  totalPrice: number;
  securityDeposit: number;
  notes: string | null;
  pickupInstructions: string | null;
  statusReason: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  listing: {
    id: string;
    title: string;
    city: string;
    images: { url: string }[];
  };
  renter: { name: string | null };
  owner: { name: string | null };
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    confirmedAt: Date | null;
    securityDeposit: number;
    depositReturnedAt: Date | null;
  } | null;
  reviews: {
    reviewerId: string;
    rating: number;
    comment: string | null;
    createdAt: Date;
    publishedAt: Date | null;
    removedAt: Date | null;
  }[];
  handovers: {
    id: string;
    type: HandoverType;
    condition: HandoverCondition;
    notes: string | null;
    recordedById: string;
    recordedAt: Date;
    confirmation: HandoverConfirmation;
    confirmedAt: Date | null;
    confirmationNote: string | null;
    photos: { id: string; url: string }[];
  }[];
};

/**
 * Projects a row for one side of the booking.
 *
 * `now` is passed in rather than read here, so every row in a list is measured against a single
 * instant - otherwise two bookings completed seconds apart can render countdowns that contradict
 * their order.
 */
function toSummary(
  row: BookingRow,
  side: "renter" | "owner",
  now: Date,
  viewerId: string
): BookingSummary {
  const paymentStatus = row.payment?.status ?? null;

  const mine = row.reviews.find((review) => review.reviewerId === viewerId);
  const theirs = row.reviews.find((review) => review.reviewerId !== viewerId);

  const snapshot = (review: typeof mine): ReviewSnapshot | null =>
    review
      ? {
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt,
          publishedAt: review.publishedAt,
          removedAt: review.removedAt,
        }
      : null;

  return {
    id: row.id,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    totalPrice: row.totalPrice,
    securityDeposit: row.securityDeposit,
    notes: row.notes,
    pickupInstructions: row.pickupInstructions,
    statusReason: row.statusReason,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    listing: {
      id: row.listing.id,
      title: row.listing.title,
      city: row.listing.city,
      imageUrl: row.listing.images[0]?.url ?? null,
    },
    // A renter is shown the owner, and vice versa.
    counterparty: side === "renter" ? row.owner : row.renter,
    payment: row.payment
      ? {
          method: row.payment.method,
          status: row.payment.status,
          confirmedAt: row.payment.confirmedAt,
        }
      : null,
    deposit: depositState({
      // Falls back to the booking's captured figure when no payment exists yet, so a booking
      // awaiting payment still reports "not due" rather than "none" for a real deposit.
      securityDeposit: row.payment?.securityDeposit ?? row.securityDeposit,
      completedAt: row.completedAt,
      depositReturnedAt: row.payment?.depositReturnedAt ?? null,
      now,
    }),
    eligibility: {
      renterCanCancel: canRenterCancel({ status: row.status, paymentStatus }),
      ownerCanStart: canStartBooking({ status: row.status, paymentStatus }),
    },
    handovers: row.handovers.map((handover) => {
      const isMine = handover.recordedById === viewerId;

      return {
        id: handover.id,
        type: handover.type,
        condition: handover.condition,
        notes: handover.notes,
        recordedAt: handover.recordedAt,
        isMine,
        confirmation: handover.confirmation,
        confirmedAt: handover.confirmedAt,
        confirmationNote: handover.confirmationNote,
        photos: handover.photos,
        // Mirrors `canConfirmHandover`: the other party, and only while unanswered.
        canConfirm:
          !isMine && handover.confirmation === HandoverConfirmation.PENDING,
      };
    }),
    review: {
      canWrite: canReviewBooking({
        status: row.status,
        completedAt: row.completedAt,
        alreadyReviewed: Boolean(mine),
        now,
      }),
      mine: snapshot(mine),
      /**
       * The gate. A withheld counterpart review never leaves the server, and neither does a removed
       * one - moderation took it down, so the person it was written about is the last one who should
       * still be handed it.
       */
      counterpart:
        theirs?.publishedAt && !theirs.removedAt ? snapshot(theirs) : null,
    },
  };
}

interface PageOptions {
  userId: string;
  page?: number;
  pageSize?: number;
}

/**
 * The renter's own bookings, newest request first.
 *
 * Scoped by `renterId` from the session; no identifier for anyone else's bookings is accepted,
 * so there is nothing to tamper with.
 */
export async function getRenterBookings({
  userId,
  page = 1,
  pageSize = LISTINGS_PAGE_SIZE,
}: PageOptions): Promise<PaginatedResult<BookingSummary>> {
  // Two lazy sweeps, for the same reason: a list that offers an action, or hides a review, must
  // tell the truth at the moment it renders. Scoped to this user as reviewee - the reviews that
  // affect what they see here are the ones written about them.
  await expireStalePendingBookings();
  await releaseDueReviews(userId);

  const currentPage = Math.max(1, Math.trunc(page));
  const where = { renterId: userId };

  // Concurrent reads rather than a transaction: READ COMMITTED re-snapshots per statement, so
  // batching these gave no consistency guarantee - see the note in `getActiveListings`.
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: bookingSelect,
    }),
    prisma.booking.count({ where }),
  ]);

  // One instant for the whole page, so deposit countdowns cannot contradict the ordering.
  const now = new Date();

  return {
    items: rows.map((row) => toSummary(row, "renter", now, userId)),
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Requests on the owner's listings.
 *
 * Ordered with PENDING first, then newest, because the whole purpose of the screen is the ones
 * awaiting a decision - burying them under last month's completed rentals would defeat it.
 * `pendingCount` is returned alongside so the page can show how many need attention without
 * counting the current slice, which only covers one page.
 */
export async function getOwnerBookingRequests({
  userId,
  page = 1,
  pageSize = LISTINGS_PAGE_SIZE,
}: PageOptions): Promise<
  PaginatedResult<BookingSummary> & { pendingCount: number }
> {
  // Two lazy sweeps, for the same reason: a list that offers an action, or hides a review, must
  // tell the truth at the moment it renders. Scoped to this user as reviewee - the reviews that
  // affect what they see here are the ones written about them.
  await expireStalePendingBookings();
  await releaseDueReviews(userId);

  const currentPage = Math.max(1, Math.trunc(page));
  const where = { ownerId: userId };

  // Concurrent reads rather than a transaction - see the note in `getActiveListings`.
  const [rows, total, pendingCount] = await Promise.all([
    prisma.booking.findMany({
      where,
      /**
       * Pending first, then most recent.
       *
       * `status: "asc"` works because Postgres orders an enum by its DECLARATION order, not
       * alphabetically, and `BookingStatus` declares `PENDING` first. That is a real
       * dependency on the schema: reordering the enum would silently reshuffle this screen,
       * so the ordering is asserted by a test rather than trusted.
       */
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: bookingSelect,
    }),
    prisma.booking.count({ where }),
    prisma.booking.count({
      where: { ownerId: userId, status: BookingStatus.PENDING },
    }),
  ]);

  const now = new Date();

  return {
    items: rows.map((row) => toSummary(row, "owner", now, userId)),
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    pendingCount,
  };
}
