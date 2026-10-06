import { ACCEPTED_OFFER_VALID_HOURS } from "@/lib/chat/offers";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

/**
 * The wording of the platform's own SYSTEM messages. Pure.
 *
 * These are a readable trail in the thread and a preview line in the inbox - NOT a record of terms.
 * Nothing ever parses an amount back out of one. The terms are on the Offer row, which the message
 * links to by `offerId`.
 */

interface TermsForText {
  startDate: Date;
  endDate: Date;
  totalPrice: number;
  securityDeposit: number;
}

/** "Rs. 4,500 for 10 Nov 2027 to 12 Nov 2027, deposit Rs. 5,000" */
export function describeTerms(terms: TermsForText): string {
  const deposit =
    terms.securityDeposit === 0
      ? "no deposit"
      : `deposit ${formatPKR(terms.securityDeposit)}`;

  return `${formatPKR(terms.totalPrice)} for ${formatDate(terms.startDate)} to ${formatDate(terms.endDate)}, ${deposit}`;
}

export type OfferEvent = "accepted" | "declined" | "withdrawn";

/** The SYSTEM line written when an offer closes. */
export function offerEventText(
  event: OfferEvent,
  terms: TermsForText,
  options: { appliedToBooking: boolean }
): string {
  const summary = describeTerms(terms);

  switch (event) {
    case "accepted":
      return options.appliedToBooking
        ? `Offer accepted: ${summary}. The booking now carries these terms.`
        : `Offer accepted: ${summary}. Book these dates within ${ACCEPTED_OFFER_VALID_HOURS} hours to use it.`;
    case "declined":
      return `Offer declined: ${summary}.`;
    case "withdrawn":
      return `Offer withdrawn: ${summary}.`;
  }
}

/**
 * Booking events that write a line into the thread.
 *
 * Not every event: a request writes its own line with its terms, and review reminders and published
 * reviews are about the platform, not about the rental the two people are discussing.
 */
export type ThreadBookingEvent =
  | { event: "approved" }
  | { event: "declined"; reason?: string | null }
  | { event: "expired" }
  | { event: "cancelled"; by: "renter" | "owner"; reason?: string | null }
  | { event: "instructions-updated" }
  | { event: "payment-selected"; methodLabel: string }
  | { event: "payment-verified" }
  | { event: "picked-up" }
  | { event: "returned" }
  | { event: "handover-disputed" }
  | { event: "claim-filed"; reasonLabel: string }
  | { event: "claim-resolved" };

/**
 * The SYSTEM line for a booking event, naming the booking by its dates - a thread can hold more
 * than one booking. Neutral third person: both participants read the same line.
 *
 * A free-text reason is quoted as the person wrote it. It is already on the booking card for both
 * of them, so the thread shows nothing new - it just keeps the story in one place.
 */
export function bookingEventText(
  input: ThreadBookingEvent,
  dates: { startDate: Date; endDate: Date }
): string {
  const which = `Booking for ${formatDate(dates.startDate)} to ${formatDate(dates.endDate)}`;
  const because = (reason?: string | null) =>
    reason?.trim() ? ` Reason: "${reason.trim()}"` : "";

  switch (input.event) {
    case "approved":
      return `${which} was approved by the owner.`;
    case "declined":
      return `${which} was declined by the owner.${because(input.reason)}`;
    case "expired":
      return `${which} expired without an answer.`;
    case "cancelled":
      return `${which} was cancelled by the ${input.by}.${because(input.reason)}`;
    case "instructions-updated":
      return `The owner updated the pickup details for the ${which.toLowerCase()}.`;
    case "payment-selected":
      return `${which}: the renter chose to pay by ${input.methodLabel}.`;
    case "payment-verified":
      return `${which}: SamaanShare verified the payment.`;
    case "picked-up":
      return `${which}: the item was collected. The rental is under way.`;
    case "returned":
      return `${which}: the item was returned. The rental is complete.`;
    case "handover-disputed":
      return `${which}: a handover condition record was disputed.`;
    case "claim-filed":
      return `${which}: the owner filed a deposit claim (${input.reasonLabel}).`;
    case "claim-resolved":
      return `${which}: SamaanShare resolved the deposit claim.`;
  }
}

/**
 * The SYSTEM line written when a booking request is made, which is where the booking enters the
 * thread. Says whether the terms came from an accepted offer or from the listing's rates.
 */
export function bookingRequestedText(
  terms: TermsForText,
  options: { fromOffer: boolean }
): string {
  return options.fromOffer
    ? `Booking requested on the agreed terms: ${describeTerms(terms)}.`
    : `Booking requested at the listing's rates: ${describeTerms(terms)}.`;
}
