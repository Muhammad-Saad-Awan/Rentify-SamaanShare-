import { describe, expect, it } from "vitest";

import {
  BookingStatus,
  HandoverCondition,
  HandoverConfirmation,
  HandoverType,
} from "@/generated/prisma/enums";
import {
  canConfirmHandover,
  canRecordHandover,
  HANDOVER_CONDITION_DESCRIPTIONS,
  HANDOVER_CONDITION_LABELS,
  HANDOVER_PROMPTS,
  handoverStanding,
  handoverTypeForTransition,
  reportsDamage,
} from "@/lib/handover/rules";

/**
 * The handover protocol.
 *
 * The load-bearing assertions are the seal (a record cannot be written twice), the stage gate (a
 * return cannot be recorded against a rental that never started), and that only the other party can
 * answer a record. Those three are what separate evidence from an unsupported claim.
 */

const ALL_STATUSES = Object.values(BookingStatus);
const ALL_CONDITIONS = Object.values(HandoverCondition);

describe("handoverTypeForTransition", () => {
  it("maps the two lifecycle points to their handovers", () => {
    expect(handoverTypeForTransition(BookingStatus.PAYMENT_PENDING)).toBe(
      HandoverType.PICKUP
    );
    expect(handoverTypeForTransition(BookingStatus.ACTIVE)).toBe(
      HandoverType.RETURN
    );
  });

  /**
   * Every other status has no handover. Asserted across the whole enum so a new status added later
   * silently maps to `null` and is refused, rather than inheriting a neighbour's meaning.
   */
  it("has no handover for any other status", () => {
    for (const status of ALL_STATUSES) {
      if (
        status === BookingStatus.PAYMENT_PENDING ||
        status === BookingStatus.ACTIVE
      ) {
        continue;
      }

      expect(handoverTypeForTransition(status)).toBeNull();
    }
  });
});

describe("canRecordHandover", () => {
  it("allows collection from PAYMENT_PENDING", () => {
    expect(
      canRecordHandover({
        status: BookingStatus.PAYMENT_PENDING,
        type: HandoverType.PICKUP,
        alreadyRecorded: false,
      }).allowed
    ).toBe(true);
  });

  it("allows a return from ACTIVE", () => {
    expect(
      canRecordHandover({
        status: BookingStatus.ACTIVE,
        type: HandoverType.RETURN,
        alreadyRecorded: false,
      }).allowed
    ).toBe(true);
  });

  /**
   * THE SEAL. A second record for the same handover is refused rather than replacing the first -
   * a record its author can rewrite after the fact is a claim, not evidence, and the moment it
   * matters is exactly the moment they would want to rewrite it.
   */
  it("refuses a second record for the same handover", () => {
    for (const type of [HandoverType.PICKUP, HandoverType.RETURN]) {
      const status =
        type === HandoverType.PICKUP
          ? BookingStatus.PAYMENT_PENDING
          : BookingStatus.ACTIVE;

      expect(
        canRecordHandover({ status, type, alreadyRecorded: true }).allowed
      ).toBe(false);
    }
  });

  /**
   * THE STAGE GATE. Filing a return against a booking that never started would be the cheapest way
   * to manufacture evidence about an item that was never collected.
   */
  it("refuses a return before the item was ever collected", () => {
    const decision = canRecordHandover({
      status: BookingStatus.PAYMENT_PENDING,
      type: HandoverType.RETURN,
      alreadyRecorded: false,
    });

    expect(decision.allowed).toBe(false);

    if (!decision.allowed) {
      expect(decision.reason).toContain("collected");
    }
  });

  it("refuses either handover from a status that has none", () => {
    for (const status of ALL_STATUSES) {
      if (
        status === BookingStatus.PAYMENT_PENDING ||
        status === BookingStatus.ACTIVE
      ) {
        continue;
      }

      for (const type of [HandoverType.PICKUP, HandoverType.RETURN]) {
        expect(
          canRecordHandover({ status, type, alreadyRecorded: false }).allowed,
          `${type} should be refused from ${status}`
        ).toBe(false);
      }
    }
  });

  /** A cancelled or declined rental can never carry a condition record. */
  it("refuses a collection record on a cancelled booking", () => {
    expect(
      canRecordHandover({
        status: BookingStatus.CANCELLED,
        type: HandoverType.PICKUP,
        alreadyRecorded: false,
      }).allowed
    ).toBe(false);
  });

  it("always explains a refusal", () => {
    const decision = canRecordHandover({
      status: BookingStatus.DECLINED,
      type: HandoverType.PICKUP,
      alreadyRecorded: false,
    });

    if (decision.allowed) {
      throw new Error("expected a refusal");
    }

    expect(decision.reason.length).toBeGreaterThan(10);
  });
});

