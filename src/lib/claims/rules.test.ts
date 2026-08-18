import { describe, expect, it } from "vitest";

import {
  BookingStatus,
  ClaimReason,
  ClaimStatus,
  HandoverCondition,
} from "@/generated/prisma/enums";
import {
  CLAIM_FILING_DAYS,
  CLAIM_REASON_LABELS,
  CLAIM_RESPONSE_DAYS,
  CLAIM_STATUS_LABELS,
  canFileClaim,
  canResolveClaim,
  canRespondToClaim,
  canWithdrawClaim,
  claimFilingClosesAt,
  claimResponseDueAt,
  claimSupportedByHandover,
  isClaimOpen,
  shouldEscalateClaim,
  upheldAmount,
} from "@/lib/claims/rules";

/**
 * Damage claims.
 *
 * The load-bearing assertions are that a claim cannot exceed the deposit, that it cannot be filed
 * once the deposit has gone back, that silence never settles one, and that an unsettled claim
 * reduces nothing. Each of those is the difference between a record of a disagreement and a way of
 * taking money from somebody.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const completedAt = new Date("2026-08-01T10:00:00.000Z");
const now = new Date("2026-08-02T10:00:00.000Z");

const filing = (overrides: Partial<Parameters<typeof canFileClaim>[0]> = {}) =>
  canFileClaim({
    status: BookingStatus.COMPLETED,
    completedAt,
    securityDeposit: 60_000,
    depositReturnedAt: null,
    alreadyClaimed: false,
    amountClaimed: 15_000,
    now,
    ...overrides,
  });

describe("canFileClaim", () => {
  it("allows a normal claim inside the window", () => {
    expect(filing().allowed).toBe(true);
  });

  it("refuses a second claim on the same rental", () => {
    expect(filing({ alreadyClaimed: true }).allowed).toBe(false);
  });

  it("refuses anything but a finished rental", () => {
    for (const status of Object.values(BookingStatus)) {
      if (
        status === BookingStatus.COMPLETED ||
        status === BookingStatus.REVIEWED
      ) {
        continue;
      }

      expect(filing({ status }).allowed, `${status} should be refused`).toBe(
        false
      );
    }
  });

  it("allows a claim on a REVIEWED rental, not just COMPLETED", () => {
    expect(filing({ status: BookingStatus.REVIEWED }).allowed).toBe(true);
  });

  it("refuses when there was no deposit to claim against", () => {
    expect(filing({ securityDeposit: 0 }).allowed).toBe(false);
  });

  /**
   * THE ONE THAT STOPS "RETURN IT, THEN CLAIM IT".
   *
   * The money has gone back, so there is nothing left for the platform to state - and without this
   * an owner could return a deposit and then have the platform publish an obligation on the renter
   * for money it no longer holds.
   */
  it("refuses once the deposit has been returned", () => {
    const decision = filing({ depositReturnedAt: new Date() });

    expect(decision.allowed).toBe(false);

    if (!decision.allowed) {
      expect(decision.reason).toContain("already returned");
    }
  });

  it("refuses after the filing window closes", () => {
    expect(
      filing({
        now: new Date(completedAt.getTime() + CLAIM_FILING_DAYS * DAY_MS),
      }).allowed
    ).toBe(false);
  });

  it("still allows a claim a minute before the window closes", () => {
    expect(
      filing({
        now: new Date(
          completedAt.getTime() + CLAIM_FILING_DAYS * DAY_MS - 60_000
        ),
      }).allowed
    ).toBe(true);
  });

  /**
   * THE CAP. The deposit is the only obligation the platform has standing to describe; a larger
   * figure would imply an enforcement power that does not exist.
   */
  it("refuses a claim larger than the deposit", () => {
    const decision = filing({ amountClaimed: 60_001 });

    expect(decision.allowed).toBe(false);

    if (!decision.allowed) {
      expect(decision.reason).toContain("cannot exceed the security deposit");
    }
  });

  it("allows a claim for exactly the deposit", () => {
    expect(filing({ amountClaimed: 60_000 }).allowed).toBe(true);
  });

  it("refuses a zero, negative or fractional amount", () => {
    for (const amountClaimed of [0, -1, 15_000.5]) {
      expect(filing({ amountClaimed }).allowed).toBe(false);
    }
  });

  it("refuses a completed rental with no completion date", () => {
    expect(filing({ completedAt: null }).allowed).toBe(false);
  });
});

