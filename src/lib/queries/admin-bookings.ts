import { BookingStatus } from "@/generated/prisma/enums";
import { depositState } from "@/lib/bookings/deposit";
import { isPendingExpired } from "@/lib/bookings/lifecycle";
import { AWAITING_ACTION_STATUSES } from "@/lib/bookings/timeline";
import {
  claimResponseDueAt,
  isClaimOpen,
  upheldAmount,
} from "@/lib/claims/rules";
import { prisma } from "@/lib/prisma";

import type { Prisma } from "@/generated/prisma/client";
import type {
  ClaimReason,
  ClaimStatus,
  HandoverCondition,
  HandoverConfirmation,
  HandoverType,
  PaymentMethod,
  PaymentStatus,
  UserStatus,
} from "@/generated/prisma/enums";
import type { DepositState } from "@/lib/bookings/deposit";
import type { PaginatedResult } from "@/types";

/**
 * Booking oversight for the admin area. Read-only, and that is a design decision rather than a
 * scope cut.
 *
 * EVERY ACTION ON A BOOKING BELONGS TO ONE OF THE TWO PARTIES. Approving, declining, cancelling,
 * confirming that cash arrived, recording a handover, marking the deposit returned - each is
 * somebody asserting something about their own rental, and an administrator doing it for them would
 * write that assertion under the wrong name. `Booking` has no actor column on most transitions
 * (`cancelledById` is the exception, and exists precisely because the question "who did this" could
 * not otherwise be answered), so an admin-driven transition would be indistinguishable from the
 * owner's own. The platform's actual levers sit elsewhere and are all audited: the claims queue
 * settles a disputed deposit, the reports queue takes a listing down, the members screen suspends an
 * account.
 *
 * So this exists to answer "what happened", which is what a support conversation or a deposit
 * dispute needs, and it deliberately cannot change the answer.
 *
 * NOTHING HERE SWEEPS. `getRenterBookings` and `getOwnerBookingRequests` both run
 * `expireStalePendingBookings`, `releaseDueReviews` and `escalateOverdueClaims` before reading,
 * because a list that offers an action has to tell the truth at the moment it renders. This one
 * offers no actions, and an oversight screen that mutates the thing it is reporting on is a screen
 * that cannot be trusted as evidence - an administrator opening a booking would change its history
 * by looking at it. Stale rows are surfaced honestly instead: see `isPastPendingWindow`.
 */

/** Bookings per page. Matches the other admin queues. */
export const ADMIN_BOOKINGS_PAGE_SIZE = 20;

/** One party, as an oversight screen needs them. */
export interface AdminBookingParty {
  id: string;
  name: string | null;
  /**
   * Their standing. A booking between two active accounts reads very differently from one whose
   * renter has since been banned, and that is often the first thing a support question turns on.
   */
  status: UserStatus;
  isDeleted: boolean;
}

export interface AdminBookingSummary {
  id: string;
  status: BookingStatus;
  startDate: Date;
  endDate: Date;
  totalPrice: number;
  securityDeposit: number;
  createdAt: Date;
  updatedAt: Date;
  listing: { id: string; title: string; city: string };
  renter: AdminBookingParty;
  owner: AdminBookingParty;
  /** `null` until the renter has chosen how to pay. */
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    confirmedAt: Date | null;
  } | null;
  /** Where the deposit stands, measured against one instant for the whole page. */
  deposit: DepositState;
  /** The claim's status, or `null` - which is the overwhelming majority of rentals. */
  claimStatus: ClaimStatus | null;
  /**
   * A PENDING request already past the 48-hour window.
   *
   * Shown rather than swept. The sweep belongs to the parties' own screens - it notifies both sides
   * and releases the calendar, which is not something a support lookup should trigger - so this
   * screen reports the row as it stands and says that it is due to expire. An administrator asked
   * "why is this still pending" gets the true answer: nobody has looked at it yet.
   */
  isPastPendingWindow: boolean;
}

interface AdminBookingSearchOptions {
  /** Booking id, listing title, or either party's name or email. */
  query?: string | undefined;
  status?: BookingStatus | undefined;
  /** Rentals overlapping this range, not bookings created in it - see the note below. */
  from?: Date | undefined;
  to?: Date | undefined;
  listingId?: string | undefined;
  /** Either side. "This member's rentals" means the ones they are party to, not the ones they own. */
  userId?: string | undefined;
  /** Only bookings waiting on one of the two parties. */
  awaitingOnly?: boolean | undefined;
  page?: number;
  pageSize?: number;
}

