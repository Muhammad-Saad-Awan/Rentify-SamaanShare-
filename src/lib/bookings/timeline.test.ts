import { describe, expect, it } from "vitest";

import { BookingStatus } from "@/generated/prisma/enums";
import {
  BOOKING_STATUS_LABELS,
  buildBookingTimeline,
  isAwaitingAction,
} from "@/lib/bookings/timeline";
import { holdsDates } from "@/lib/bookings/lifecycle";

import type { BookingTimelineInput } from "@/lib/bookings/timeline";

/**
 * The reconstructed booking history.
 *
 * The load-bearing assertions are that the order is chronological rather than newest-first, and that
 * a transition with no timestamp of its own is marked `approximate`. The second is the one that
 * matters in a dispute: `updatedAt` is the best answer available for a decline, and a screen that
 * presented it as the recorded moment would be quotable back as fact.
 */

const at = (iso: string): Date => new Date(iso);

const input = (
  overrides: Partial<BookingTimelineInput> = {}
): BookingTimelineInput => ({
  status: BookingStatus.COMPLETED,
  createdAt: at("2026-08-01T09:00:00.000Z"),
  updatedAt: at("2026-08-10T09:00:00.000Z"),
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  cancelledByRole: null,
  statusReason: null,
  paymentConfirmedAt: null,
  depositReturnedAt: null,
  ...overrides,
});

describe("buildBookingTimeline", () => {
  it("always records the request", () => {
    const timeline = buildBookingTimeline(input());

    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.kind).toBe("requested");
    expect(timeline[0]?.approximate).toBe(false);
  });

  it("omits every event that was never recorded", () => {
    const timeline = buildBookingTimeline(
      input({ status: BookingStatus.PENDING })
    );

    expect(timeline.map((entry) => entry.kind)).toEqual(["requested"]);
  });

  /**
   * Oldest first, unlike every queue in this codebase. This is one story rather than a list of
   * unrelated items, and a story told backwards has to be reversed in the reader's head.
   */
  it("orders events oldest first", () => {
    const timeline = buildBookingTimeline(
      input({
        paymentConfirmedAt: at("2026-08-02T10:00:00.000Z"),
        startedAt: at("2026-08-03T10:00:00.000Z"),
        completedAt: at("2026-08-08T10:00:00.000Z"),
        depositReturnedAt: at("2026-08-09T10:00:00.000Z"),
      })
    );

    expect(timeline.map((entry) => entry.kind)).toEqual([
      "requested",
      "paid",
      "started",
      "completed",
      "deposit-returned",
    ]);
  });

  it("names which side cancelled, and carries the reason", () => {
    const timeline = buildBookingTimeline(
      input({
        status: BookingStatus.CANCELLED,
        cancelledAt: at("2026-08-02T10:00:00.000Z"),
        cancelledByRole: "renter",
        statusReason: "Plans changed.",
      })
    );

    const cancelled = timeline.find((entry) => entry.kind === "cancelled");

    expect(cancelled?.label).toBe("Cancelled by the renter");
    expect(cancelled?.detail).toBe("Plans changed.");
    expect(cancelled?.approximate).toBe(false);
  });

  /**
   * There is no `declinedAt` column, so `updatedAt` is the only answer available - and it is flagged
   * as such rather than presented as the recorded moment.
   */
  it("falls back to updatedAt for a decline, and says so", () => {
    const timeline = buildBookingTimeline(
      input({
        status: BookingStatus.DECLINED,
        statusReason: "Already lent out that week.",
      })
    );

    const declined = timeline.find((entry) => entry.kind === "declined");

    expect(declined?.at).toEqual(at("2026-08-10T09:00:00.000Z"));
    expect(declined?.approximate).toBe(true);
    expect(declined?.detail).toBe("Already lent out that week.");
  });

  it("does the same for an expiry", () => {
    const timeline = buildBookingTimeline(
      input({ status: BookingStatus.EXPIRED })
    );

    expect(
      timeline.find((entry) => entry.kind === "expired")?.approximate
    ).toBe(true);
  });

  /** A completed booking has real timestamps, so nothing on it is ever approximate. */
  it("marks nothing approximate when the timestamps exist", () => {
    const timeline = buildBookingTimeline(
      input({
        startedAt: at("2026-08-03T10:00:00.000Z"),
        completedAt: at("2026-08-08T10:00:00.000Z"),
      })
    );

    expect(timeline.some((entry) => entry.approximate)).toBe(false);
  });

  it("folds related records in chronologically", () => {
    const timeline = buildBookingTimeline(
      input({
        startedAt: at("2026-08-03T10:00:00.000Z"),
        completedAt: at("2026-08-08T10:00:00.000Z"),
        extra: [
          {
            kind: "claim",
            at: at("2026-08-09T10:00:00.000Z"),
            label: "Deposit claim filed",
          },
          {
            kind: "handover-pickup",
            at: at("2026-08-03T10:00:00.000Z"),
            label: "Pickup condition recorded",
          },
        ],
      })
    );

    expect(timeline.map((entry) => entry.kind)).toEqual([
      "requested",
      // Same instant as the pickup, and the lifecycle entry keeps its insertion order - the handover
      // describes the collection, so it reads after it.
      "started",
      "handover-pickup",
      "completed",
      "claim",
    ]);
  });
});

describe("isAwaitingAction", () => {
  it("covers the three states waiting on a person", () => {
    expect(isAwaitingAction(BookingStatus.PENDING)).toBe(true);
    expect(isAwaitingAction(BookingStatus.APPROVED)).toBe(true);
    expect(isAwaitingAction(BookingStatus.PAYMENT_PENDING)).toBe(true);
  });

  /**
   * ACTIVE is the distinction from `holdsDates`. An item out on rent is the system working, not a
   * booking stuck waiting for somebody - and a support screen that flagged every live rental as
   * needing attention would flag the healthy case.
   */
  it("does not treat a live rental as waiting, though it holds dates", () => {
    expect(isAwaitingAction(BookingStatus.ACTIVE)).toBe(false);
    expect(holdsDates(BookingStatus.ACTIVE)).toBe(true);
  });

  it("does not treat a terminal booking as waiting", () => {
    for (const status of [
      BookingStatus.COMPLETED,
      BookingStatus.REVIEWED,
      BookingStatus.DECLINED,
      BookingStatus.CANCELLED,
      BookingStatus.EXPIRED,
    ]) {
      expect(isAwaitingAction(status)).toBe(false);
    }
  });
});

describe("BOOKING_STATUS_LABELS", () => {
  /** A total record, so adding a status fails `tsc` here rather than rendering `PAYMENT_PENDING`. */
  it("labels every status with something readable", () => {
    for (const status of Object.values(BookingStatus)) {
      expect(BOOKING_STATUS_LABELS[status].length).toBeGreaterThan(0);
      expect(BOOKING_STATUS_LABELS[status]).not.toBe(status);
    }
  });
});
