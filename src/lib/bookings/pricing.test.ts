import { describe, expect, it } from "vitest";

import {
  calculateRentalPrice,
  countRentalDays,
  enumerateRentalDays,
} from "@/lib/bookings/pricing";

/**
 * Rental pricing and date maths.
 *
 * The day list is what becomes the `UnavailableDate` rows a booking holds, so an off-by-one
 * here is a day someone else can double-book. The price is recomputed server-side on every
 * request, so it is the number a renter is actually charged.
 */

describe("countRentalDays", () => {
  it("counts inclusively", () => {
    // Renting the 10th to the 12th is three days of having the item, not two.
    expect(countRentalDays("2026-09-10", "2026-09-12")).toBe(3);
    expect(countRentalDays("2026-09-10", "2026-09-10")).toBe(1);
  });

  it("spans month and year boundaries", () => {
    expect(countRentalDays("2026-08-30", "2026-09-02")).toBe(4);
    expect(countRentalDays("2026-12-31", "2027-01-01")).toBe(2);
  });

  it("counts the leap day", () => {
    expect(countRentalDays("2028-02-28", "2028-03-01")).toBe(3);
    expect(countRentalDays("2027-02-28", "2027-03-01")).toBe(2);
  });

  it("returns zero for a reversed or unparseable range", () => {
    expect(countRentalDays("2026-09-12", "2026-09-10")).toBe(0);
    expect(countRentalDays("nonsense", "2026-09-10")).toBe(0);
  });
});

describe("enumerateRentalDays", () => {
  it("lists every day inclusively", () => {
    expect(enumerateRentalDays("2026-09-10", "2026-09-13")).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });

  it("rolls over a month boundary without a gap or duplicate", () => {
    const days = enumerateRentalDays("2026-08-30", "2026-09-02");

    expect(days).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
    ]);
    expect(new Set(days).size).toBe(days.length);
  });

  it("matches the counted length exactly", () => {
    // These two must never disagree: one sizes the price, the other reserves the calendar.
    for (const [start, end] of [
      ["2026-09-01", "2026-09-01"],
      ["2026-09-01", "2026-09-30"],
      ["2026-12-20", "2027-01-05"],
      ["2028-02-27", "2028-03-02"],
    ] as const) {
      expect(enumerateRentalDays(start, end)).toHaveLength(
        countRentalDays(start, end)
      );
    }
  });
});

describe("calculateRentalPrice", () => {
  const dailyOnly = {
    pricePerDay: 1000,
    pricePerWeek: null,
    pricePerMonth: null,
  };
  const withWeek = {
    pricePerDay: 1000,
    pricePerWeek: 6000,
    pricePerMonth: null,
  };
  const withBoth = {
    pricePerDay: 1000,
    pricePerWeek: 6000,
    pricePerMonth: 20000,
  };

  it("multiplies the daily rate when that is all there is", () => {
    expect(calculateRentalPrice(3, dailyOnly).total).toBe(3000);
    expect(calculateRentalPrice(3, dailyOnly).label).toBe("3 days");
    expect(calculateRentalPrice(1, dailyOnly).label).toBe("1 day");
  });

  it("uses whole weeks plus a daily remainder", () => {
    // 9 days = 1 week (6000) + 2 days (2000).
    const quote = calculateRentalPrice(9, withWeek);

    expect(quote.total).toBe(8000);
    expect(quote.label).toBe("1 week + 2 days");
  });

  it("rounds up to a whole week when that is cheaper than the days", () => {
    // THE CASE A NAIVE FORMULA GETS WRONG. 6 days at 1000 is 6000, and a full week is also
    // 6000 - so whole-weeks-plus-remainder would quote 6000 while ignoring the week entirely.
    // At 7 days the week must win outright.
    expect(calculateRentalPrice(7, withWeek).total).toBe(6000);
    // 8 days: a week plus a day (7000) beats rounding to two weeks (12000).
    expect(calculateRentalPrice(8, withWeek).total).toBe(7000);
    // 13 days: two weeks (12000) beats one week plus six days (12000) on tie, and both beat
    // 13 daily (13000).
    expect(calculateRentalPrice(13, withWeek).total).toBe(12000);
  });

  it("never quotes more than the plain daily total", () => {
    // The daily total is always a candidate, so a bulk rate can only ever help.
    for (let days = 1; days <= 90; days += 1) {
      expect(calculateRentalPrice(days, withBoth).total).toBeLessThanOrEqual(
        days * withBoth.pricePerDay
      );
    }
  });

  it("prefers a month once it beats the weekly mix", () => {
    // 30 days: one month is 20000 against four weeks plus two days (26000).
    const quote = calculateRentalPrice(30, withBoth);

    expect(quote.total).toBe(20000);
    expect(quote.label).toContain("month");
  });

  it("combines months with the cheapest tail", () => {
    // 35 days: a month (20000) + 5 days (5000) = 25000, versus rounding to two months
    // (40000). The month-plus-tail path must win.
    expect(calculateRentalPrice(35, withBoth).total).toBe(25000);
  });

  it("always returns whole rupees", () => {
    for (let days = 1; days <= 45; days += 1) {
      expect(Number.isInteger(calculateRentalPrice(days, withBoth).total)).toBe(
        true
      );
    }
  });

  it("returns zero for a non-positive span", () => {
    expect(calculateRentalPrice(0, withBoth).total).toBe(0);
    expect(calculateRentalPrice(-2, withBoth).total).toBe(0);
  });
});
