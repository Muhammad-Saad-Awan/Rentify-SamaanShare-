import Link from "next/link";

import { SORT_OPTIONS } from "@/lib/marketplace/filters";
import { cn } from "@/lib/utils/cn";

import type { ListingFilters, ListingSort } from "@/lib/marketplace/filters";

interface ListingsSortProps {
  filters: ListingFilters;
  /**
   * Builds the href for a sort option.
   *
   * Supplied by the caller for the same reason `Pagination` takes one: both
   * `/listings` and `/categories/[slug]` render this control, and only the route
   * knows its own base path and which parameters its path already implies.
   */
  hrefFor: (sort: ListingSort) => string;
  className?: string;
}

/**
 * Sort control, rendered as a segmented group of links.
 *
 * Links rather than a `<select>` with an onChange, for the same reasons the
 * pagination control is links: each ordering gets its own shareable URL, the
 * back button steps through orderings, and the whole thing works with no
 * JavaScript and no client component. With only four options a visible group
 * also shows the current ordering without opening anything.
 *
 * Callers are expected to reset `page` to 1 in `hrefFor`. A reorder invalidates
 * the current position - the listings that were on page 3 are somewhere else
 * entirely - so carrying the page number over would drop the user into an
 * unrelated slice of the results.
 *
 * Scrolls horizontally rather than wrapping on a narrow viewport: a wrapped
 * segmented control breaks its shared border and reads as two separate controls.
 * It is allowed to shrink (no `shrink-0`) so that it is the nav that scrolls - at
 * 360px a rigid group pushed the whole page into a sideways scroll instead.
 *
 * Each option is 32px tall inside a 4px track, so the control clears the 36px touch
 * target as a whole. The active option is a white chip on the muted track - the same
 * selected-surface language the filter chips use - rather than a navy fill, which would
 * compete with the one primary button in the toolbar.
 */
function ListingsSort({ filters, hrefFor, className }: ListingsSortProps) {
  return (
    <nav
      aria-label="Sort listings"
      className={cn("min-w-0 overflow-x-auto", className)}
    >
      <ul className="bg-muted flex w-fit items-center gap-0.5 rounded-lg border p-0.5">
        {SORT_OPTIONS.map((option) => {
          const isActive = filters.sort === option.value;

          return (
            <li key={option.value}>
              <Link
                href={hrefFor(option.value)}
                // `aria-current` is what conveys the active ordering; the
                // background alone is invisible to assistive tech. `aria-label`
                // carries the full phrasing, since "Price ↑" is not meaningful
                // read aloud.
                aria-current={isActive ? "true" : undefined}
                aria-label={option.description}
                className={cn(
                  "focus-visible:ring-ring flex h-8 items-center rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-3 sm:text-sm",
                  isActive
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { ListingsSort };
