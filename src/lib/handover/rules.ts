import {
  BookingStatus,
  HandoverCondition,
  HandoverConfirmation,
  HandoverType,
} from "@/generated/prisma/enums";

/**
 * The handover protocol. Pure, so all of this is testable without a database.
 *
 * WHAT IT IS FOR. Payment is offline and there is no escrow, so a deposit dispute is two people
 * asserting different things about an item neither of them still has. Until now `startBooking` and
 * `completeBooking` were each one party's unilateral click, recording that a handover happened and
 * nothing whatsoever about the state of the thing handed over. There was never anything to argue
 * from, which meant the platform's answer to "it came back damaged" was necessarily "we have no idea".
 *
 * FOUR PROPERTIES THIS PROTECTS.
 *
 * 1. A rental cannot advance through a handover without a record of it. The record is written by the
 *    party performing the transition, so requiring it can never deadlock - they are not waiting on
 *    anyone.
 *
 * 2. The record is sealed on write. No path revises condition, notes or photos, and a second attempt
 *    at the same handover is refused. A record its author can edit afterwards is not evidence, and
 *    the moment it would matter is exactly the moment they would want to edit it.
 *
 * 3. The counterparty's agreement is recorded but NEVER required. Blocking on it would let a silent
 *    party freeze someone else's rental and deposit indefinitely - a safety feature that strands
 *    people is not one. What is recorded instead is which of agreed, disputed or unanswered happened.
 *
 * 4. Nothing here judges the item. `DAMAGED` is what one person wrote down, not a finding, and no
 *    consequence follows from it automatically. That is a claim, and a claim needs a process.
 */

/** Bound on the recorder's condition notes, shared by the schema and the form. */
export const HANDOVER_NOTES_MAX = 1000;

/** Bound on the counterparty's reply. */
export const HANDOVER_REPLY_MAX = 1000;

/**
 * Photos per handover.
 *
 * Six, against a listing's ten. A listing is a shop window and benefits from more; a handover is
 * evidence of a moment, and past a certain point extra photos slow down two people standing in a
 * doorway with one of them wanting to leave.
 */
export const HANDOVER_PHOTOS_MAX = 6;

/**
 * Which handover belongs to which transition.
 *
 * `PAYMENT_PENDING -> ACTIVE` is collection; `ACTIVE -> COMPLETED` is return. Expressed as a lookup
 * from the status being left, so the action cannot pair a return record with a collection.
 */
export function handoverTypeForTransition(
  from: BookingStatus
): HandoverType | null {
  switch (from) {
    case BookingStatus.PAYMENT_PENDING:
      return HandoverType.PICKUP;
    case BookingStatus.ACTIVE:
      return HandoverType.RETURN;
    default:
      return null;
  }
}

export type HandoverEligibility =
  { allowed: true } | { allowed: false; reason: string };

interface RecordEligibilityInput {
  /** The booking's status right now. */
  status: BookingStatus;
  /** Which handover is being recorded. */
  type: HandoverType;
  /** Whether a record for this booking and type already exists. */
  alreadyRecorded: boolean;
}

/**
 * Whether this handover may be recorded now.
 *
 * The status check is what stops a return record being filed against a booking that never started -
 * which would otherwise be the cheapest way to manufacture evidence about an item that was never
 * collected.
 *
 * `alreadyRecorded` is the seal. Backed by `@@unique([bookingId, type])`, so a concurrent second
 * attempt is refused by the database rather than by this check winning a race.
 */
export function canRecordHandover({
  status,
  type,
  alreadyRecorded,
}: RecordEligibilityInput): HandoverEligibility {
  if (alreadyRecorded) {
    return {
      allowed: false,
      reason:
        type === HandoverType.PICKUP
          ? "Collection has already been recorded for this rental."
          : "The return has already been recorded for this rental.",
    };
  }

  const expected = handoverTypeForTransition(status);

  if (expected !== type) {
    return {
      allowed: false,
      reason:
        type === HandoverType.PICKUP
          ? "This rental is not at the collection stage."
          : "Mark the item as collected before recording its return.",
    };
  }

  return { allowed: true };
}

