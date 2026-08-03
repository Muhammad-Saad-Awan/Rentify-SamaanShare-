import { FILTER_PARAM, listingFilterEntries } from "@/lib/marketplace/filters";

import type { ListingFilters } from "@/lib/marketplace/filters";

interface HiddenFilterFieldsProps {
  filters: ListingFilters;
  /**
   * Parameter names this form renders visible inputs for.
   *
   * Anything listed here is skipped, because the form's own controls will submit
   * it. Everything else is carried through as a hidden input.
   */
  owned: readonly string[];
}

/**
 * Carries the filter parameters a form does not own.
 *
 * A native GET form replaces the entire query string with its own fields, so a
 * search box that submitted only `q` would silently clear the city, price and
 * condition filters. These hidden inputs are what make each form additive
 * instead of destructive.
 *
 * The list comes from `listingFilterEntries`, the same function that builds every
 * href on the page - so the set of parameters a form preserves cannot drift from
 * the set the links preserve.
 *
 * `page` is never emitted. Changing a filter or a search term invalidates the
 * current position in the result set, so submitting any of these forms must land
 * on page 1; omitting the field is how that happens, with no reset logic to keep
 * in sync.
 */
function HiddenFilterFields({ filters, owned }: HiddenFilterFieldsProps) {
  const skipped = new Set<string>([...owned, FILTER_PARAM.page]);

  return (
    <>
      {listingFilterEntries(filters)
        .filter(([name]) => !skipped.has(name))
        .map(([name, value]) => (
          // `condition` legitimately repeats, so the key has to include the
          // value - two conditions share a name.
          <input
            key={`${name}:${value}`}
            type="hidden"
            name={name}
            value={value}
          />
        ))}
    </>
  );
}

export { HiddenFilterFields };
