import { describe, expect, it } from "vitest";

import { BookingStatus, PaymentStatus } from "@/generated/prisma/enums";
import {
  ALLOWED_BOOKING_TRANSITIONS,
  canEditInstructions,
  canRenterCancel,
  canStartBooking,
  canTransition,
  DATE_HOLDING_STATUSES,
  holdsDates,
  INSTRUCTIONS_EDITABLE_STATUSES,
  isPendingExpired,
  isTerminal,
  PENDING_EXPIRY_HOURS,
  pendingExpiryCutoff,
} from "@/lib/bookings/lifecycle";

/**
 * Booking state rules.
 *
 * Two invariants matter most here: which statuses hold the calendar (too narrow allows a
 * double booking, too wide leaves an owner blocked by a declined request), and that expiry is
 * evaluated against an injected instant rather than the wall clock.
 */

const now = new Date("2026-09-10T12:00:00.000Z");

describe("isPendingExpired", () => {
  it("expires only at or past the window", () => {
    const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

    expect(isPendingExpired(hoursAgo(47), now)).toBe(false);
    expect(isPendingExpired(hoursAgo(PENDING_EXPIRY_HOURS), now)).toBe(true);
    expect(isPendingExpired(hoursAgo(72), now)).toBe(true);
  });

  it("treats a future createdAt as not expired rather than throwing", () => {
    expect(isPendingExpired(new Date(now.getTime() + 3_600_000), now)).toBe(
      false
    );
  });
});

describe("pendingExpiryCutoff", () => {
  it("is exactly the window behind the given instant", () => {
    expect(pendingExpiryCutoff(now).toISOString()).toBe(
      "2026-09-08T12:00:00.000Z"
    );
  });

  it("agrees with isPendingExpired at the boundary", () => {
    // The sweep query uses the cutoff; the predicate is used for reasoning. They must match,
    // or a booking could be swept while the code believes it is still live.
    const cutoff = pendingExpiryCutoff(now);

    expect(isPendingExpired(cutoff, now)).toBe(true);
    expect(isPendingExpired(new Date(cutoff.getTime() + 1000), now)).toBe(
      false
    );
  });
});

describe("DATE_HOLDING_STATUSES", () => {
  it("holds dates through PENDING so two renters cannot both be approved", () => {
    expect(holdsDates("PENDING")).toBe(true);
    expect(holdsDates("APPROVED")).toBe(true);
    expect(holdsDates("PAYMENT_PENDING")).toBe(true);
    expect(holdsDates("ACTIVE")).toBe(true);
  });

  it("releases dates on every terminal status", () => {
    // A declined or expired request must not keep an owner's calendar occupied.
    expect(holdsDates("DECLINED")).toBe(false);
    expect(holdsDates("CANCELLED")).toBe(false);
    expect(holdsDates("EXPIRED")).toBe(false);
    expect(holdsDates("COMPLETED")).toBe(false);
    expect(holdsDates("REVIEWED")).toBe(false);
  });

  it("lists exactly the four live statuses", () => {
    expect([...DATE_HOLDING_STATUSES]).toEqual([
      "PENDING",
      "APPROVED",
      "PAYMENT_PENDING",
      "ACTIVE",
    ]);
  });
});

describe("ALLOWED_BOOKING_TRANSITIONS", () => {
  it("lets a pending request be approved, declined, cancelled or expired", () => {
    expect(canTransition("PENDING", "APPROVED")).toBe(true);
    expect(canTransition("PENDING", "DECLINED")).toBe(true);
    expect(canTransition("PENDING", "CANCELLED")).toBe(true);
    expect(canTransition("PENDING", "EXPIRED")).toBe(true);
  });

  it("refuses to resurrect a terminal booking", () => {
    for (const terminal of [
      "DECLINED",
      "CANCELLED",
      "EXPIRED",
      "REVIEWED",
    ] as const) {
      expect(ALLOWED_BOOKING_TRANSITIONS[terminal]).toEqual([]);
      expect(canTransition(terminal, "APPROVED")).toBe(false);
    }
  });

  it("refuses to skip the payment step", () => {
    // Approval cannot jump straight to ACTIVE; the payment slice owns that edge.
    expect(canTransition("APPROVED", "ACTIVE")).toBe(false);
    expect(canTransition("APPROVED", "PAYMENT_PENDING")).toBe(true);
  });

  it("refuses to approve something already approved", () => {
    expect(canTransition("APPROVED", "APPROVED")).toBe(false);
  });
});

describe("BookingStatus declaration order", () => {
  it("declares PENDING first, which the owner requests ordering relies on", () => {
    // `getOwnerBookingRequests` sorts by `status: "asc"` to surface pending requests, and
    // Postgres orders an enum by declaration order rather than alphabetically. Reordering the
    // enum in schema.prisma would silently reshuffle that screen, so it is pinned here.
    expect(Object.keys(ALLOWED_BOOKING_TRANSITIONS)[0]).toBe("PENDING");
  });
});

/**
 * Cancellation and pickup eligibility.
 *
 * These two guards carry the phase's most consequential rule: a renter may not cancel once the
 * owner has confirmed receiving money, because payment is offline and the platform cannot refund
 * what it never held. A regression here would put a Cancel button in front of a renter and then
 * fail - or worse, succeed and leave them out of pocket with no recourse.
 */

