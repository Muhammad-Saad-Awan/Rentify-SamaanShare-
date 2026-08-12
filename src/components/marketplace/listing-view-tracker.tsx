"use client";

import { useEffect, useRef } from "react";

import { recordListingView } from "@/actions/listing-views";
import { viewSessionKey } from "@/lib/listings/views";

interface ListingViewTrackerProps {
  listingId: string;
  /**
   * Whether to count this view at all.
   *
   * The page passes `false` for a signed-in owner looking at their own listing, so no request is made.
   * The action enforces the same rule independently - this only saves the round trip, it is not the
   * check.
   */
  enabled: boolean;
}

/**
 * Records one view, from the browser, once.
 *
 * WHY AN EFFECT AND NOT THE SERVER RENDER. `viewCount` has to be written by something that only
 * happens when a person actually looks at the page. A server render happens for crawlers, for link
 * previews, and for Next's own prefetch when a card scrolls into view - counting those would make the
 * number measure indexing rather than interest. An effect runs only in a mounted browser tree, and a
 * prefetch fetches the payload without mounting it.
 *
 * THREE GUARDS, DELIBERATELY OVERLAPPING. A ref stops React's development double-invoke and any
 * re-render from firing twice within one mount; `sessionStorage` stops a back-navigation or a refresh
 * within the same tab; and the server keeps a six-hour window per viewer for everything else. The
 * cheapest guard catches the commonest case, so the expensive one is rarely reached.
 *
 * Renders nothing.
 */
function ListingViewTracker({ listingId, enabled }: ListingViewTrackerProps) {
  // Survives a re-render; does not survive a remount, which `sessionStorage` covers.
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled || firedRef.current) {
      return;
    }

    firedRef.current = true;

    const key = viewSessionKey(listingId);

    /**
     * `sessionStorage` access is wrapped, both times.
     *
     * It throws rather than returning null in a Safari private window and under some enterprise
     * policies. An unguarded read here would take out the page it is attached to, for a view counter.
     */
    try {
      if (window.sessionStorage.getItem(key)) {
        return;
      }

      window.sessionStorage.setItem(key, "1");
    } catch {
      // No tab-level memory available; fall through and let the server's window do the deduping.
    }

    /**
     * Fire and forget, and swallow everything.
     *
     * The action already reports success unconditionally, so this catch is for a genuine network
     * failure. Either way the visitor must never see anything: they did not ask for this and cannot
     * act on it.
     */
    void recordListingView(listingId).catch(() => {});
  }, [enabled, listingId]);

  return null;
}

export { ListingViewTracker };
