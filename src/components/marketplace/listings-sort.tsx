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
 */
function ListingsSort({ filters, hrefFor, className }: ListingsSortProps) {
  return (
    <nav
      aria-label="Sort listings"
      className={cn("min-w-0 shrink-0 overflow-x-auto", className)}
    >
      <ul className="bg-muted/60 flex w-fit items-center gap-0.5 rounded-lg p-0.5">
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
                  "focus-visible:ring-ring block rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2",
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
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