describe("canRenterCancel", () => {
  it("allows cancelling before the owner has responded", () => {
    expect(
      canRenterCancel({ status: BookingStatus.PENDING, paymentStatus: null })
    ).toEqual({ allowed: true });
  });

  it("allows cancelling after approval, before payment is arranged", () => {
    expect(
      canRenterCancel({ status: BookingStatus.APPROVED, paymentStatus: null })
    ).toEqual({ allowed: true });
  });

  it("allows cancelling while the payment is only arranged, not confirmed", () => {
    expect(
      canRenterCancel({
        status: BookingStatus.PAYMENT_PENDING,
        paymentStatus: PaymentStatus.AWAITING_CONFIRMATION,
      })
    ).toEqual({ allowed: true });
  });

  /** The rule the whole offline-payment design rests on. */
  it("refuses once the owner has confirmed receiving payment", () => {
    const result = canRenterCancel({
      status: BookingStatus.PAYMENT_PENDING,
      paymentStatus: PaymentStatus.COMPLETED,
    });

    expect(result.allowed).toBe(false);
    // The renter must be pointed at the owner, and must not be told the platform holds the money.
    expect(result).toMatchObject({
      reason: expect.stringContaining("does not hold"),
    });
  });

  it("refuses once the item is out", () => {
    expect(
      canRenterCancel({
        status: BookingStatus.ACTIVE,
        paymentStatus: PaymentStatus.COMPLETED,
      }).allowed
    ).toBe(false);
  });

  it("refuses on every terminal status", () => {
    for (const status of [
      BookingStatus.COMPLETED,
      BookingStatus.REVIEWED,
      BookingStatus.DECLINED,
      BookingStatus.CANCELLED,
      BookingStatus.EXPIRED,
    ]) {
      expect(canRenterCancel({ status, paymentStatus: null }).allowed).toBe(
        false
      );
    }
  });

  it("never permits a cancellation the transition table forbids", () => {
    // The two rules are written independently, so this pins them together: anything this guard
    // allows must also be a legal edge, or an action would pass its own check and then fail.
    for (const status of Object.values(BookingStatus)) {
      const eligible = canRenterCancel({
        status,
        paymentStatus: PaymentStatus.AWAITING_CONFIRMATION,
      }).allowed;

      if (eligible) {
        expect(canTransition(status, BookingStatus.CANCELLED)).toBe(true);
      }
    }
  });
});

describe("canStartBooking", () => {
  it("allows a pickup once payment is confirmed", () => {
    expect(
      canStartBooking({
        status: BookingStatus.PAYMENT_PENDING,
        paymentStatus: PaymentStatus.COMPLETED,
      })
    ).toEqual({ allowed: true });
  });

  it("refuses while the payment is merely arranged", () => {
    const result = canStartBooking({
      status: BookingStatus.PAYMENT_PENDING,
      paymentStatus: PaymentStatus.AWAITING_CONFIRMATION,
    });

    expect(result.allowed).toBe(false);
    expect(result).toMatchObject({
      reason: expect.stringContaining("received the rental payment"),
    });
  });

  it("refuses when no payment has been arranged at all", () => {
    expect(
      canStartBooking({
        status: BookingStatus.PAYMENT_PENDING,
        paymentStatus: null,
      }).allowed
    ).toBe(false);
  });

  it("explains that an approved booking is waiting on the renter", () => {
    expect(
      canStartBooking({
        status: BookingStatus.APPROVED,
        paymentStatus: null,
      })
    ).toMatchObject({
      allowed: false,
      reason: expect.stringContaining("not chosen how to pay"),
    });
  });

  it("refuses from every status other than PAYMENT_PENDING", () => {
    for (const status of Object.values(BookingStatus)) {
      if (status === BookingStatus.PAYMENT_PENDING) {
        continue;
      }

      expect(
        canStartBooking({ status, paymentStatus: PaymentStatus.COMPLETED })
          .allowed
      ).toBe(false);
    }
  });
});

describe("isTerminal", () => {
  it("is exactly the statuses with no outgoing edge", () => {
    expect(Object.values(BookingStatus).filter(isTerminal)).toEqual([
      BookingStatus.REVIEWED,
      BookingStatus.DECLINED,
      BookingStatus.CANCELLED,
      BookingStatus.EXPIRED,
    ]);
  });
});

describe("canEditInstructions", () => {
  it("allows editing through the whole live part of a booking", () => {
    for (const status of INSTRUCTIONS_EDITABLE_STATUSES) {
      expect(canEditInstructions(status)).toEqual({ allowed: true });
    }
  });

  it("points a pending request at approval instead", () => {
    // Instructions are collected as part of approving, so there is nothing to edit yet.
    expect(canEditInstructions(BookingStatus.PENDING)).toMatchObject({
      allowed: false,
      reason: expect.stringContaining("Approve the request first"),
    });
  });

  it("refuses once the booking is closed", () => {
    // Editing the record after the fact would rewrite details the renter may need to refer back
    // to - the only account either side has of where the handover was meant to happen.
    for (const status of [
      BookingStatus.COMPLETED,
      BookingStatus.REVIEWED,
      BookingStatus.DECLINED,
      BookingStatus.CANCELLED,
      BookingStatus.EXPIRED,
    ]) {
      expect(canEditInstructions(status).allowed).toBe(false);
    }
  });

  it("permits editing exactly the statuses that still hold their dates, minus PENDING", () => {
    // Not a coincidence worth relying on, but worth pinning: a booking whose dates are held is
    // one that is still going to happen, which is the same set that can still be redirected.
    const editable = Object.values(BookingStatus).filter(
      (status) => canEditInstructions(status).allowed
    );

    expect(editable).toEqual(
      DATE_HOLDING_STATUSES.filter((status) => status !== BookingStatus.PENDING)
    );
  });
});
