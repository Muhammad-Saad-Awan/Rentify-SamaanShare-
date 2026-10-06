import { BookingStatus, OfferStatus } from "@/generated/prisma/enums";
import { countRentalDays, MAX_BOOKING_DAYS } from "@/lib/bookings/pricing";

import type { ChatDecision, ParticipantRole } from "@/lib/chat/rules";

/**
 * Structured offers: the only route from negotiation to the money a booking carries. Pure.
 *
 * THE RULE THIS MODULE EXISTS FOR. Chat is free text and sets no terms. A price agreed in a message
 * is a conversation; a price on an Offer that the other party accepted is an agreement, and only the
 * second ever reaches `Booking.totalPrice` or `Booking.securityDeposit`.
 *
 * THREE GUARANTEES, each enforced twice - by these rules, and by the triggers in migration
 * `20261006120000_chat_and_offers`, so code that forgets a rule is refused by the database:
 *
 * 1. AN ACCEPTED OFFER IS A PERMANENT SNAPSHOT. The terms are written once and never change, and the
 *    offer leaves PENDING once. Nothing is read from the listing after the offer exists, so editing
 *    the listing cannot change what was agreed.
 * 2. A BOOKING CARRIES EXACTLY THE TERMS IT NAMES. A booking made from an offer copies the offer's
 *    rent, deposit and dates, and `agreedOfferId` records which offer it was.
 * 3. TERMS LOCK WHEN PAYMENT BEGINS. A booking's terms may be renegotiated only while it is PENDING
 *    or APPROVED with no payment row. The row is created at APPROVED -> PAYMENT_PENDING, before
 *    verification, so terms are final before any money can be verified against them.
 *
 * Dates here are calendar days as `YYYY-MM-DD`, the format the booking flow already uses, compared as
 * strings - they sort chronologically.
 */

/** How long the other party has to answer an offer. The same window as a booking request. */
export const OFFER_EXPIRY_HOURS = 48;

/**
 * How long an accepted pre-booking offer stays usable for making the booking.
 *
 * Without a limit, an owner who accepted a discount in spring would find a renter booking at that
 * price in winter. Measured from acceptance, not proposal, so an offer accepted just before it
 * expired still gives the renter the full window to book.
 */
export const ACCEPTED_OFFER_VALID_HOURS = 48;

/** Statuses in which a booking's terms may still be renegotiated. */
export const TERMS_AMENDABLE_STATUSES: readonly BookingStatus[] = [
  BookingStatus.PENDING,
  BookingStatus.APPROVED,
];

const HOUR_MS = 3_600_000;

export const OFFER_NOT_FOUND_ERROR = "That offer was not found.";

export const TERMS_LOCKED_ERROR =
  "Payment has started for this booking, so its price and deposit are final.";

export interface OfferTerms {
  startDate: string;
  endDate: string;
  totalPrice: number;
  securityDeposit: number;
}

/** A stored `@db.Date` as the calendar day it represents. */
export function toCalendarDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The answer deadline for an offer proposed at `now`. */
export function offerExpiresAt(now: Date): Date {
  return new Date(now.getTime() + OFFER_EXPIRY_HOURS * HOUR_MS);
}

/**
 * The status an offer actually has at `now`.
 *
 * A PENDING offer past its deadline is expired whether or not anything has written EXPIRED to it.
 * Every rule reads this rather than the raw column, so expiry needs no background job to be correct -
 * only to be tidy.
 */
export function effectiveOfferStatus(
  offer: { status: OfferStatus; expiresAt: Date },
  now: Date
): OfferStatus {
  if (
    offer.status === OfferStatus.PENDING &&
    offer.expiresAt.getTime() <= now.getTime()
  ) {
    return OfferStatus.EXPIRED;
  }

  return offer.status;
}

/**
 * Whether a booking's terms can still change.
 *
 * Both conditions, deliberately. The status list is the rule; `paymentId` is the fact the database
 * trigger enforces. They agree today because the payment row and PAYMENT_PENDING are written in one
 * transaction, and checking both keeps this answer right if that ever stops being true.
 */
export function bookingTermsAmendable(booking: {
  status: BookingStatus;
  paymentId: string | null;
}): boolean {
  return (
    booking.paymentId === null &&
    TERMS_AMENDABLE_STATUSES.includes(booking.status)
  );
}

