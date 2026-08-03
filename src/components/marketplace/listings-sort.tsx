import Link from "next/link";

import { buildListingsHref, SORT_OPTIONS } from "@/lib/marketplace/filters";
import { cn } from "@/lib/utils/cn";

import type { ListingFilters } from "@/lib/marketplace/filters";

interface ListingsSortProps {
  filters: ListingFilters;
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
 * Every link resets `page` to 1. A reorder invalidates the current position - the
 * listings that were on page 3 are somewhere else entirely - so keeping the page
 * number would drop the user into an unrelated slice of the results.
 *
 * Scrolls horizontally rather than wrapping on a narrow viewport: a wrapped
 * segmented control breaks its shared border and reads as two separate controls.
 */
function ListingsSort({ filters, className }: ListingsSortProps) {
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
                href={buildListingsHref(filters, {
                  sort: option.value,
                  page: 1,
                })}
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
