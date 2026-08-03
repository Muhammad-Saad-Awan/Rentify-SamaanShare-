import { describe, expect, it } from "vitest";

import {
  buildMonthGrid,
  monthBounds,
  parseMonthParam,
  shiftMonth,
} from "@/lib/utils/calendar";

/**
 * Month arithmetic for the availability calendar.
 *
 * Every value is a calendar day rather than an instant, and all of it goes through `Date.UTC`
 * - a local-time constructor would shift the whole grid for anyone west of UTC and produce
 * off-by-one blocks. February and the December rollover are the cases that catch mistakes.
 */

describe("buildMonthGrid", () => {
  it("gets February right in and out of leap years", () => {
    expect(buildMonthGrid(2028, 2).cells).toHaveLength(29);
    expect(buildMonthGrid(2027, 2).cells).toHaveLength(28);
    // A century year divisible by 400 is a leap year; 1900 was not, 2000 was.
    expect(buildMonthGrid(2000, 2).cells).toHaveLength(29);
    expect(buildMonthGrid(2100, 2).cells).toHaveLength(28);
  });

  it("pads the first week so day one lands under its weekday", () => {
    // 1 August 2026 is a Saturday, and the grid starts on Monday.
    const august = buildMonthGrid(2026, 8);

    expect(august.leadingBlanks).toBe(5);
    expect(august.cells[0]?.date).toBe("2026-08-01");
    expect(august.cells.at(-1)?.date).toBe("2026-08-31");
  });

  it("pads nothing when the month already starts on a Monday", () => {
    // 1 June 2026 is a Monday.
    expect(buildMonthGrid(2026, 6).leadingBlanks).toBe(0);
  });

  it("zero-pads the date strings so they sort and compare as strings", () => {
    const january = buildMonthGrid(2026, 1);

    expect(january.cells[0]?.date).toBe("2026-01-01");
    expect(january.param).toBe("2026-01");
  });
});

describe("shiftMonth", () => {
  it("carries the year across December and January", () => {
    expect(shiftMonth(2026, 12, 1)).toBe("2027-01");
    expect(shiftMonth(2026, 1, -1)).toBe("2025-12");
  });

  it("handles multi-month offsets", () => {
    expect(shiftMonth(2026, 11, 3)).toBe("2027-02");
  });
});

describe("monthBounds", () => {
  it("spans the first to the last day, at UTC midnight", () => {
    const { from, to } = monthBounds(2026, 2);

    expect(from.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });
});

describe("parseMonthParam", () => {
  it("accepts a well-formed month", () => {
    expect(parseMonthParam("2026-09", "2026-08-03")).toEqual({
      year: 2026,
      month: 9,
    });
  });

  it("falls back rather than throwing, since the URL is user-editable", () => {
    const fallback = { year: 2026, month: 8 };

    expect(parseMonthParam(undefined, "2026-08-03")).toEqual(fallback);
    expect(parseMonthParam("nonsense", "2026-08-03")).toEqual(fallback);
    expect(parseMonthParam("2026-13", "2026-08-03")).toEqual(fallback);
    expect(parseMonthParam("2026-00", "2026-08-03")).toEqual(fallback);
    // Bounded, so the grid builder cannot be asked to span an absurd range.
    expect(parseMonthParam("999999-01", "2026-08-03")).toEqual(fallback);
  });

  it("takes the first value when the parameter repeats", () => {
    expect(parseMonthParam(["2026-05", "2026-06"], "2026-08-03").month).toBe(5);
  });
});