const partySelect = {
  select: { id: true, name: true, status: true, deletedAt: true },
} as const;

const summarySelect = {
  id: true,
  status: true,
  startDate: true,
  endDate: true,
  totalPrice: true,
  securityDeposit: true,
  createdAt: true,
  updatedAt: true,
  // Needed by `depositState`: the return clock is measured from when the rental completed.
  completedAt: true,
  listing: { select: { id: true, title: true, city: true } },
  renter: partySelect,
  owner: partySelect,
  payment: {
    select: {
      method: true,
      status: true,
      confirmedAt: true,
      securityDeposit: true,
      depositReturnedAt: true,
    },
  },
  claim: {
    select: {
      status: true,
      amountClaimed: true,
      amountUpheld: true,
      filedAt: true,
    },
  },
} as const;

/**
 * One page of bookings, newest request first.
 *
 * THE DATE FILTER MATCHES THE RENTAL PERIOD, NOT `createdAt`. The support question is "the rental of
 * the 12th" - somebody is on the phone about an item they had that week - and a booking made in June
 * for a rental in August would be missing from a June-to-June search of creation dates. So a booking
 * matches when its period overlaps the range at all, which is the same overlap test the availability
 * calendar uses.
 *
 * EMAIL IS SEARCHED, and selected nowhere on this screen. A support request arrives as an email
 * address far more often than as a booking id, and matching on it is the only way to get from "this
 * person wrote in" to their rentals. The address itself is not rendered in the list - it is a
 * lookup key here, not a column.
 */
export async function searchAdminBookings({
  query,
  status,
  from,
  to,
  listingId,
  userId,
  awaitingOnly,
  page = 1,
  pageSize = ADMIN_BOOKINGS_PAGE_SIZE,
}: AdminBookingSearchOptions = {}): Promise<
  PaginatedResult<AdminBookingSummary>
> {
  const trimmed = query?.trim() ?? "";
  const currentPage = Math.max(1, Math.trunc(page));

  /**
   * One status clause, not two.
   *
   * An explicit status wins over `awaitingOnly`. Spreading both would have the second silently
   * overwrite the first, so a link that somehow carried `status=completed&awaiting=true` would
   * return the opposite of what it said.
   */
  const statusWhere: Prisma.BookingWhereInput =
    status !== undefined
      ? { status }
      : awaitingOnly
        ? { status: { in: [...AWAITING_ACTION_STATUSES] } }
        : {};

  const where: Prisma.BookingWhereInput = {
    ...statusWhere,
    ...(listingId ? { listingId } : {}),
    // Either side, so one link from a member's screen answers "what has this person been part of".
    ...(userId ? { OR: [{ renterId: userId }, { ownerId: userId }] } : {}),
    // Overlap, not containment: a rental spanning the whole range must match a search inside it.
    ...(to ? { startDate: { lte: to } } : {}),
    ...(from ? { endDate: { gte: from } } : {}),
    ...(trimmed.length > 0
      ? {
          AND: [
            {
              OR: [
                // Exact, not `contains`: a cuid fragment matching another booking's id is noise, and
                // the whole id is what a support ticket carries.
                { id: trimmed },
                {
                  listing: {
                    title: { contains: trimmed, mode: "insensitive" as const },
                  },
                },
                { renter: partyMatch(trimmed) },
                { owner: partyMatch(trimmed) },
              ],
            },
          ],
        }
      : {}),
  };

  // Concurrent reads rather than a transaction - see the note in `getActiveListings`.
  const [rows, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: summarySelect,
    }),
    prisma.booking.count({ where }),
  ]);

  // One instant for the whole page, so deposit countdowns cannot contradict the ordering.
  const now = new Date();

  return {
    items: rows.map((row) => toSummary(row, now)),
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** A name-or-email match on one side of the booking. */
function partyMatch(term: string): Prisma.UserWhereInput {
  return {
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { email: { contains: term, mode: "insensitive" } },
    ],
  };
}

type SummaryRow = Prisma.BookingGetPayload<{ select: typeof summarySelect }>;

