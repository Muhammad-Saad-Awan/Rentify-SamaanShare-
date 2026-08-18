import { describe, expect, it } from "vitest";

import {
  accessTierDescription,
  accessTierFor,
  checkRenterAccess,
  ELEVATED_DEPOSIT_PKR,
  ESTABLISHED_RENTAL_COUNT,
  HIGH_VALUE_DEPOSIT_PKR,
} from "@/lib/trust/access";

import type { AccessTier, RenterAccessSignals } from "@/lib/trust/access";

/**
 * Value-gated access.
 *
 * The load-bearing assertions are that a gate can always be cleared, that the top tier does not
 * depend solely on something no renter can grant themselves, and that a refusal always says what is
 * missing. A gate nobody can pass is an outage; a refusal with no reason reads as a judgement about
 * the person.
 */

const nobody: RenterAccessSignals = {
  emailVerified: false,
  isVerified: false,
  completedRentals: 0,
};

const renter = (overrides: Partial<RenterAccessSignals>) => ({
  ...nobody,
  ...overrides,
});

const ALL_TIERS: AccessTier[] = ["open", "elevated", "high-value"];

describe("accessTierFor", () => {
  it("leaves a listing with no deposit open", () => {
    expect(accessTierFor(0)).toBe("open");
  });

  it("is inclusive at each threshold", () => {
    expect(accessTierFor(ELEVATED_DEPOSIT_PKR)).toBe("elevated");
    expect(accessTierFor(HIGH_VALUE_DEPOSIT_PKR)).toBe("high-value");
  });

  it("stays a tier below just under each threshold", () => {
    expect(accessTierFor(ELEVATED_DEPOSIT_PKR - 1)).toBe("open");
    expect(accessTierFor(HIGH_VALUE_DEPOSIT_PKR - 1)).toBe("elevated");
  });

  /** The overwhelming majority of the marketplace. Friction here costs more than it saves. */
  it("leaves an everyday item open", () => {
    expect(accessTierFor(2_000)).toBe("open");
  });

  it("never returns anything but a known tier, at any deposit", () => {
    for (const deposit of [
      -1, 0, 1, 24_999, 25_000, 99_999, 100_000, 5_000_000,
    ]) {
      expect(ALL_TIERS).toContain(accessTierFor(deposit));
    }
  });
});

describe("checkRenterAccess — open", () => {
  it("asks nothing of anyone", () => {
    expect(checkRenterAccess("open", nobody).allowed).toBe(true);
  });
});

describe("checkRenterAccess — elevated", () => {
  it("asks only for a confirmed email address", () => {
    expect(
      checkRenterAccess("elevated", renter({ emailVerified: true })).allowed
    ).toBe(true);
  });

  it("refuses an unconfirmed address, and says so", () => {
    const decision = checkRenterAccess("elevated", nobody);

    expect(decision.allowed).toBe(false);

    if (!decision.allowed) {
      expect(decision.unmet.map((u) => u.key)).toEqual(["email"]);
    }
  });

  /** A long track record is not a substitute here: the requirement is reachability, not standing. */
  it("does not accept a track record instead of a confirmed address", () => {
    expect(
      checkRenterAccess("elevated", renter({ completedRentals: 50 })).allowed
    ).toBe(false);
  });
});

describe("checkRenterAccess — high value", () => {
  it("accepts a confirmed address plus a verified identity", () => {
    expect(
      checkRenterAccess(
        "high-value",
        renter({ emailVerified: true, isVerified: true })
      ).allowed
    ).toBe(true);
  });

  /**
   * THE ONE THAT MATTERS.
   *
   * Identity verification is granted by an administrator out of band, so at launch nobody has it.
   * Requiring it alone would make every high-value listing unbookable by everyone - a rule so strict
   * it stops the feature working is an outage, not a safety measure.
   */
  it("accepts a real track record instead of a verified identity", () => {
    expect(
      checkRenterAccess(
        "high-value",
        renter({
          emailVerified: true,
          completedRentals: ESTABLISHED_RENTAL_COUNT,
        })
      ).allowed
    ).toBe(true);
  });

  it("refuses a track record one rental short", () => {
    expect(
      checkRenterAccess(
        "high-value",
        renter({
          emailVerified: true,
          completedRentals: ESTABLISHED_RENTAL_COUNT - 1,
        })
      ).allowed
    ).toBe(false);
  });

  it("still requires a confirmed address from a verified member", () => {
    const decision = checkRenterAccess(
      "high-value",
      renter({ isVerified: true })
    );

    expect(decision.allowed).toBe(false);

    if (!decision.allowed) {
      expect(decision.unmet.map((u) => u.key)).toEqual(["email"]);
    }
  });

  it("reports both failures at once rather than one at a time", () => {
    const decision = checkRenterAccess("high-value", nobody);

    expect(decision.allowed).toBe(false);

    if (!decision.allowed) {
      // Drip-feeding requirements one refusal at a time is how someone gives up on the second.
      expect(decision.unmet.map((u) => u.key)).toEqual([
        "email",
        "identity-or-history",
      ]);
    }
  });
});

describe("checkRenterAccess — every refusal is actionable", () => {
  /**
   * A gate that cannot be cleared is a dead end wearing the costume of a safety feature. Every
   * refusal has to name something the renter can do next.
   */
  it("always explains what is missing and what to do", () => {
    for (const tier of ALL_TIERS) {
      const decision = checkRenterAccess(tier, nobody);

      if (decision.allowed) {
        continue;
      }

      for (const requirement of decision.unmet) {
        expect(requirement.label.length).toBeGreaterThan(10);
        expect(requirement.action.length).toBeGreaterThan(10);
      }
    }
  });

  /** Someone at the top tier can always reach it, by one route or the other. */
  it("is clearable at every tier by some achievable state", () => {
    const established = renter({
      emailVerified: true,
      completedRentals: ESTABLISHED_RENTAL_COUNT,
    });

    for (const tier of ALL_TIERS) {
      expect(checkRenterAccess(tier, established).allowed).toBe(true);
    }
  });

  it("counts the renter's actual progress back to them", () => {
    const decision = checkRenterAccess(
      "high-value",
      renter({ emailVerified: true, completedRentals: 1 })
    );

    if (decision.allowed) {
      throw new Error("expected a refusal");
    }

    expect(decision.unmet[0]?.action).toContain("1 completed rental");
  });
});

describe("accessTierDescription", () => {
  it("says nothing about an open listing", () => {
    expect(accessTierDescription("open")).toBeNull();
  });

  it("describes the gated tiers", () => {
    expect(accessTierDescription("elevated")?.length ?? 0).toBeGreaterThan(20);
    expect(accessTierDescription("high-value")?.length ?? 0).toBeGreaterThan(
      20
    );
  });

  /**
   * SamaanShare holds no deposit and settles no dispute. Copy implying that clearing a gate makes a
   * rental safe would be a promise the platform cannot keep - the same line the payment copy draws.
   */
  it("promises nothing about safety", () => {
    const copy = ALL_TIERS.map((tier) => accessTierDescription(tier) ?? "")
      .join(" ")
      .toLowerCase();

    for (const promise of [
      "guarantee",
      "guaranteed",
      "safe",
      "secure",
      "protected",
      "insured",
    ]) {
      expect(copy).not.toContain(promise);
    }
  });
});
