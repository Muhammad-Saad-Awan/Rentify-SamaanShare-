import { BookingStatus } from "@/generated/prisma/enums";
import { depositState } from "@/lib/bookings/deposit";
import { expireStalePendingBookings } from "@/lib/bookings/expire";
import { canRenterCancel, canStartBooking } from "@/lib/bookings/lifecycle";
import { prisma } from "@/lib/prisma";
import { LISTINGS_PAGE_SIZE } from "@/lib/queries/listings";

import type { DepositState } from "@/lib/bookings/deposit";
import type { CancelEligibility } from "@/lib/bookings/lifecycle";
import type { PaymentMethod, PaymentStatus } from "@/generated/prisma/enums";
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
  now: Date
): BookingSummary {
  const paymentStatus = row.payment?.status ?? null;

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
  await expireStalePendingBookings();

  const currentPage = Math.max(1, Math.trunc(page));
  const where = { renterId: userId };

  const [rows, total] = await prisma.$transaction([
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
    items: rows.map((row) => toSummary(row, "renter", now)),
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
  await expireStalePendingBookings();

  const currentPage = Math.max(1, Math.trunc(page));
  const where = { ownerId: userId };

  const [rows, total, pendingCount] = await prisma.$transaction([
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
    items: rows.map((row) => toSummary(row, "owner", now)),
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    pendingCount,
  };
}
