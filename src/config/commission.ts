/**
 * SamaanShare's commission rate.
 *
 * A plain constant rather than a database table, and that is a deliberate choice about where the
 * rate has to be *correct* versus where it has to be *changeable*. Every payment freezes the rate
 * it was verified under onto its own row, so history is preserved by the data, not by this file.
 * Editing the number here changes what future bookings are charged and rewrites nothing that has
 * already happened. A config table only becomes worth its weight when an administrator needs to
 * change the rate without a deploy, and that is not a requirement today.
 *
 * Shaped like `DEPOSIT_RETURN_SLA_HOURS` and `ELEVATED_DEPOSIT_PKR` rather than like
 * `THEME_CONFIG`: one value, so an object wrapper would be ceremony. If a second field ever
 * arrives - a minimum fee, a per-category rate - that is the point to reshape it.
 */

/**
 * The platform's cut, in basis points. 1% = 100 bps, so 7.5% is 750.
 *
 * ZERO IS A REAL, WORKING CONFIGURATION, NOT A DISABLED FEATURE. The rate is deliberately unset
 * while the platform launches, and every part of settlement is built to work at zero: commission
 * is 0, the owner receives the whole rental, and the split still balances exactly. Nothing
 * downstream may treat 0 as "not configured yet" and refuse to settle - a booking at 0% settles
 * like any other.
 *
 * ANNOTATED `number`, NOT LEFT TO INFERENCE. Without it TypeScript narrows this to the literal
 * type `0`, and every `COMMISSION_RATE_BPS > 0` in the codebase becomes a statically-known false
 * that the compiler may flag or silently optimise around. The moment the rate is set to 750 those
 * comparisons would start behaving differently for reasons invisible at the call site.
 *
 * Must stay a whole number between 0 and 10,000 inclusive. `computeCommission` throws outside
 * that range, and `commission.test.ts` asserts this value is one it will accept - so a bad edit
 * fails in CI rather than during somebody's payout.
 */
export const COMMISSION_RATE_BPS: number = 0;