describe("canRespondToClaim", () => {
  it("lets the renter answer an open claim", () => {
    expect(canRespondToClaim(ClaimStatus.OPEN, true).allowed).toBe(true);
  });

  it("refuses anyone who is not the renter", () => {
    expect(canRespondToClaim(ClaimStatus.OPEN, false).allowed).toBe(false);
  });

  it("refuses a second answer", () => {
    for (const status of [
      ClaimStatus.ACCEPTED,
      ClaimStatus.DISPUTED,
      ClaimStatus.RESOLVED,
      ClaimStatus.WITHDRAWN,
    ]) {
      expect(canRespondToClaim(status, true).allowed).toBe(false);
    }
  });
});

describe("canWithdrawClaim", () => {
  it("lets the owner withdraw before it is settled", () => {
    expect(canWithdrawClaim(ClaimStatus.OPEN, true).allowed).toBe(true);
    expect(canWithdrawClaim(ClaimStatus.DISPUTED, true).allowed).toBe(true);
  });

  it("refuses once settled", () => {
    for (const status of [
      ClaimStatus.ACCEPTED,
      ClaimStatus.RESOLVED,
      ClaimStatus.WITHDRAWN,
    ]) {
      expect(canWithdrawClaim(status, true).allowed).toBe(false);
    }
  });

  it("refuses anyone but the claimant", () => {
    expect(canWithdrawClaim(ClaimStatus.OPEN, false).allowed).toBe(false);
  });
});

describe("canResolveClaim", () => {
  it("allows an administrator to rule on a disputed claim", () => {
    expect(canResolveClaim(ClaimStatus.DISPUTED, 10_000, 15_000).allowed).toBe(
      true
    );
  });

  /**
   * An accepted claim is settled by agreement between the two people. Overruling it would be the
   * platform inserting itself into a resolution both sides reached without it.
   */
  it("refuses to rule on a claim the parties already settled", () => {
    for (const status of [
      ClaimStatus.OPEN,
      ClaimStatus.ACCEPTED,
      ClaimStatus.RESOLVED,
      ClaimStatus.WITHDRAWN,
    ]) {
      expect(canResolveClaim(status, 1_000, 15_000).allowed).toBe(false);
    }
  });

  it("allows upholding nothing", () => {
    expect(canResolveClaim(ClaimStatus.DISPUTED, 0, 15_000).allowed).toBe(true);
  });

  /**
   * Awarding beyond the claim would decide something nobody put to the administrator, and the renter
   * would have had no chance to answer the larger figure.
   */
  it("refuses to uphold more than was claimed", () => {
    expect(canResolveClaim(ClaimStatus.DISPUTED, 15_001, 15_000).allowed).toBe(
      false
    );
  });

  it("refuses a negative or fractional award", () => {
    expect(canResolveClaim(ClaimStatus.DISPUTED, -1, 15_000).allowed).toBe(
      false
    );
    expect(canResolveClaim(ClaimStatus.DISPUTED, 1.5, 15_000).allowed).toBe(
      false
    );
  });
});

describe("shouldEscalateClaim", () => {
  const filedAt = new Date("2026-08-02T10:00:00.000Z");

  it("does not escalate inside the response window", () => {
    expect(
      shouldEscalateClaim(
        ClaimStatus.OPEN,
        filedAt,
        new Date(filedAt.getTime() + DAY_MS)
      )
    ).toBe(false);
  });

  it("escalates once the window closes", () => {
    expect(
      shouldEscalateClaim(
        ClaimStatus.OPEN,
        filedAt,
        new Date(filedAt.getTime() + CLAIM_RESPONSE_DAYS * DAY_MS)
      )
    ).toBe(true);
  });

  /** Only an unanswered claim escalates. Anything already answered has somewhere to be. */
  it("never escalates a claim that is not open", () => {
    const late = new Date(filedAt.getTime() + 365 * DAY_MS);

    for (const status of [
      ClaimStatus.ACCEPTED,
      ClaimStatus.DISPUTED,
      ClaimStatus.RESOLVED,
      ClaimStatus.WITHDRAWN,
    ]) {
      expect(shouldEscalateClaim(status, filedAt, late)).toBe(false);
    }
  });
});

