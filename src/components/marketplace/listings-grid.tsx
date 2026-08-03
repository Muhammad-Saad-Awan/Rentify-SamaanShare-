import { ListingCard } from "@/components/marketplace/listing-card";

import type { ListingCardData } from "@/lib/queries/listings";

/**
 * Default leading cards to preload when a caller says the grid is above the fold.
 *
 * Four covers the widest single row (`xl:grid-cols-4`).
 */
export const ABOVE_FOLD_PRIORITY_COUNT = 4;

interface ListingsGridProps {
  listings: readonly ListingCardData[];
  /**
   * Active search term, forwarded to every card for highlighting.
   *
   * Passed down rather than read from the URL here: the grid is a Server Component
   * and has no access to `searchParams`, and threading it keeps the grid reusable
   * on the homepage and category pages, where there is no search.
   */
  searchTerm?: string | null;
  /**
   * Ids the viewer has saved, from `getSavedListingIds`.
   *
   * A set rather than a flag per card, so one membership test per card replaces a
   * query per card. Omitted for a signed-out visitor, where nothing is saved.
   */
  savedListingIds?: ReadonlySet<string>;
  /** Whether a session exists, forwarded to each card's save control. */
  isAuthenticated?: boolean;
  /**
   * How many leading images to mark `priority`. Defaults to none.
   *
   * Off by default deliberately. This used to be a constant, which meant every grid
   * preloaded four images regardless of where it sat - so the homepage's "Latest
   * listings" row and the detail page's "More in..." row, both well below the fold,
   * competed with the real LCP element. A detail page ended up with five priority
   * images: the gallery hero plus four thumbnails nobody had scrolled to. Only the
   * caller knows whether its grid is the first thing on screen.
   */
  priorityCount?: number;
}

/**
 * Responsive grid of listing cards.
 *
 * Grid rather than flex-wrap: cards in a row must share a height so their price
 * rows align, which `grid` gives for free and wrapped flex items do not.
 *
 * Renders nothing when `listings` is empty and leaves the empty state to the
 * caller. The right message depends on *why* it is empty - no listings exist yet
 * versus a filter combination that matched none - and only the page knows which.
 *
 * Column counts stay in step with `ListingsGridSkeleton`.
 */
function ListingsGrid({
  listings,
  searchTerm = null,
  savedListingIds,
  isAuthenticated = false,
  priorityCount = 0,
}: ListingsGridProps) {
  if (listings.length === 0) {
    return null;
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {listings.map((listing, index) => (
        // A list, because that is what a results grid is - it lets a screen
        // reader announce "12 items" and skip the group as a unit.
        <li key={listing.id}>
          <ListingCard
            listing={listing}
            searchTerm={searchTerm}
            priority={index < priorityCount}
            isSaved={savedListingIds?.has(listing.id) ?? false}
            isAuthenticated={isAuthenticated}
          />
        </li>
      ))}
    </ul>
  );
}

export { ListingsGrid };
