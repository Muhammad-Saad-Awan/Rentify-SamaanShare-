/**
 * Month-grid arithmetic for the availability calendar.
 *
 * Pure and React-free, so it is unit-testable and usable from either a Server or a Client
 * Component.
 *
 * EVERY DATE HERE IS A CALENDAR DAY, not an instant. All arithmetic goes through `Date.UTC`
 * and every value is formatted as `YYYY-MM-DD`, which is what the `@db.Date` column stores
 * and what the toggle action expects. Using local-time constructors instead would shift the
 * whole grid by a day for anyone west of UTC and produce off-by-one blocks.
 */

export interface MonthCell {
  /** `YYYY-MM-DD`. */
  date: string;
  dayOfMonth: number;
}

export interface MonthGrid {
  year: number;
  /** 1-12, as a human writes it - not JavaScript's 0-11. */
  month: number;
  /** `YYYY-MM`, for building navigation links. */
  param: string;
  label: string;
  /**
   * Leading blanks before the first of the month, so day one lands under its weekday.
   * The week starts Monday.
   */
  leadingBlanks: number;
  cells: MonthCell[];
}

/** Weekday headings, Monday first. */
export const WEEKDAY_LABELS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
] as const;

/**
 * Reads `?month=YYYY-MM`, falling back to the month containing `fallbackDate`.
 *
 * Anything unparseable degrades to that fallback rather than throwing: the value comes from
 * a URL a user can edit, and a malformed one should show the current month, not a 500.
 * Bounded to a sensible range so `?month=999999-01` cannot make the grid builder loop over
 * an absurd span.
 */
export function parseMonthParam(
  raw: string | string[] | undefined,
  fallbackDate: string
): { year: number; month: number } {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const fallback = {
    year: Number(fallbackDate.slice(0, 4)),
    month: Number(fallbackDate.slice(5, 7)),
  };

  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return fallback;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));

  if (year < 2000 || year > 2100 || month < 1 || month > 12) {
    return fallback;
  }

  return { year, month };
}

/** Builds the grid for one month. */
export function buildMonthGrid(year: number, month: number): MonthGrid {
  const first = new Date(Date.UTC(year, month - 1, 1));

  // Day 0 of the *next* month is the last day of this one - avoids a table of month
  // lengths and gets February right in leap years for free.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  // `getUTCDay()` is 0 for Sunday; the grid starts on Monday, so Sunday becomes 6.
  const weekday = first.getUTCDay();
  const leadingBlanks = (weekday + 6) % 7;

  const cells: MonthCell[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      date: `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`,
      dayOfMonth: day,
    });
  }

  return {
    year,
    month,
    param: `${pad(year, 4)}-${pad(month, 2)}`,
    label: new Intl.DateTimeFormat("en-PK", {
      timeZone: "UTC",
      month: "long",
      year: "numeric",
    }).format(first),
    leadingBlanks,
    cells,
  };
}

/** The month `offset` months away, as a `YYYY-MM` parameter. */
export function shiftMonth(
  year: number,
  month: number,
  offset: number
): string {
  // Date arithmetic rather than manual modulo, so a December-to-January roll carries the
  // year without a special case.
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));

  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1, 2)}`;
}

/** First and last day of the month, as UTC midnight, for a database range query. */
export function monthBounds(
  year: number,
  month: number
): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, month - 1, 1)),
    to: new Date(Date.UTC(year, month, 0)),
  };
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, "0");
}