/** Checks on the terms themselves that do not depend on who is proposing. */
function checkTermDates(terms: OfferTerms): ChatDecision {
  const days = countRentalDays(terms.startDate, terms.endDate);

  if (days <= 0) {
    return { allowed: false, reason: "Please choose a valid date range." };
  }

  if (days > MAX_BOOKING_DAYS) {
    return {
      allowed: false,
      reason: `A single booking cannot exceed ${MAX_BOOKING_DAYS} days.`,
    };
  }

  return { allowed: true };
}

interface BookingForOffer {
  status: BookingStatus;
  paymentId: string | null;
  startDate: string;
  endDate: string;
}

/**
 * Whether this participant may propose these terms.
 *
 * EITHER SIDE MAY PROPOSE. A renter asking for a discount and an owner offering one are both normal.
 * Only the other side may accept - see `canRespondToOffer`.
 *
 * `booking` is set for an offer against an existing booking. Its dates must be the booking's own:
 * the booking already holds those calendar days, and moving them is a cancel and rebook, not a price
 * negotiation. Without a booking, the dates must not have started yet.
 *
 * The amounts are bounded by the validation schema, not here.
 */
export function canProposeOffer({
  role,
  writable,
  terms,
  today,
  booking,
}: {
  role: ParticipantRole | null;
  /** The result of `canWriteToConversation`. */
  writable: ChatDecision;
  terms: OfferTerms;
  today: string;
  booking: BookingForOffer | null;
}): ChatDecision {
  if (!writable.allowed) {
    return writable;
  }

  if (!role) {
    return { allowed: false, reason: OFFER_NOT_FOUND_ERROR };
  }

  const dates = checkTermDates(terms);

  if (!dates.allowed) {
    return dates;
  }

  if (booking) {
    if (!bookingTermsAmendable(booking)) {
      return { allowed: false, reason: TERMS_LOCKED_ERROR };
    }

    if (
      terms.startDate !== booking.startDate ||
      terms.endDate !== booking.endDate
    ) {
      return {
        allowed: false,
        reason:
          "An offer on an existing booking keeps its dates. To change the dates, cancel and request again.",
      };
    }

    return { allowed: true };
  }

  if (terms.startDate < today) {
    return { allowed: false, reason: "That start date has already passed." };
  }

  return { allowed: true };
}

interface OfferForResponse {
  status: OfferStatus;
  expiresAt: Date;
  proposedById: string;
  recipientId: string;
  startDate: string;
}

const CLOSED_OFFER_REASONS: Record<OfferStatus, string> = {
  [OfferStatus.PENDING]: "",
  [OfferStatus.ACCEPTED]: "This offer has already been accepted.",
  [OfferStatus.DECLINED]: "This offer has already been declined.",
  [OfferStatus.WITHDRAWN]: "This offer was withdrawn.",
  [OfferStatus.SUPERSEDED]: "A newer offer has replaced this one.",
  [OfferStatus.EXPIRED]: "This offer has expired.",
};

/**
 * Whether this user may accept or decline this offer.
 *
 * ONLY THE RECIPIENT. Accepting your own offer would turn a proposal into an agreement with nobody's
 * consent but your own. The proposer is told so plainly; anyone else is told the offer does not exist.
 *
 * Declining is always possible while the offer is open. Accepting has two further conditions: an
 * offer against a booking needs that booking's terms to still be amendable, and a pre-booking offer
 * must not be for dates that have already started.
 */
export function canRespondToOffer({
  offer,
  userId,
  response,
  now,
  today,
  booking,
}: {
  offer: OfferForResponse;
  userId: string;
  response: "accept" | "decline";
  now: Date;
  today: string;
  /** The booking the offer was made against, or `null` for a pre-booking offer. */
  booking: { status: BookingStatus; paymentId: string | null } | null;
}): ChatDecision {
  if (offer.recipientId !== userId) {
    return {
      allowed: false,
      reason:
        offer.proposedById === userId
          ? "You cannot answer your own offer."
          : OFFER_NOT_FOUND_ERROR,
    };
  }

  const status = effectiveOfferStatus(offer, now);

  if (status !== OfferStatus.PENDING) {
    return { allowed: false, reason: CLOSED_OFFER_REASONS[status] };
  }

  if (response === "decline") {
    return { allowed: true };
  }

  if (booking) {
    if (!bookingTermsAmendable(booking)) {
      return { allowed: false, reason: TERMS_LOCKED_ERROR };
    }
  } else if (offer.startDate < today) {
    return {
      allowed: false,
      reason: "The dates in this offer have already started.",
    };
  }

  return { allowed: true };
}