interface ConfirmEligibilityInput {
  /** The record's current confirmation state. */
  confirmation: HandoverConfirmation;
  /** Whether the caller is the party who did NOT write the record. */
  isCounterparty: boolean;
}

/**
 * Whether this caller may answer this record.
 *
 * ONLY THE OTHER PARTY, and only once. An author confirming their own record would be a signature on
 * their own statement - it would read as corroboration in the queue while being nothing of the kind.
 *
 * Answered once, because a renter who could switch from agreed to disputed after a deposit was
 * returned - or the reverse under pressure - would make the field describe the last conversation
 * rather than the handover. The write itself is a compare-and-swap on `PENDING`; this is the
 * readable half.
 */
export function canConfirmHandover({
  confirmation,
  isCounterparty,
}: ConfirmEligibilityInput): HandoverEligibility {
  if (!isCounterparty) {
    return {
      allowed: false,
      reason: "Only the other party can confirm a handover record.",
    };
  }

  if (confirmation !== HandoverConfirmation.PENDING) {
    return {
      allowed: false,
      reason: "You have already answered this handover record.",
    };
  }

  return { allowed: true };
}

/**
 * Whether a condition record describes something worse than expected.
 *
 * Used to decide emphasis in the UI and, later, whether a damage claim has a record to point at. It
 * is deliberately NOT wired to any automatic consequence: `DAMAGED` is one person's account written
 * at the door, and turning that into a withheld deposit without a process would hand every owner a
 * button that costs the renter money on their say-so alone.
 */
export function reportsDamage(condition: HandoverCondition): boolean {
  return (
    condition === HandoverCondition.MINOR_WEAR ||
    condition === HandoverCondition.DAMAGED
  );
}

/** How much weight a record carries, given whether the other party backed it. */
export type HandoverStanding = "agreed" | "disputed" | "unanswered";

/**
 * What a record amounts to as evidence.
 *
 * The three are genuinely different and collapsing any two loses the distinction that matters. A
 * record both parties agreed is close to settled. A disputed one is a live disagreement with both
 * accounts attached. An unanswered one is one person's word - weaker than agreement, but not the
 * same as being contradicted, and treating silence as disagreement would punish the many people who
 * simply never open the app again after returning a drill.
 */
export function handoverStanding(
  confirmation: HandoverConfirmation
): HandoverStanding {
  switch (confirmation) {
    case HandoverConfirmation.AGREED:
      return "agreed";
    case HandoverConfirmation.DISPUTED:
      return "disputed";
    case HandoverConfirmation.PENDING:
      return "unanswered";
  }
}

/** What each condition says, in the words someone standing in a doorway would use. */
export const HANDOVER_CONDITION_LABELS: Readonly<
  Record<HandoverCondition, string>
> = {
  [HandoverCondition.AS_EXPECTED]: "As expected",
  [HandoverCondition.MINOR_WEAR]: "Minor wear",
  [HandoverCondition.DAMAGED]: "Damaged",
};

/** What each condition means, so two people grade the same item the same way. */
export const HANDOVER_CONDITION_DESCRIPTIONS: Readonly<
  Record<HandoverCondition, string>
> = {
  [HandoverCondition.AS_EXPECTED]:
    "Matches the listing and any earlier record. Nothing worth noting.",
  [HandoverCondition.MINOR_WEAR]:
    "Small marks or wear from normal use. Worth recording, not worth a claim.",
  [HandoverCondition.DAMAGED]:
    "Something is broken, missing or materially worse. Record it and photograph it.",
};

/** The prompt shown when recording each side. */
export const HANDOVER_PROMPTS: Readonly<Record<HandoverType, string>> = {
  [HandoverType.PICKUP]: "What condition is the item in as you hand it over?",
  [HandoverType.RETURN]: "What condition has the item come back in?",
};
