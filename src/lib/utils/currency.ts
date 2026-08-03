import { LOCALE_CONFIG } from "@/config/locale";

/**
 * PKR display formatting.
 *
 * Every money column in the schema is an `Int` of whole rupees - PKR has no
 * circulating fractional unit - so these helpers take a `number` and never a
 * `Decimal`. Nothing here rounds: a non-integer input is a bug upstream, not
 * something to paper over at the display layer.
 */

/**
 * Grouping separator only, no currency symbol and no decimals.
 *
 * `Intl.NumberFormat` with `style: "currency"` is deliberately avoided. Its
 * symbol and symbol placement for PKR differ between ICU builds - Node on the
 * server and the user's browser can disagree - and a price rendered by a Server
 * Component that formats differently on hydration is a hydration mismatch. Only
 * the digit grouping comes from `Intl`, and the symbol is prepended by us so it
 * is identical on both sides.
 */
function formatRupeeDigits(amount: number): string {
  return new Intl.NumberFormat(LOCALE_CONFIG.currency.locale, {
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * A rupee amount with its symbol, e.g. `Rs. 1,500`.
 *
 * Note the grouping follows `en-PK`, which groups in the South Asian style past
 * six digits (`15,00,000` rather than `1,500,000`). That is intentional for a
 * Pakistani audience.
 */
export function formatPKR(amount: number): string {
  return `${LOCALE_CONFIG.currency.symbol} ${formatRupeeDigits(amount)}`;
}

/**
 * A rental rate, e.g. `Rs. 1,500 / day`.
 *
 * The unit is spelled out rather than abbreviated to `/d`: listing cards are
 * scanned quickly and an ambiguous unit is worse than three extra characters.
 */
export function formatPKRPerDay(amount: number): string {
  return `${formatPKR(amount)} / day`;
}
