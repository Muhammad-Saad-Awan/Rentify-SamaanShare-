import { LOCALE_CONFIG } from "@/config/locale";

/**
 * Date formatting pinned to Asia/Karachi.
 *
 * The timezone is passed explicitly on every call, which is the whole point of
 * this module. A deployed server runs in UTC while the visitor's browser is at
 * +05:00, so an unpinned formatter produces one string during server rendering
 * and a different one after hydration - and near midnight it disagrees about
 * the calendar day itself. Pinning both sides to the market's timezone makes
 * the output deterministic and matches what a Pakistani user expects to read.
 *
 * Rental *availability* dates are a separate concern: those are calendar days
 * with no time component and will need their own handling when the booking
 * calendar lands, not these display helpers.
 */

/**
 * Today's calendar date in Asia/Karachi, as `YYYY-MM-DD`.
 *
 * The market's "today", not the server's. A deployed server runs in UTC, so between
 * midnight and 05:00 Karachi time `new Date().toISOString()` still reports yesterday -
 * which would let an owner block a day that has already started for them, and would show
 * a past day as selectable in the calendar.
 *
 * `en-CA` because its short date format is exactly ISO `YYYY-MM-DD`, which makes the
 * result directly comparable to the date strings used throughout the app.
 */
export function todayInKarachi(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LOCALE_CONFIG.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** e.g. `03 Aug 2026`. */
export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: LOCALE_CONFIG.timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** e.g. `03 Aug 2026, 04:35 pm`. */
export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-PK", {
    timeZone: LOCALE_CONFIG.timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
