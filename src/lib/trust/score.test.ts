import { describe, expect, it } from "vitest";

import {
  assessTrust,
  TRUST_BAND_DESCRIPTIONS,
  TRUST_BAND_LABELS,
  trustBandFor,
} from "@/lib/trust/score";

import type { TrustSignals } from "@/lib/trust/score";

/**
 * The trust score.
 *
 * The load-bearing assertions are the ones about *absence*: a new account must score null rather
 * than low, an unreviewed one must not be scored as badly reviewed, and no combination of inputs may
 * produce a negative badge. A trust system that brands newcomers is worse than none, because the
 * damage is done to the people least able to explain it.
 */

const nobody: TrustSignals = {
  ownerRating: { average: null, count: 0 },
  renterRating: { average: null, count: 0 },
  completedRentals: 0,
  cancelledByThem: 0,
  isVerified: false,
  emailVerified: false,
};

const signals = (overrides: Partial<TrustSignals>): TrustSignals => ({
  ...nobody,
  ...overrides,
});

describe("assessTrust — absence", () => {
  /**
   * THE ONE THAT MATTERS MOST. "Not yet established" and "established as unreliable" are opposite
   * claims, and a number cannot say the first.
   */
  it("scores a brand-new account as null, not zero", () => {
    const result = assessTrust(nobody);

    expect(result.score).toBeNull();
    expect(result.band).toBeNull();
  });

  it("still declines to score a verified account with no rentals", () => {
    const result = assessTrust(
      signals({ isVerified: true, emailVerified: true })
    );

    // Otherwise the number would be built entirely out of verification, which says nothing about
    // how the account behaves in a rental.
    expect(result.score).toBeNull();
  });

  /**
   * A completed rental nobody reviewed is not a bad rating. Scoring the missing component as zero
   * would read as one.
   */
  it("does not treat an absent rating as a bad rating", () => {
    const unreviewed = assessTrust(
      signals({ completedRentals: 4, emailVerified: true })
    );
    const badlyReviewed = assessTrust(
      signals({
        completedRentals: 4,
        emailVerified: true,
        ownerRating: { average: 1, count: 4 },
      })
    );

    expect(unreviewed.components.reputation).toBeNull();
    expect(unreviewed.score).toBeGreaterThan(badlyReviewed.score ?? 1);
  });
});

describe("assessTrust — confidence", () => {
  /** A perfect average from one rental is not a settled record. */
  it("ranks fifty strong reviews above one perfect one", () => {
    const thin = assessTrust(
      signals({
        completedRentals: 1,
        ownerRating: { average: 5, count: 1 },
      })
    );
    const thick = assessTrust(
      signals({
        completedRentals: 50,
        ownerRating: { average: 4.6, count: 50 },
      })
    );

    expect(thick.score ?? 0).toBeGreaterThan(thin.score ?? 1);
    expect(thin.components.reputation ?? 1).toBeLessThan(
      thick.components.reputation ?? 0
    );
  });

  it("shrinks a single rating towards the prior", () => {
    const one = assessTrust(
      signals({ completedRentals: 1, ownerRating: { average: 5, count: 1 } })
    );

    // (5 + 5×3.5) / 6 = 3.75 → (3.75 - 1) / 4 = 0.6875
    expect(one.components.reputation).toBeCloseTo(0.6875, 4);
  });

  it("weights each direction by its own count", () => {
    const mostlyOwner = assessTrust(
      signals({
        completedRentals: 20,
        ownerRating: { average: 5, count: 40 },
        renterRating: { average: 1, count: 1 },
      })
    );

    // The single poor renter review must barely move a record of forty strong owner reviews.
    expect(mostlyOwner.components.reputation ?? 0).toBeGreaterThan(0.85);
  });
});

describe("assessTrust — experience and reliability", () => {
  it("saturates experience so volume alone cannot buy trust", () => {
    const ten = assessTrust(signals({ completedRentals: 10 }));
    const hundred = assessTrust(signals({ completedRentals: 100 }));

    expect(ten.components.experience).toBe(1);
    expect(hundred.components.experience).toBe(1);
  });

  it("counts only cancellations this person made", () => {
    const clean = assessTrust(signals({ completedRentals: 10 }));
    const cancels = assessTrust(
      signals({ completedRentals: 10, cancelledByThem: 10 })
    );

    expect(clean.components.reliability).toBe(1);
    expect(cancels.components.reliability).toBe(0.5);
  });

  /** Having cancelled nothing is not a demonstration of unreliability. */
  it("starts reliability at 1 with no history rather than 0", () => {
    expect(assessTrust(nobody).components.reliability).toBe(1);
  });
});

