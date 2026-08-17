/**
 * Value-gated access. Pure, so all of this is testable without a database.
 *
 * THE PROBLEM. Payment is offline and there is no escrow, so when an owner hands over a generator or
 * a camera body the platform is holding nothing that could make them whole. The only thing standing
 * between them and a stranger is what is known about that stranger. On a PKR 800 drill that is fine.
 * On something worth six figures it is not, and "trust your judgement" is not a feature.
 *
 * SO ACCESS IS PROPORTIONAL TO WHAT IS AT STAKE. A booking request on a low-value item needs nothing
 * but an account. Higher up, the renter has to have shown something about themselves first.
 *
 * FOUR PROPERTIES THIS PROTECTS.
 *
 * 1. Every requirement is one the renter can actually clear. A gate that cannot be passed is a dead
 *    end wearing the costume of a safety feature, and the person hitting it has no idea what to do.
 *
 * 2. The gate is measured against what the OWNER said is at risk - the security deposit - not
 *    against a number the platform invented. An owner who wants fewer hurdles can ask for a smaller
 *    deposit, and they carry that risk themselves. The incentive points the right way on its own.
 *
 * 3. Nothing here is a promise. Clearing a gate does not make a rental safe and the copy never says
 *    it does, for the same reason no payment string implies SamaanShare holds the deposit.
 *
 * 4. The reason is always given in full. A refusal that says only "you cannot book this" tells the
 *    renter nothing and reads as a judgement about them.
 */

/**
 * Deposit thresholds, in PKR.
 *
 * A product judgement rather than a derivation, and stated here so it can be argued with rather than
 * discovered in a condition somewhere. PKR 25,000 is roughly where an item stops being replaceable
 * out of pocket for most people; PKR 100,000 is where losing it is a serious event.
 *
 * Applied to `Listing.securityDeposit`, which is the owner's own statement of what it would take to
 * make them whole. A listing with no deposit is one where the owner has declared nothing at risk, so
 * it gates nothing - that is their call to make, and the consequence lands on them.
 */
export const ELEVATED_DEPOSIT_PKR = 25_000;
export const HIGH_VALUE_DEPOSIT_PKR = 100_000;

/** Completed rentals that stand in for a verified identity at the top tier. */
export const ESTABLISHED_RENTAL_COUNT = 3;

export type AccessTier = "open" | "elevated" | "high-value";

/**
 * Which tier a listing sits in.
 *
 * Reads the deposit only. Daily price is a poor proxy - a cheap daily rate on an expensive item is
 * exactly how someone would price to attract volume - and there is no separate declared value on the
 * model to read instead.
 */
export function accessTierFor(securityDeposit: number): AccessTier {
  if (securityDeposit >= HIGH_VALUE_DEPOSIT_PKR) {
    return "high-value";
  }

  if (securityDeposit >= ELEVATED_DEPOSIT_PKR) {
    return "elevated";
  }

  return "open";
}

/** What the platform knows about a prospective renter. All of it already stored. */
export interface RenterAccessSignals {
  /** Whether their email address has been confirmed. */
  emailVerified: boolean;
  /** Whether SamaanShare has verified their identity. */
  isVerified: boolean;
  /** Rentals they have carried to completion, on either side. */
  completedRentals: number;
}

/** A requirement the renter has not met, and how to meet it. */
export interface UnmetRequirement {
  /** Stable key, so the UI can attach a link without matching on prose. */
  key: "email" | "identity-or-history";
  /** What is missing, addressed to the renter. */
  label: string;
  /** What to do about it. */
  action: string;
}

export type AccessDecision =
  { allowed: true } | { allowed: false; unmet: UnmetRequirement[] };

/**
 * Whether this renter may request this listing.
 *
 * THE TIERS.
 *
 * `open` asks for nothing beyond an account. Most of the marketplace is here, and adding friction to
 * a PKR 500 drill would cost far more in abandoned bookings than it could ever save.
 *
 * `elevated` asks for a confirmed email address. Cheap to clear, one click, and it is the difference
 * between an account with a reachable person behind it and one made in ten seconds with a throwaway
 * address. That is most of the value in stopping casual abuse.
 *
 * `high-value` asks for a confirmed address AND either a verified identity or a real track record.
 *
 * THE "OR" IS THE LOAD-BEARING PART. Requiring verification alone would be stricter on paper and
 * worse in practice: identity verification is granted by an administrator out of band, so at launch
 * nobody has it and every high-value listing would be unbookable by everyone - a rule so strict it
 * stops the feature working is not a safety measure, it is an outage. Three completed rentals is a
 * different kind of evidence for the same thing: an account with a history it would lose. As
 * verification becomes self-service the balance can shift, and the constant is one edit.
 */
export function checkRenterAccess(
  tier: AccessTier,
  renter: RenterAccessSignals
): AccessDecision {
  if (tier === "open") {
    return { allowed: true };
  }

  const unmet: UnmetRequirement[] = [];

  if (!renter.emailVerified) {
    unmet.push({
      key: "email",
      label: "Your email address is not confirmed",
      action: "Send yourself a confirmation link from your profile.",
    });
  }

  if (
    tier === "high-value" &&
    !renter.isVerified &&
    renter.completedRentals < ESTABLISHED_RENTAL_COUNT
  ) {
    unmet.push({
      key: "identity-or-history",
      label: `Items with a deposit this high need a verified identity, or ${ESTABLISHED_RENTAL_COUNT} completed rentals`,
      action: `You have ${renter.completedRentals} completed ${
        renter.completedRentals === 1 ? "rental" : "rentals"
      }. Renting a few lower-value items first is the quickest route.`,
    });
  }

  return unmet.length === 0 ? { allowed: true } : { allowed: false, unmet };
}

/**
 * One sentence naming what a tier asks for, shown on the listing before anyone tries to book.
 *
 * Stated up front rather than only on refusal. Someone who cannot rent an item should learn that
 * while they are reading it, not after choosing dates and pressing the button - and an owner setting
 * a large deposit should be able to see what they have just asked of their renters.
 */
export function accessTierDescription(tier: AccessTier): string | null {
  switch (tier) {
    case "open":
      return null;
    case "elevated":
      return "Because of the deposit on this item, the owner is only shown requests from members with a confirmed email address.";
    case "high-value":
      return `Because of the deposit on this item, requests come only from members with a confirmed email address and either a verified identity or ${ESTABLISHED_RENTAL_COUNT} completed rentals.`;
  }
}