/** Whether this user may withdraw this offer. Only the proposer, and only while it is open. */
export function canWithdrawOffer({
  offer,
  userId,
  now,
}: {
  offer: { status: OfferStatus; expiresAt: Date; proposedById: string };
  userId: string;
  now: Date;
}): ChatDecision {
  if (offer.proposedById !== userId) {
    return { allowed: false, reason: OFFER_NOT_FOUND_ERROR };
  }

  const status = effectiveOfferStatus(offer, now);

  if (status !== OfferStatus.PENDING) {
    return { allowed: false, reason: CLOSED_OFFER_REASONS[status] };
  }

  return { allowed: true };
}

/**
 * Whether a booking request may be made with this accepted offer.
 *
 * Every condition is about the request matching the agreement exactly:
 *   - the offer was accepted, is a pre-booking offer, and no booking has used it yet;
 *   - it was agreed in this renter's conversation about this listing;
 *   - the requested dates are the offer's dates;
 *   - it is still within ACCEPTED_OFFER_VALID_HOURS of acceptance, and its dates have not started.
 *
 * `alreadyUsed` is backed by the unique index on `Booking.agreedOfferId`, so two concurrent
 * requests with one offer cannot both succeed - the loser fails on the constraint, like the
 * date-hold race in `createBookingRequest`.
 */
export function checkOfferForBooking({
  offer,
  alreadyUsed,
  renterId,
  listingId,
  startDate,
  endDate,
  now,
  today,
}: {
  offer: {
    status: OfferStatus;
    bookingId: string | null;
    startDate: string;
    endDate: string;
    respondedAt: Date | null;
    conversation: { listingId: string; renterId: string };
  };
  alreadyUsed: boolean;
  renterId: string;
  listingId: string;
  startDate: string;
  endDate: string;
  now: Date;
  today: string;
}): ChatDecision {
  if (
    offer.conversation.renterId !== renterId ||
    offer.conversation.listingId !== listingId ||
    offer.bookingId !== null
  ) {
    return { allowed: false, reason: OFFER_NOT_FOUND_ERROR };
  }

  if (offer.status !== OfferStatus.ACCEPTED || !offer.respondedAt) {
    return {
      allowed: false,
      reason: "That offer has not been accepted.",
    };
  }

  if (alreadyUsed) {
    return {
      allowed: false,
      reason: "That offer has already been used for a booking.",
    };
  }

  if (offer.startDate !== startDate || offer.endDate !== endDate) {
    return {
      allowed: false,
      reason: "The dates must match the accepted offer.",
    };
  }

  if (offer.startDate < today) {
    return {
      allowed: false,
      reason: "The dates in that offer have already started.",
    };
  }

  if (
    now.getTime() - offer.respondedAt.getTime() >=
    ACCEPTED_OFFER_VALID_HOURS * HOUR_MS
  ) {
    return {
      allowed: false,
      reason:
        "That offer was accepted too long ago to book with. Please agree a new one.",
    };
  }

  return { allowed: true };
}

/**
 * The booking columns an accepted offer sets. The single place an offer becomes booking terms.
 *
 * Takes the stored offer, never values from the request. `createBookingRequest` and the
 * renegotiation path both copy from here, and the `bookings` trigger refuses a write where any of
 * these four differ from the offer named in `agreedOfferId`.
 */
export function bookingTermsFromOffer(offer: {
  id: string;
  startDate: Date;
  endDate: Date;
  totalPrice: number;
  securityDeposit: number;
}): {
  agreedOfferId: string;
  startDate: Date;
  endDate: Date;
  totalPrice: number;
  securityDeposit: number;
} {
  return {
    agreedOfferId: offer.id,
    startDate: offer.startDate,
    endDate: offer.endDate,
    totalPrice: offer.totalPrice,
    securityDeposit: offer.securityDeposit,
  };
}

/**
 * The deposit that decides a renter's access tier.
 *
 * THE HIGHER OF THE TWO. Verification requirements scale with the deposit because the deposit stands
 * in for what the item is worth (`accessTierFor`). A negotiated lower deposit does not make the item
 * worth less, so it must not let a renter skip a requirement the listing would otherwise impose. A
 * negotiated higher one can only add requirements, which is correct.
 */
export function accessDepositFor(
  listingDeposit: number,
  agreedDeposit: number | null
): number {
  return agreedDeposit === null
    ? listingDeposit
    : Math.max(listingDeposit, agreedDeposit);
}