describe("assessTrust — verification", () => {
  it("values a checked identity far above a confirmed inbox", () => {
    expect(
      assessTrust(signals({ isVerified: true })).components.verification
    ).toBe(1);
    expect(
      assessTrust(signals({ emailVerified: true })).components.verification
    ).toBe(0.4);
    expect(assessTrust(nobody).components.verification).toBe(0);
  });

  /**
   * The gate, and the reason it is a gate rather than a weight: this record scores ~0.94, so no
   * threshold worth setting would exclude it. "Highly trusted" is the strongest claim the platform
   * makes about a stranger, and everything else feeding the score is behaviour reported by other
   * users - which a determined person can manufacture.
   */
  it("keeps the top band out of reach without a verified identity", () => {
    const flawless = assessTrust(
      signals({
        completedRentals: 100,
        ownerRating: { average: 5, count: 200 },
        renterRating: { average: 5, count: 200 },
        emailVerified: true,
      })
    );

    expect(flawless.score ?? 0).toBeGreaterThan(0.8);
    expect(flawless.band).toBe("trusted");
  });

  it("awards the top band to the same record once verified", () => {
    const verified = assessTrust(
      signals({
        completedRentals: 100,
        ownerRating: { average: 5, count: 200 },
        renterRating: { average: 5, count: 200 },
        emailVerified: true,
        isVerified: true,
      })
    );

    expect(verified.band).toBe("highly-trusted");
  });
});

describe("trustBandFor", () => {
  /**
   * THE PUBLISHING RULE. A "low trust" badge is a published accusation assembled from proxies - a
   * cancelled booking may have been the other party's fault, and a thin record is mostly a statement
   * about time. Falling short earns no badge, never a negative one.
   */
  it("never returns a negative band, at any score or verification state", () => {
    for (const isVerified of [false, true]) {
      for (let score = 0; score <= 1.0001; score += 0.01) {
        const band = trustBandFor(Math.min(1, score), isVerified);

        expect(
          band === null || band === "trusted" || band === "highly-trusted"
        ).toBe(true);
      }
    }
  });

  it("awards nothing below the trusted threshold", () => {
    expect(trustBandFor(0.59, true)).toBeNull();
    expect(trustBandFor(0, true)).toBeNull();
  });

  it("is inclusive at each threshold", () => {
    expect(trustBandFor(0.6, false)).toBe("trusted");
    expect(trustBandFor(0.8, true)).toBe("highly-trusted");
  });

  /** A strong record without verification stops at "trusted" rather than losing its badge. */
  it("falls back to trusted rather than to nothing when unverified", () => {
    expect(trustBandFor(0.95, false)).toBe("trusted");
  });

  it("labels and describes every band it can return", () => {
    for (const band of ["trusted", "highly-trusted"] as const) {
      expect(TRUST_BAND_LABELS[band]?.length ?? 0).toBeGreaterThan(0);
      expect(TRUST_BAND_DESCRIPTIONS[band]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  /**
   * SamaanShare holds no deposit and guarantees no rental. A badge whose explanation implied
   * otherwise would be a promise the platform cannot keep - the same line the payment copy draws.
   */
  it("promises nothing in the band descriptions", () => {
    const copy = Object.values(TRUST_BAND_DESCRIPTIONS).join(" ").toLowerCase();

    for (const promise of [
      "guarantee",
      "guaranteed",
      "insured",
      "protected",
      "safe",
      "refund",
    ]) {
      expect(copy).not.toContain(promise);
    }
  });
});

describe("assessTrust — bounds", () => {
  it("never leaves 0..1", () => {
    const extreme = assessTrust(
      signals({
        completedRentals: 1_000_000,
        cancelledByThem: 1_000_000,
        ownerRating: { average: 5, count: 1_000_000 },
        isVerified: true,
        emailVerified: true,
      })
    );

    expect(extreme.score ?? 0).toBeGreaterThanOrEqual(0);
    expect(extreme.score ?? 1).toBeLessThanOrEqual(1);
  });

  it("survives a negative rental count without producing a negative component", () => {
    const nonsense = assessTrust(signals({ completedRentals: -5 }));

    expect(nonsense.components.experience).toBe(0);
    // Below the minimum, so it declines to score at all rather than scoring nonsense.
    expect(nonsense.score).toBeNull();
  });
});
