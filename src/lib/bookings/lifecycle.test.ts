import { describe, expect, it } from "vitest";

import {
  ALLOWED_BOOKING_TRANSITIONS,
  canTransition,
  DATE_HOLDING_STATUSES,
  holdsDates,
  isPendingExpired,
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