function toSummary(row: SummaryRow, now: Date): AdminBookingSummary {
  return {
    id: row.id,
    status: row.status,
    startDate: row.startDate,
    endDate: row.endDate,
    totalPrice: row.totalPrice,
    securityDeposit: row.securityDeposit,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    listing: row.listing,
    renter: toParty(row.renter),
    owner: toParty(row.owner),
    payment: row.payment
      ? {
          method: row.payment.method,
          status: row.payment.status,
          confirmedAt: row.payment.confirmedAt,
        }
      : null,
    deposit: depositState({
      // Falls back to the booking's captured figure when no payment row exists yet, matching
      // `toSummary` in queries/bookings.ts - otherwise a real deposit reports as "none".
      securityDeposit: row.payment?.securityDeposit ?? row.securityDeposit,
      completedAt: row.completedAt ?? null,
      depositReturnedAt: row.payment?.depositReturnedAt ?? null,
      claim: toDepositClaim(row.claim),
      now,
    }),
    claimStatus: row.claim?.status ?? null,
    isPastPendingWindow:
      row.status === BookingStatus.PENDING &&
      isPendingExpired(row.createdAt, now),
  };
}

function toParty(party: {
  id: string;
  name: string | null;
  status: UserStatus;
  deletedAt: Date | null;
}): AdminBookingParty {
  return {
    id: party.id,
    name: party.name,
    status: party.status,
    isDeleted: party.deletedAt !== null,
  };
}

/**
 * The claim's effect on the deposit, reduced to the two facts `depositState` needs.
 *
 * Identical to the reasoning in `queries/bookings.ts`: `upheldAmount` returns null while a claim is
 * live, so an unsettled demand deducts nothing - the platform does not act on one party's assertion
 * - and the pause is supplied only while the claim is still open, so a lapsed pause hands back null
 * and the clock resumes.
 */
function toDepositClaim(
  claim: {
    status: ClaimStatus;
    amountClaimed: number;
    amountUpheld: number | null;
    filedAt: Date;
  } | null
) {
  return claim
    ? {
        amountUpheld: upheldAmount(claim.status, claim.amountUpheld),
        amountClaimed: claim.amountClaimed,
        pauseEndsAt: isClaimOpen(claim.status)
          ? claimResponseDueAt(claim.filedAt)
          : null,
      }
    : null;
}

/** One handover condition record, as an administrator reads it. */
export interface AdminHandoverRecord {
  id: string;
  type: HandoverType;
  condition: HandoverCondition;
  notes: string | null;
  recordedAt: Date;
  recordedBy: { id: string; name: string | null };
  confirmation: HandoverConfirmation;
  confirmedAt: Date | null;
  confirmationNote: string | null;
  photos: { id: string; url: string }[];
}

/** The deposit claim, if one was filed. */
export interface AdminBookingClaim {
  id: string;
  reason: ClaimReason;
  description: string;
  amountClaimed: number;
  amountUpheld: number | null;
  status: ClaimStatus;
  filedAt: Date;
  claimant: { id: string; name: string | null };
  respondedAt: Date | null;
  responseNote: string | null;
  resolution: string | null;
  resolvedAt: Date | null;
  resolvedBy: { name: string | null } | null;
}

/**
 * One review on this booking.
 *
 * BOTH REVIEWS ARE VISIBLE HERE, including one still withheld pending its counterpart. Reciprocal
 * withholding exists so neither party can write in response to what the other said - it is a rule
 * about the two of them, not a secret from the platform - and the moderation queue already hydrates
 * unpublished reviews for exactly this reason. A dispute where one side's review is the evidence
 * would otherwise be undecidable.
 */
export interface AdminBookingReview {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  publishedAt: Date | null;
  removedAt: Date | null;
  reviewer: { id: string; name: string | null };
}

export interface AdminBookingDetail extends AdminBookingSummary {
  notes: string | null;
  pickupInstructions: string | null;
  statusReason: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  /** Which side cancelled. `statusReason` is free text and cannot answer it. */
  cancelledByRole: "renter" | "owner" | "someone else" | null;
  cancelledByName: string | null;
  /** Both addresses, selected only on this screen - the lookup key support works from. */
  renterEmail: string;
  ownerEmail: string;
  /** The payment record in full, or `null` before the renter chose a method. */
  paymentDetail: {
    method: PaymentMethod;
    status: PaymentStatus;
    amount: number;
    securityDeposit: number;
    confirmedAt: Date | null;
    confirmedByName: string | null;
    depositReturnedAt: Date | null;
    transactionRef: string | null;
  } | null;
  handovers: AdminHandoverRecord[];
  claim: AdminBookingClaim | null;
  reviews: AdminBookingReview[];
  /** Days this booking is still holding on the listing's calendar. */
  heldDateCount: number;
}

