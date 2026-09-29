import { describe, expect, it } from "vitest";

import { NotificationType } from "@/generated/prisma/enums";
import { buildPaymentNotifications } from "@/lib/notifications/payment-messages";

import type { PaymentEvent } from "@/lib/notifications/payment-messages";

/**
 * The custodial money copy.
 *
 * Two things are asserted throughout and they are the reason this file exists. WHO is told, since
 * notifying the wrong side of a money event is how a renter learns the platform's commission; and
 * that the FIGURE is present, since a money notification without one forces the reader to open
 * the app to find out whether the right amount was recorded.
 */

const BASE = {
  bookingId: "cmf0000000000000000000000",
  listingTitle: "Canon EOS R6 with 24-105mm lens",
  parties: { renterId: "renter-1", ownerId: "owner-1" },
};

function build(event: PaymentEvent) {
  return buildPaymentNotifications({ ...BASE, event });
}

describe("verified", () => {
  it("tells both parties, renter first", () => {
    const drafts = build({ event: "verified", amount: 4999 });

    expect(drafts).toHaveLength(2);
    expect(drafts[0]?.userId).toBe("renter-1");
    expect(drafts[1]?.userId).toBe("owner-1");
    expect(
      drafts.every((d) => d.type === NotificationType.PAYMENT_CONFIRMED)
    ).toBe(true);
  });

  it("states the amount to the renter", () => {
    const [renter] = build({ event: "verified", amount: 4999 });

    expect(renter?.title).toContain("4,999");
  });

  /** The owner's copy is the one that unblocks the handover, so it has to say so. */
  it("tells the owner they can hand over", () => {
    const [, owner] = build({ event: "verified", amount: 4999 });

    expect(owner?.body).toMatch(/hand the item over/i);
  });

  /** Each side's deep link points at their own screen. */
  it("points each side at their own dashboard", () => {
    const [renter, owner] = build({ event: "verified", amount: 4999 });

    expect(renter?.entityType).toBe("booking");
    expect(owner?.entityType).toBe("booking-request");
  });
});

describe("rejected", () => {
  it("tells only the renter, and carries the reason", () => {
    const drafts = build({
      event: "rejected",
      reason: "No transfer matching that reference.",
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.userId).toBe("renter-1");
    expect(drafts[0]?.type).toBe(NotificationType.PAYMENT_REJECTED);
    expect(drafts[0]?.body).toContain("No transfer matching that reference.");
  });
});

describe("verification-reversed", () => {
  /** The platform admitting an error. Silence here is worse than the error. */
  it("tells the renter, and says no action is needed", () => {
    const drafts = build({
      event: "verification-reversed",
      reason: "Verified against the wrong booking.",
    });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.userId).toBe("renter-1");
    expect(drafts[0]?.body).toMatch(/do not need to do anything/i);
  });
});

describe("settled", () => {
  const settled = {
    event: "settled",
    ownerRentalAmount: 4625,
    commissionAmount: 374,
    damageCompensationAmount: 0,
    depositReturnedAmount: 25_000,
  } as const;

  it("tells the renter what is coming back", () => {
    const [renter] = build(settled);

    expect(renter?.userId).toBe("renter-1");
    expect(renter?.title).toContain("25,000");
  });

  /**
   * The commission belongs in the owner's copy and nowhere else. This is the assertion that
   * would fail if somebody reused one string for both sides.
   */
  it("never shows the renter the commission", () => {
    const [renter, owner] = build(settled);

    expect(`${renter?.title} ${renter?.body ?? ""}`).not.toContain("374");
    expect(owner?.body).toContain("374");
  });

  it("keeps rental and damage compensation separate for the owner", () => {
    const [, owner] = build({
      ...settled,
      damageCompensationAmount: 6_000,
      depositReturnedAmount: 19_000,
    });

    expect(owner?.body).toContain("4,625");
    expect(owner?.body).toContain("6,000");
  });

  it("tells the renter when a claim took part of the deposit", () => {
    const [renter] = build({
      ...settled,
      damageCompensationAmount: 6_000,
      depositReturnedAmount: 19_000,
    });

    expect(renter?.body).toContain("6,000");
  });

  /** A deposit entirely consumed by a claim has nothing "on its way back" to promise. */
  it("does not promise a return when nothing is coming back", () => {
    const [renter] = build({
      ...settled,
      damageCompensationAmount: 25_000,
      depositReturnedAmount: 0,
    });

    expect(renter?.title).not.toMatch(/on its way back/i);
  });
});

describe("the transfers", () => {
  it("tells only the owner they were paid", () => {
    const drafts = build({ event: "owner-paid", amount: 4625 });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.userId).toBe("owner-1");
    expect(drafts[0]?.type).toBe(NotificationType.OWNER_PAID);
    expect(drafts[0]?.title).toContain("4,625");
  });

  /**
   * Reuses the offline flow's type, but not its body. There the renter was pointed at the owner
   * because the platform held nothing; here the platform sent the money and owns the problem.
   */
  it("points the renter at us, not at the owner", () => {
    const drafts = build({ event: "deposit-returned", amount: 25_000 });

    expect(drafts[0]?.type).toBe(NotificationType.DEPOSIT_RETURNED);
    expect(drafts[0]?.body).toMatch(/tell us if it does not/i);
    expect(drafts[0]?.body).not.toMatch(/owner/i);
  });

  it("covers a refund before its action exists", () => {
    const drafts = build({ event: "refunded", amount: 4999 });

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.userId).toBe("renter-1");
    expect(drafts[0]?.type).toBe(NotificationType.REFUND_RECORDED);
    expect(drafts[0]?.title).toContain("4,999");
  });
});

/** A long listing title is clipped, as everywhere else, so a title stays readable in a panel. */
describe("titles", () => {
  it("clips a long item name", () => {
    const drafts = buildPaymentNotifications({
      ...BASE,
      listingTitle: "A".repeat(200),
      event: { event: "owner-paid", amount: 100 },
    });

    expect(drafts[0]?.title.length).toBeLessThan(150);
  });
});
