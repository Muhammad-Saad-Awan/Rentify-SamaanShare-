/**
 * Rental price calculation.
 *
 * Pure and React-free. The server recomputes this from the listing's own rates on every
 * booking request and never trusts a total sent by the client - the browser shows the same
 * number only so the renter is not surprised.
 *
 * All amounts are whole rupees (schema decision D2), so every result is an integer.
 */

/** Days in the units an owner sets rates for. Calendar readings, matching how rates are set. */
const DAYS_PER_WEEK = 7;
const DAYS_PER_MONTH = 30;

/** Longest single booking. Beyond this, a rental is really a lease. */
export const MAX_BOOKING_DAYS = 90;

export interface RateCard {
  pricePerDay: number;
  pricePerWeek: number | null;
  pricePerMonth: number | null;
}

export interface PriceBreakdown {
  days: number;
  /** How the total was reached, for display: e.g. "1 week + 2 days". */
  label: string;
  total: number;
}

/**
 * Inclusive day count between two calendar days.
 *
 * Inclusive because renting "the 10th to the 12th" is three days of having the item, not two.
 * Both inputs are `YYYY-MM-DD`, and the arithmetic is done in UTC so no local offset can shift
 * the count.
 */
export function countRentalDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return 0;
  }

  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Every calendar day in the range, as `YYYY-MM-DD`.
 *
 * These become the `UnavailableDate` rows a booking holds, so the list has to be exact - one
 * missing day is a day someone else can double-book.
 */
export function enumerateRentalDays(
  startDate: string,
  endDate: string
): string[] {
  const days: string[] = [];
  const total = countRentalDays(startDate, endDate);
  const start = Date.parse(`${startDate}T00:00:00.000Z`);

  for (let offset = 0; offset < total; offset += 1) {
    days.push(new Date(start + offset * 86_400_000).toISOString().slice(0, 10));
  }

  return days;
}

/**
 * The cheapest total for `days` at the listing's rates.
 *
 * WHY CHEAPEST RATHER THAN A FIXED FORMULA. An owner who sets a weekly rate is offering a
 * discount, and the obvious implementation - whole weeks plus leftover days - overcharges at
 * the boundaries: at 6 days it ignores the weekly rate entirely, even when a full week costs
 * less than six days. Quoting a renter more than the owner's own price list implies is a bug
 * they would notice, so every sensible combination is priced and the lowest wins.
 *
 * The candidates are: daily only; whole weeks plus daily remainder; rounding up to the next
 * whole week; and the same two for months. Rounding up is what covers the boundary cases, and
 * it can never exceed the daily total because that is always a candidate too.
 */
export function calculateRentalPrice(
  days: number,
  rates: RateCard
): PriceBreakdown {
  if (days <= 0) {
    return { days: 0, label: "-", total: 0 };
  }

  const candidates: PriceBreakdown[] = [
    { days, label: pluralise(days, "day"), total: days * rates.pricePerDay },
  ];

  if (rates.pricePerWeek !== null) {
    candidates.push(
      ...unitCandidates(days, DAYS_PER_WEEK, rates.pricePerWeek, "week", rates)
    );
  }

  if (rates.pricePerMonth !== null) {
    candidates.push(
      ...unitCandidates(
        days,
        DAYS_PER_MONTH,
        rates.pricePerMonth,
        "month",
        rates
      )
    );
  }

  // Stable tie-break on the first candidate, so an equal-priced daily quote wins and the
  // label stays the simplest true description.
  return candidates.reduce((best, candidate) =>
    candidate.total < best.total ? candidate : best
  );
}

/**
 * Two ways to price `days` using a bulk unit: exact units plus daily remainder, and rounding
 * the remainder up to one more whole unit.
 */
function unitCandidates(
  days: number,
  unitDays: number,
  unitPrice: number,
  unitName: string,
  rates: RateCard
): PriceBreakdown[] {
  const wholeUnits = Math.floor(days / unitDays);
  const remainder = days % unitDays;
  const results: PriceBreakdown[] = [];

  if (wholeUnits > 0) {
    results.push({
      days,
      label: [
        pluralise(wholeUnits, unitName),
        remainder > 0 ? pluralise(remainder, "day") : null,
      ]
        .filter(Boolean)
        .join(" + "),
      total: wholeUnits * unitPrice + remainder * rates.pricePerDay,
    });
  }

  // Rounding up only makes sense when there is a remainder to absorb.
  if (remainder > 0) {
    results.push({
      days,
      label: `${pluralise(wholeUnits + 1, unitName)} (rounded up)`,
      total: (wholeUnits + 1) * unitPrice,
    });
  }

  return results;
}

function pluralise(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}