describe("upheldAmount", () => {
  /**
   * THE ONE THAT KEEPS AN ASSERTION FROM ACTING.
   *
   * While a claim is open or disputed nothing is settled, so nothing is deducted. Returning 0 here
   * instead of null would look identical to a claim decided in the renter's favour, and the platform
   * would be treating one person's demand as a finding.
   */
  it("settles nothing while a claim is live", () => {
    expect(upheldAmount(ClaimStatus.OPEN, null)).toBeNull();
    expect(upheldAmount(ClaimStatus.DISPUTED, 15_000)).toBeNull();
  });

  it("upholds the agreed amount once accepted or resolved", () => {
    expect(upheldAmount(ClaimStatus.ACCEPTED, 15_000)).toBe(15_000);
    expect(upheldAmount(ClaimStatus.RESOLVED, 4_000)).toBe(4_000);
  });

  it("treats a resolved claim with no figure as nothing upheld", () => {
    expect(upheldAmount(ClaimStatus.RESOLVED, null)).toBe(0);
  });

  /** Withdrawn is settled at nothing: the owner took it back, so the whole deposit is owed. */
  it("upholds nothing on a withdrawn claim", () => {
    expect(upheldAmount(ClaimStatus.WITHDRAWN, 15_000)).toBe(0);
  });
});

describe("isClaimOpen", () => {
  it("counts open and disputed as live", () => {
    expect(isClaimOpen(ClaimStatus.OPEN)).toBe(true);
    expect(isClaimOpen(ClaimStatus.DISPUTED)).toBe(true);
  });

  it("counts every settled state as closed", () => {
    for (const status of [
      ClaimStatus.ACCEPTED,
      ClaimStatus.RESOLVED,
      ClaimStatus.WITHDRAWN,
    ]) {
      expect(isClaimOpen(status)).toBe(false);
    }
  });
});

describe("claimSupportedByHandover", () => {
  /**
   * Not a gate. An owner arguing against their own written record is close to the strongest evidence
   * available either way, and surfacing that is more useful than refusing the claim - hidden faults
   * are real, and an item is often only found broken when it is next used.
   */
  it("is unsupported when the owner graded the item as expected", () => {
    expect(claimSupportedByHandover(HandoverCondition.AS_EXPECTED)).toBe(false);
  });

  it("is supported when the record already reported a problem", () => {
    expect(claimSupportedByHandover(HandoverCondition.MINOR_WEAR)).toBe(true);
    expect(claimSupportedByHandover(HandoverCondition.DAMAGED)).toBe(true);
  });

  it("is unsupported when there is no record at all", () => {
    expect(claimSupportedByHandover(null)).toBe(false);
  });
});

describe("windows", () => {
  /**
   * ONE CONSTANT, TWO USES. A pause longer than the response window would hold a deposit after the
   * renter's chance to speak had passed; a shorter one would restart the clock while they were still
   * entitled to answer.
   */
  it("uses the same length for responding and for pausing the deposit clock", () => {
    expect(CLAIM_RESPONSE_DAYS).toBe(CLAIM_FILING_DAYS);
  });

  it("computes both deadlines from their own start", () => {
    expect(claimResponseDueAt(completedAt).getTime()).toBe(
      completedAt.getTime() + CLAIM_RESPONSE_DAYS * DAY_MS
    );
    expect(claimFilingClosesAt(completedAt).getTime()).toBe(
      completedAt.getTime() + CLAIM_FILING_DAYS * DAY_MS
    );
  });
});

describe("copy", () => {
  it("labels every reason and every status", () => {
    for (const reason of Object.values(ClaimReason)) {
      expect(CLAIM_REASON_LABELS[reason]?.length ?? 0).toBeGreaterThan(0);
    }

    for (const status of Object.values(ClaimStatus)) {
      expect(CLAIM_STATUS_LABELS[status]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  /**
   * SamaanShare holds no deposit and cannot compensate anyone. Copy implying it protects, refunds or
   * guarantees money would be a promise it cannot keep - the line every payment string draws.
   */
  it("promises no custody of the money", () => {
    const copy = [
      ...Object.values(CLAIM_REASON_LABELS),
      ...Object.values(CLAIM_STATUS_LABELS),
    ]
      .join(" ")
      .toLowerCase();

    for (const promise of [
      "refund",
      "protected",
      "guarantee",
      "we will pay",
      "reimburse",
      "held by",
    ]) {
      expect(copy).not.toContain(promise);
    }
  });
});