/**
 * One booking, with everything recorded about it.
 *
 * `null` for an id that does not exist, so the route can turn it into a real 404 from its layout
 * rather than rendering an empty screen - see the invariant in AGENTS.md.
 *
 * NOTHING IS FILTERED BY VISIBILITY. A booking on a removed listing, or between two banned accounts,
 * is precisely the one that generates a support ticket - and the deposit on it is still owed to
 * somebody.
 */
export async function getAdminBookingDetail(
  id: string
): Promise<AdminBookingDetail | null> {
  const row = await prisma.booking.findUnique({
    where: { id },
    select: {
      ...summarySelect,
      notes: true,
      pickupInstructions: true,
      statusReason: true,
      startedAt: true,
      completedAt: true,
      cancelledAt: true,
      cancelledById: true,
      cancelledBy: { select: { id: true, name: true } },
      renter: { select: { ...partySelect.select, email: true } },
      owner: { select: { ...partySelect.select, email: true } },
      payment: {
        select: {
          method: true,
          status: true,
          amount: true,
          securityDeposit: true,
          confirmedAt: true,
          confirmedBy: { select: { name: true } },
          depositReturnedAt: true,
          transactionRef: true,
        },
      },
      claim: {
        select: {
          id: true,
          reason: true,
          description: true,
          amountClaimed: true,
          amountUpheld: true,
          status: true,
          filedAt: true,
          claimant: { select: { id: true, name: true } },
          respondedAt: true,
          responseNote: true,
          resolution: true,
          resolvedAt: true,
          resolvedBy: { select: { name: true } },
        },
      },
      handovers: {
        orderBy: { recordedAt: "asc" },
        select: {
          id: true,
          type: true,
          condition: true,
          notes: true,
          recordedAt: true,
          recordedBy: { select: { id: true, name: true } },
          confirmation: true,
          confirmedAt: true,
          confirmationNote: true,
          photos: { select: { id: true, url: true } },
        },
      },
      reviews: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          rating: true,
          comment: true,
          createdAt: true,
          publishedAt: true,
          removedAt: true,
          reviewer: { select: { id: true, name: true } },
        },
      },
      _count: { select: { heldDates: true } },
    },
  });

  if (!row) {
    return null;
  }

  const now = new Date();

  /**
   * Which side cancelled, named by role rather than by identity.
   *
   * "Cancelled by the renter" is the fact that decides what happened; the name is shown separately.
   * `someone else` covers a cancellation attributed to neither party - not reachable through the
   * current actions, but the column is a plain foreign key and a timeline that silently called a
   * third party "the renter" would be worse than one that admits it does not know.
   */
  const cancelledByRole = row.cancelledById
    ? row.cancelledById === row.renter.id
      ? ("renter" as const)
      : row.cancelledById === row.owner.id
        ? ("owner" as const)
        : ("someone else" as const)
    : null;

  return {
    ...toSummary(row, now),
    notes: row.notes,
    pickupInstructions: row.pickupInstructions,
    statusReason: row.statusReason,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    cancelledByRole,
    cancelledByName: row.cancelledBy?.name ?? null,
    renterEmail: row.renter.email,
    ownerEmail: row.owner.email,
    paymentDetail: row.payment
      ? {
          method: row.payment.method,
          status: row.payment.status,
          amount: row.payment.amount,
          securityDeposit: row.payment.securityDeposit,
          confirmedAt: row.payment.confirmedAt,
          confirmedByName: row.payment.confirmedBy?.name ?? null,
          depositReturnedAt: row.payment.depositReturnedAt,
          transactionRef: row.payment.transactionRef,
        }
      : null,
    handovers: row.handovers,
    claim: row.claim,
    reviews: row.reviews,
    heldDateCount: row._count.heldDates,
  };
}

/**
 * How many bookings are waiting on one of the two parties.
 *
 * Read by the queue so the count reflects the whole table rather than the current page. Not a
 * moderation backlog - nobody here is expected to act on these - but it is the number that answers
 * "is the marketplace moving", which is the only operational question this screen can answer without
 * offering a button it must not have.
 */
export async function getAwaitingActionBookingCount(): Promise<number> {
  return prisma.booking.count({
    where: { status: { in: [...AWAITING_ACTION_STATUSES] } },
  });
}