describe("canConfirmHandover", () => {
  it("lets the other party answer a pending record", () => {
    expect(
      canConfirmHandover({
        confirmation: HandoverConfirmation.PENDING,
        isCounterparty: true,
      }).allowed
    ).toBe(true);
  });

  /**
   * An author confirming their own record would be a signature on their own statement - it would
   * read as corroboration in the queue while being nothing of the kind.
   */
  it("refuses the author confirming their own record", () => {
    expect(
      canConfirmHandover({
        confirmation: HandoverConfirmation.PENDING,
        isCounterparty: false,
      }).allowed
    ).toBe(false);
  });

  /** Answered once. Otherwise the field describes the last conversation, not the handover. */
  it("refuses a second answer, in either direction", () => {
    for (const confirmation of [
      HandoverConfirmation.AGREED,
      HandoverConfirmation.DISPUTED,
    ]) {
      expect(
        canConfirmHandover({ confirmation, isCounterparty: true }).allowed
      ).toBe(false);
    }
  });
});

describe("handoverStanding", () => {
  /**
   * Three distinct facts, and collapsing any two loses the one that matters. Treating silence as
   * disagreement would punish the many people who never open the app again after returning a drill.
   */
  it("keeps unanswered separate from disputed", () => {
    expect(handoverStanding(HandoverConfirmation.PENDING)).toBe("unanswered");
    expect(handoverStanding(HandoverConfirmation.DISPUTED)).toBe("disputed");
    expect(handoverStanding(HandoverConfirmation.AGREED)).toBe("agreed");
  });
});

describe("reportsDamage", () => {
  it("flags anything worse than as-expected", () => {
    expect(reportsDamage(HandoverCondition.AS_EXPECTED)).toBe(false);
    expect(reportsDamage(HandoverCondition.MINOR_WEAR)).toBe(true);
    expect(reportsDamage(HandoverCondition.DAMAGED)).toBe(true);
  });
});

describe("copy", () => {
  it("labels and describes every condition", () => {
    for (const condition of ALL_CONDITIONS) {
      expect(HANDOVER_CONDITION_LABELS[condition]?.length ?? 0).toBeGreaterThan(
        0
      );
      expect(
        HANDOVER_CONDITION_DESCRIPTIONS[condition]?.length ?? 0
      ).toBeGreaterThan(10);
    }
  });

  it("prompts both directions", () => {
    for (const type of [HandoverType.PICKUP, HandoverType.RETURN]) {
      expect(HANDOVER_PROMPTS[type]?.length ?? 0).toBeGreaterThan(10);
    }
  });

  /**
   * A condition record is one person's account written at a door, not a finding. Copy that read as a
   * verdict would have people treating it as one - and no consequence follows from it automatically,
   * because a withheld deposit on an owner's say-so alone is not a process.
   */
  it("never states a consequence for a damaged grade", () => {
    const copy = Object.values(HANDOVER_CONDITION_DESCRIPTIONS)
      .join(" ")
      .toLowerCase();

    for (const consequence of [
      "deposit will",
      "you will be charged",
      "forfeit",
      "penalty",
      "refund",
    ]) {
      expect(copy).not.toContain(consequence);
    }
  });
});
