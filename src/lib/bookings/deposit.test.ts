import { describe, expect, it } from "vitest";

import {
  DEPOSIT_RETURN_SLA_HOURS,
  depositReturnDueAt,
  depositState,
} from "@/lib/bookings/deposit";

/**
 * The deposit-return window.
 *
 * What matters here is the *ordering* of the checks, not the arithmetic. A returned deposit must
 * win over an expired clock, a zero deposit must never produce a countdown, and an incomplete
 * rental must never start one - each of those is a state the UI renders different copy for, and
 * getting the precedence wrong shows an owner a demand for money they already returned.
 */

const completedAt = new Date("2026-09-10T12:00:00.000Z");
const hoursAfter = (h: number) =>
  new Date(completedAt.getTime() + h * 3_600_000);

describe("depositReturnDueAt", () => {
  it("is exactly the window after completion", () => {
    expect(depositReturnDueAt(completedAt).toISOString()).toBe(
      hoursAfter(DEPOSIT_RETURN_SLA_HOURS).toISOString()
    );
  });
});

describe("depositState", () => {
  it("reports none for a zero deposit, even after completion", () => {
    expect(
      depositState({
        securityDeposit: 0,
        completedAt,
        depositReturnedAt: null,
        now: hoursAfter(100),
      })
    ).toEqual({ kind: "none" });
  });

  it("reports not-due while the rental is unfinished", () => {
    expect(
      depositState({
        securityDeposit: 5000,
        completedAt: null,
        depositReturnedAt: null,
        now: completedAt,
      })
    ).toEqual({ kind: "not-due" });
  });

  it("counts down inside the window, rounding the partial hour up", () => {
    // 30 minutes in: 47.5 hours remain, which must read as 48 rather than 47 - the renter is
    // told how long the owner still has, and truncating would understate it.
    const state = depositState({
      securityDeposit: 5000,
      completedAt,
      depositReturnedAt: null,
      now: hoursAfter(0.5),
    });

    expect(state.kind).toBe("due");
    expect(state).toMatchObject({ hoursRemaining: 48 });
  });

  it("reports one hour remaining through the final minute", () => {
    const state = depositState({
      securityDeposit: 5000,
      completedAt,
      depositReturnedAt: null,
      now: hoursAfter(DEPOSIT_RETURN_SLA_HOURS - 0.01),
    });

    expect(state).toMatchObject({ kind: "due", hoursRemaining: 1 });
  });

  it("flips to overdue exactly at the boundary", () => {
    const state = depositState({
      securityDeposit: 5000,
      completedAt,
      depositReturnedAt: null,
      now: hoursAfter(DEPOSIT_RETURN_SLA_HOURS),
    });

    // Not "due, 0h remaining": at the boundary the window has closed.
    expect(state.kind).toBe("overdue");
  });

  it("counts how late an overdue deposit is", () => {
    expect(
      depositState({
        securityDeposit: 5000,
        completedAt,
        depositReturnedAt: null,
        now: hoursAfter(DEPOSIT_RETURN_SLA_HOURS + 5),
      })
    ).toMatchObject({ kind: "overdue", hoursLate: 5 });
  });

  /**
   * The precedence test, and the reason the checks are ordered as they are.
   *
   * An owner who returned the deposit late must not keep seeing an overdue warning forever. The
   * record of what happened outranks the clock that mattered only while it was outstanding.
   */
  it("reports returned even when the return was late", () => {
    const returnedAt = hoursAfter(DEPOSIT_RETURN_SLA_HOURS + 12);

    expect(
      depositState({
        securityDeposit: 5000,
        completedAt,
        depositReturnedAt: returnedAt,
        now: hoursAfter(200),
      })
    ).toEqual({ kind: "returned", returnedAt });
  });

  it("reports returned even if the rental has no completion timestamp", () => {
    const returnedAt = hoursAfter(1);

    expect(
      depositState({
        securityDeposit: 5000,
        completedAt: null,
        depositReturnedAt: returnedAt,
        now: hoursAfter(2),
      })
    ).toEqual({ kind: "returned", returnedAt });
  });
});
