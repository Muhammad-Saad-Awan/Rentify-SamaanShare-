/**
 * View counting rules.
 *
 * WHY THIS IS NOT DONE ON THE SERVER RENDER. `Listing.viewCount` has existed since Phase 3 and the
 * owner's card has been rendering it since then, but nothing ever incremented it - so every owner
 * saw 0 views forever. The detail page deliberately refused to write it, and that refusal was right:
 * a GET that mutates fires on every crawler hit, every link preview, every Next prefetch and every
 * back-button return, so the number would have measured Google's curiosity rather than anyone's
 * interest.
 *
 * So the write happens from an effect in the browser instead. That inverts the problem: only a real
 * browser that actually rendered the page runs it, and a prefetch does not - Next fetches the RSC
 * payload without mounting the tree or running effects. Something that executes no JavaScript is not
 * counted, which for this metric is the desired behaviour rather than a limitation.
 *
 * Pure module: the keys and the window are testable without a database or a request.
 */

/**
 * How long one viewer's view of one listing counts once.
 *
 * Six hours, so refreshing, navigating away and back, or opening the page on a second device later
 * in the day does not inflate the number, while a genuine return visit tomorrow does count. Long
 * enough to be meaningful, short enough that "views" still tracks interest over time.
 */
export const VIEW_DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * Ceiling on how many distinct listings one viewer may register in an hour.
 *
 * The per-listing window above stops one page being counted twice; this stops a script walking the
 * catalogue and inflating everything once each, which the per-listing key cannot see. Well above
 * what a person browsing hard would reach.
 */
export const VIEW_ABUSE_LIMIT = 200;
export const VIEW_ABUSE_WINDOW_MS = 60 * 60 * 1000;

/**
 * The server-side dedupe key: one viewer, one listing.
 *
 * Includes the action name, per the rate limiter's contract - sharing a bucket with an unrelated
 * endpoint would mean a user who viewed many listings could no longer sign in.
 *
 * BEST EFFORT, and worth being clear about. The limiter holds its counters in one instance's memory,
 * so across several instances or after a cold start the same viewer can be counted more than once.
 * For a view counter that is an acceptable inaccuracy; it would not be for anything a decision hangs
 * on. The client-side guard below covers the common case - the same tab - without depending on it.
 */
export function viewDedupeKey(listingId: string, viewerKey: string): string {
  return `listing-view:${listingId}:${viewerKey}`;
}

/** The per-viewer abuse key, across all listings. */
export function viewAbuseKey(viewerKey: string): string {
  return `listing-view-total:${viewerKey}`;
}

/**
 * The browser-side guard key.
 *
 * `sessionStorage`, not `localStorage`: it is scoped to the tab and cleared when the tab closes, which
 * matches "do not count this again while I am still looking around". `localStorage` would suppress a
 * genuine return visit weeks later, and would persist a record of what someone browsed on a shared
 * machine.
 */
export function viewSessionKey(listingId: string): string {
  return `ss:viewed:${listingId}`;
}
