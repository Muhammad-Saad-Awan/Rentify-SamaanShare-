import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { PAKISTANI_CITIES } from "@/config/cities";
import {
  buildListingsHref,
  parseListingFilters,
} from "@/lib/marketplace/filters";

/** Canonical defaults, so a city link differs from `/listings` only by `city`. */
const NO_FILTERS = parseListingFilters({});

interface CityShortcutsProps {
  /**
   * Live counts keyed by city slug, from `getActiveListingCountsByCity`.
   *
   * A city with no listings is absent from the map rather than present as zero,
   * so lookups fall back to 0 here.
   */
  counts: Map<string, number>;
}

/**
 * Jump straight into browse, scoped to a launch city.
 *
 * Rendered from `PAKISTANI_CITIES` rather than from the count query's keys: the
 * config decides which cities have launched and in what order, and driving the
 * list from query results would make a city vanish from the homepage the moment
 * its last listing was paused.
 *
 * The hrefs go through `buildListingsHref`, so they are the same URLs the city
 * filter itself produces - a visitor arriving here and then opening the filter
 * sidebar sees Karachi already selected, with no special-casing.
 */
function CityShortcuts({ counts }: CityShortcutsProps) {
  return (
    <ul className="grid gap-3 sm:grid-cols-3">
      {PAKISTANI_CITIES.map((city) => {
        const count = counts.get(city.value) ?? 0;

        return (
          <li key={city.value}>
            <Link
              href={buildListingsHref(NO_FILTERS, { city: city.value })}
              className="bg-card hover:bg-muted/50 focus-visible:ring-ring ring-foreground/10 group flex items-center justify-between gap-3 rounded-xl px-4 py-3 ring-1 transition-colors outline-none focus-visible:ring-2"
            >
              <span className="flex min-w-0 flex-col">
                <span className="font-heading text-sm font-medium">
                  Rent in {city.label}
                </span>
                <span className="text-muted-foreground text-xs">
                  {city.province} · {count === 1 ? "1 item" : `${count} items`}
                </span>
              </span>

              <ArrowRightIcon
                className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export { CityShortcuts };
