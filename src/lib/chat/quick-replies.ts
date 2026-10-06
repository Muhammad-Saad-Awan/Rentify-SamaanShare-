import { BookingStatus } from "@/generated/prisma/enums";

import type { ParticipantRole } from "@/lib/chat/rules";

/**
 * Suggested openers for the composer. Pure.
 *
 * The chat covers a whole rental, and what people need to say changes with it: questions before
 * booking, arrangements before pickup, help during the rental, the deposit after return. A suggestion
 * only fills the composer - the person edits or sends it themselves.
 *
 * NONE OF THESE NAMES A PRICE. Agreeing money is what offers are for, and a suggested "Would you do
 * Rs X?" would teach the opposite.
 */

export type RentalStage = "inquiry" | "booked" | "active" | "returned";

/** Statuses that end a booking without it happening - they put the thread back to inquiry. */
const DEAD_ENDS: readonly BookingStatus[] = [
  BookingStatus.DECLINED,
  BookingStatus.CANCELLED,
  BookingStatus.EXPIRED,
];

/**
 * The stage the thread is in, from its newest booking.
 *
 * `bookings` newest first, as the thread query returns them. The newest one decides: a renter who
 * returned an item last month and is asking about next week is back to arranging, not to deposits.
 */
export function rentalStage(
  bookings: readonly { status: BookingStatus }[]
): RentalStage {
  const latest = bookings[0];

  if (!latest || DEAD_ENDS.includes(latest.status)) {
    return "inquiry";
  }

  switch (latest.status) {
    case BookingStatus.ACTIVE:
      return "active";
    case BookingStatus.COMPLETED:
    case BookingStatus.REVIEWED:
      return "returned";
    default:
      return "booked";
  }
}

const SUGGESTIONS: Record<ParticipantRole, Record<RentalStage, string[]>> = {
  renter: {
    inquiry: [
      "Is it available on my dates?",
      "What's included?",
      "Where is pickup?",
      "What condition is it in?",
    ],
    booked: [
      "When can I pick it up?",
      "Could you share the exact pickup location?",
      "Is there anything I should know before using it?",
    ],
    active: [
      "Quick question about using it.",
      "Something isn't working as expected.",
      "What time should I return it?",
    ],
    returned: ["Thanks, it was great!", "When will my deposit be returned?"],
  },
  owner: {
    inquiry: [
      "Yes, it's available.",
      "Happy to answer any questions.",
      "Pickup is from my place - I'll share details once booked.",
    ],
    booked: [
      "What time suits you for pickup?",
      "The pickup details are on your booking.",
      "Let me know if you have any questions before pickup.",
    ],
    active: [
      "How is it going?",
      "Let me know if you need any help with it.",
      "Just a reminder of the return date.",
    ],
    returned: ["Thanks for renting!", "The item came back in good condition."],
  },
};

export function quickRepliesFor(
  role: ParticipantRole,
  stage: RentalStage
): string[] {
  return SUGGESTIONS[role][stage];
}
