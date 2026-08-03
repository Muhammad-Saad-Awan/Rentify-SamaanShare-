import { XIcon } from "lucide-react";
import Link from "next/link";

import {
  buildListingsHref,
  clearListingFiltersHref,
  hasActiveFilters,
} from "@/lib/marketplace/filters";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { CONDITION_LABELS, formatCity } from "@/lib/utils/listing";

import type { ListingFilters } from "@/lib/marketplace/filters";
import type { CategoryOption } from "@/lib/queries/categories";

interface ActiveFiltersProps {
  filters: ListingFilters;
  /** Supplies display names for the category and subcategory slugs. */
  categories: readonly CategoryOption[];
}

interface FilterChip {
  key: string;
  label: string;
  /** Where "remove this one" goes. */
  href: string;
}

/**
 * Removable summary of what is currently filtering the results.
 *
 * Rendered from the *parsed* filters, never from the raw query string. The parser
 * discards values it cannot use - `?minPrice=abc`, an unknown sort - so a chip row
 * built from the URL would advertise filters that are not actually applied.
 *
 * Each chip removes exactly one filter and resets to page 1, because dropping a
 * filter widens the result set and the old page offset no longer means anything.
 */
function ActiveFilters({ filters, categories }: ActiveFiltersProps) {
  if (!hasActiveFilters(filters)) {
    return null;
  }

  const chips = buildChips(filters, categories);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-muted-foreground text-xs font-medium">
        Active filters
      </h2>

      <ul className="flex flex-wrap items-center gap-1.5">
        {chips.map((chip) => (
          <li key={chip.key}>
            <Link
              href={chip.href}
              // The visible text is the filter's value; on its own it reads as a
              // link *to* that filter rather than one that removes it.
              aria-label={`Remove filter: ${chip.label}`}
              className="bg-muted text-foreground hover:bg-muted/70 focus-visible:ring-ring inline-flex items-center gap-1 rounded-full py-1 pr-1.5 pl-2.5 text-xs transition-colors outline-none focus-visible:ring-2"
            >
              {chip.label}
              <XIcon className="size-3 shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href={clearListingFiltersHref(filters)}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded text-xs underline underline-offset-2 outline-none focus-visible:ring-2"
      >
        Clear all
      </Link>
    </div>
  );
}

function buildChips(
  filters: ListingFilters,
  categories: readonly CategoryOption[]
): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.q) {
    chips.push({
      key: "q",
      label: `“${filters.q}”`,
      href: buildListingsHref(filters, { q: null, page: 1 }),
    });
  }

  const category = categories.find((entry) => entry.slug === filters.category);

  if (filters.category) {
    chips.push({
      key: "category",
      // Falls back to the slug when it matches no category. That combination
      // returns no results, so naming it is what explains an empty page.
      label: category?.name ?? filters.category,
      // Clearing a category clears its subcategory too - a subcategory alone is
      // ambiguous, since slugs are only unique within a category.
      href: buildListingsHref(filters, {
        category: null,
        subcategory: null,
        page: 1,
      }),
    });
  }

  if (filters.category && filters.subcategory) {
    const subcategory = category?.subcategories.find(
      (entry) => entry.slug === filters.subcategory
    );

    chips.push({
      key: "subcategory",
      label: subcategory?.name ?? filters.subcategory,
      href: buildListingsHref(filters, { subcategory: null, page: 1 }),
    });
  }

  if (filters.city) {
    chips.push({
      key: "city",
      label: formatCity(filters.city),
      href: buildListingsHref(filters, { city: null, page: 1 }),
    });
  }

  if (filters.minPrice !== null || filters.maxPrice !== null) {
    chips.push({
      key: "price",
      label: priceLabel(filters.minPrice, filters.maxPrice),
      // One chip for the pair, matching how it is counted and how it reads: a
      // range is one decision, and removing half of it is rarely the intent.
      href: buildListingsHref(filters, {
        minPrice: null,
        maxPrice: null,
        page: 1,
      }),
    });
  }

  for (const condition of filters.conditions) {
    chips.push({
      key: `condition:${condition}`,
      label: CONDITION_LABELS[condition],
      href: buildListingsHref(filters, {
        conditions: filters.conditions.filter((entry) => entry !== condition),
        page: 1,
      }),
    });
  }

  if (filters.availableFrom !== null || filters.availableTo !== null) {
    chips.push({
      key: "availability",
      label: availabilityLabel(filters.availableFrom, filters.availableTo),
      href: buildListingsHref(filters, {
        availableFrom: null,
        availableTo: null,
        page: 1,
      }),
    });
  }

  return chips;
}

function priceLabel(min: number | null, max: number | null): string {
  if (min !== null && max !== null) {
    return `${formatPKR(min)} – ${formatPKR(max)}`;
  }

  if (min !== null) {
    return `From ${formatPKR(min)}`;
  }

  return `Up to ${formatPKR(max ?? 0)}`;
}

/**
 * Dates are parsed at UTC midnight to match how the query builds them, so the
 * chip names the same calendar day the filter actually used.
 */
function availabilityLabel(from: string | null, to: string | null): string {
  const start = from ?? to;
  const end = to ?? from;

  if (!start || !end) {
    return "Any dates";
  }

  const startLabel = formatDate(new Date(`${start}T00:00:00.000Z`));

  if (start === end) {
    return `Available ${startLabel}`;
  }

  return `Available ${startLabel} – ${formatDate(new Date(`${end}T00:00:00.000Z`))}`;
}

export { ActiveFilters };
