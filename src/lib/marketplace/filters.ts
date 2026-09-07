import { ItemCondition } from "@/generated/prisma/enums";

/**
 * The browse page's filter, sort and pagination state.
 *
 * This module is the single translation layer between a URL and that state, and
 * it is deliberately React-free and Prisma-free. Three consumers depend on it
 * agreeing with itself: the page parses incoming `searchParams`, the filter
 * forms name their inputs after the same keys, and every link on the page
 * (sort, pagination, clear-filter chips) is produced by the serializer here. A
 * filter that "silently does nothing" is almost always these three drifting
 * apart, so there is exactly one definition of each.
 */

/**
 * Query-string keys, named once.
 *
 * The filter form's `name` attributes are taken from this object rather than
 * written as literals. A native GET form submits whatever its inputs are called,
 * so a typo in a `name` would produce a parameter the parser ignores - a filter
 * that appears in the URL and changes nothing.
 */
export const FILTER_PARAM = {
  q: "q",
  category: "category",
  subcategory: "subcategory",
  city: "city",
  minPrice: "minPrice",
  maxPrice: "maxPrice",
  condition: "condition",
  availableFrom: "from",
  availableTo: "to",
  sort: "sort",
  page: "page",
} as const;

/**
 * The value of `?city=` that means "everywhere, and I mean it".
 *
 * Needed because a member can have a default city, and a bare `/listings` redirects them
 * to it - see `User.defaultCity`. Without a way to SAY "everywhere" in the URL, removing
 * the city chip would produce the bare URL and bounce straight back to their default, so
 * the one control for browsing the whole country would be the one control that did
 * nothing.
 *
 * Not a real city, and deliberately not a slug any city could ever take: cities come from
 * `PAKISTANI_CITIES`, which this is checked against before it is treated as a filter.
 */
export const CITY_ANYWHERE = "all";

export const LISTING_SORTS = [
  "newest",
  "price-asc",
  "price-desc",
  "rating",
] as const;

export type ListingSort = (typeof LISTING_SORTS)[number];

export const DEFAULT_SORT: ListingSort = "newest";

/**
 * Visible label and accessible name per sort option.
 *
 * `label` is what fits in a compact control; `description` is the full sentence
 * for `aria-label`, because "Price ↑" read aloud is not a sort order.
 */
export const SORT_OPTIONS: readonly {
  value: ListingSort;
  label: string;
  description: string;
}[] = [
  { value: "newest", label: "Newest", description: "Sort by newest first" },
  {
    value: "price-asc",
    label: "Price ↑",
    description: "Sort by price, low to high",
  },
  {
    value: "price-desc",
    label: "Price ↓",
    description: "Sort by price, high to low",
  },
  { value: "rating", label: "Rating", description: "Sort by owner rating" },
];

/**
 * Longest accepted keyword string.
 *
 * The search term becomes a `contains` predicate, which cannot use an index.
 * Bounding its length bounds the work a single crafted URL can ask of Postgres.
 */
export const MAX_QUERY_LENGTH = 100;

/** Parsed, validated browse state. `null` means "not filtered by this". */
export interface ListingFilters {
  q: string | null;
  category: string | null;
  subcategory: string | null;
  city: string | null;
  /**
   * True when the URL said `?city=all`, i.e. the member has explicitly asked to see every
   * city rather than simply not mentioned one.
   *
   * The distinction only matters to a member who has a `defaultCity`: "no city in the URL"
   * means "use my default", and this means "override it this time". It is NOT a filter -
   * `hasActiveFilters` ignores it - because it narrows nothing.
   */
  cityAnywhere: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  /** Empty means any condition. Order is normalised to the enum's order. */
  conditions: ItemCondition[];
  /** `YYYY-MM-DD`, already validated as a real calendar date. */
  availableFrom: string | null;
  availableTo: string | null;
  sort: ListingSort;
  page: number;
}

/** The shape Next hands to a page as `searchParams`, once awaited. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * Converts live `URLSearchParams` into the shape {@link parseListingFilters} reads.
 *
 * Exists for the header search, which is a Client Component: a layout cannot read
 * `searchParams` in Next 15, so the only way for the header to preserve the
 * filters already in the URL is to read them with `useSearchParams()` at
 * request-independent runtime and feed them through this same parser. Reusing the
 * parser rather than copying params by hand is what keeps the header's idea of
 * browse state identical to the page's.
 *
 * Repeated keys - `condition` - collapse to an array, matching how Next presents
 * them server-side, so a multi-select filter survives a header search.
 */
export function searchParamsToRaw(params: URLSearchParams): RawSearchParams {
  const raw: RawSearchParams = {};

  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);

    raw[key] = values.length > 1 ? values : values[0];
  }

  return raw;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const VALID_CONDITIONS = new Set<string>(Object.values(ItemCondition));

/**
 * Reads a URL into {@link ListingFilters}.
 *
 * Every field degrades to "unfiltered" rather than throwing. These values come
 * from a query string that anyone can hand-edit or that a stale bookmark can
 * carry, so `?minPrice=abc` has to render the unfiltered page - not a 500. That
 * also means a filter this function rejects is simply absent from the result,
 * which is why the UI renders its active filters *from the parsed state* rather
 * than from the raw URL: the two would disagree.
 */
export function parseListingFilters(params: RawSearchParams): ListingFilters {
  const { minPrice, maxPrice } = parsePriceRange(
    first(params[FILTER_PARAM.minPrice]),
    first(params[FILTER_PARAM.maxPrice])
  );

  const { from, to } = parseDateRange(
    first(params[FILTER_PARAM.availableFrom]),
    first(params[FILTER_PARAM.availableTo])
  );

  return {
    q: parseQuery(first(params[FILTER_PARAM.q])),
    category: parseSlug(first(params[FILTER_PARAM.category])),
    subcategory: parseSlug(first(params[FILTER_PARAM.subcategory])),
    city: parseCity(first(params[FILTER_PARAM.city])),
    cityAnywhere: first(params[FILTER_PARAM.city]) === CITY_ANYWHERE,
    minPrice,
    maxPrice,
    conditions: parseConditions(params[FILTER_PARAM.condition]),
    availableFrom: from,
    availableTo: to,
    sort: parseSort(first(params[FILTER_PARAM.sort])),
    page: parsePage(first(params[FILTER_PARAM.page])),
  };
}

/**
 * Serialises state back to a `/listings` URL.
 *
 * Defaults are omitted - no `sort=newest`, no `page=1` - so the unfiltered page
 * has exactly one URL. Two URLs rendering identical content splits crawler
 * signals and makes the "is anything filtered" check ambiguous.
 *
 * `overrides` is applied on top, which is how every link on the page is built:
 * a sort link overrides `sort`, a pagination link overrides `page`, a filter
 * chip's remove link overrides one field with `null`.
 */
export function buildListingsHref(
  filters: ListingFilters,
  overrides: Partial<ListingFilters> = {},
  options: BrowseHrefOptions = {}
): string {
  const basePath = options.basePath ?? "/listings";
  const search = new URLSearchParams();

  for (const [name, value] of listingFilterEntries(
    { ...filters, ...overrides },
    options
  )) {
    search.append(name, value);
  }

  const query = search.toString();

  return query ? `${basePath}?${query}` : basePath;
}

/**
 * Where a browse URL points, and what the path already implies.
 *
 * Two routes render the same browse state: `/listings`, and
 * `/categories/[slug]` scoped to one category. Both need sort and pagination
 * links, so the path cannot be baked into the serializer.
 */
export interface BrowseHrefOptions {
  /** Defaults to `/listings`. */
  basePath?: string;
  /**
   * Leave `category` out of the query string.
   *
   * Set on `/categories/[slug]`, where the path already names the category.
   * Without it every link there would read
   * `/categories/electronics?category=electronics`, which is redundant and
   * would let the two disagree if one were ever edited by hand.
   *
   * The category is still *present* in the filter state - it has to be, or the
   * query would not scope and `subcategory` would be dropped as orphaned. It is
   * only omitted from the rendered URL.
   */
  omitCategory?: boolean;
}

/**
 * State as `[name, value]` query pairs, in a stable order.
 *
 * Shared by two consumers that must agree exactly: {@link buildListingsHref},
 * and the hidden inputs a filter form renders to carry the parameters it does
 * not own. Deriving both from this list is what stops a form from dropping a
 * filter on submit that every link on the page preserves.
 *
 * Defaults are omitted, so the unfiltered page has exactly one URL. Two URLs
 * rendering identical content splits crawler signals and makes the "is anything
 * filtered" check ambiguous.
 */
export function listingFilterEntries(
  filters: ListingFilters,
  options: BrowseHrefOptions = {}
): [string, string][] {
  const entries: [string, string][] = [];

  if (filters.q) {
    entries.push([FILTER_PARAM.q, filters.q]);
  }
  if (filters.category && !options.omitCategory) {
    entries.push([FILTER_PARAM.category, filters.category]);
  }
  // A subcategory without its parent category is meaningless to the user even
  // though the query would honour it, so it is dropped with the category.
  if (filters.category && filters.subcategory) {
    entries.push([FILTER_PARAM.subcategory, filters.subcategory]);
  }
  if (filters.city) {
    entries.push([FILTER_PARAM.city, filters.city]);
  } else if (filters.cityAnywhere) {
    // Kept in the URL rather than dropped as a default would be. It is the difference
    // between "did not say" and "said everywhere", and only the second survives the
    // redirect a member with a default city gets on the bare URL.
    entries.push([FILTER_PARAM.city, CITY_ANYWHERE]);
  }
  if (filters.minPrice !== null) {
    entries.push([FILTER_PARAM.minPrice, String(filters.minPrice)]);
  }
  if (filters.maxPrice !== null) {
    entries.push([FILTER_PARAM.maxPrice, String(filters.maxPrice)]);
  }
  for (const condition of filters.conditions) {
    entries.push([FILTER_PARAM.condition, condition]);
  }
  if (filters.availableFrom) {
    entries.push([FILTER_PARAM.availableFrom, filters.availableFrom]);
  }
  if (filters.availableTo) {
    entries.push([FILTER_PARAM.availableTo, filters.availableTo]);
  }
  if (filters.sort !== DEFAULT_SORT) {
    entries.push([FILTER_PARAM.sort, filters.sort]);
  }
  if (filters.page > 1) {
    entries.push([FILTER_PARAM.page, String(filters.page)]);
  }

  return entries;
}

/**
 * The same view with every filter removed.
 *
 * Keeps `sort` deliberately. Clearing filters is about *which* listings are
 * shown, not the order they are shown in, and silently reverting someone's
 * chosen ordering is a second unrequested change. Defined once here because
 * three places need it - the sidebar's "Clear all", the filter chip row, and the
 * no-results empty state - and a missed field in any copy would leave a filter
 * stuck on with no visible way to remove it.
 *
 * Keeps `cityAnywhere` too, and for a related reason. From an explicit "everywhere" view,
 * clearing the other filters should not quietly put a member back in their default city -
 * they already said everywhere. From a view that never said it, clearing produces the bare
 * URL, which for a member with a default means "back to my city" - a reset restoring a
 * default, which is what a reset is. The city chip's own remove link is the way to say
 * everywhere; this is not trying to be.
 */
export function clearListingFiltersHref(filters: ListingFilters): string {
  return buildListingsHref(filters, {
    q: null,
    category: null,
    subcategory: null,
    city: null,
    minPrice: null,
    maxPrice: null,
    conditions: [],
    availableFrom: null,
    availableTo: null,
    page: 1,
  });
}

/**
 * True when anything narrows the result set.
 *
 * Sort and page are excluded on purpose: neither changes *which* listings match,
 * so neither should light up a "clear filters" affordance or turn an empty page
 * into "no results for your filters".
 */
export function hasActiveFilters(filters: ListingFilters): boolean {
  return (
    filters.q !== null ||
    filters.category !== null ||
    filters.city !== null ||
    filters.minPrice !== null ||
    filters.maxPrice !== null ||
    filters.conditions.length > 0 ||
    filters.availableFrom !== null ||
    filters.availableTo !== null
  );
}

/**
 * How many filters are active, for the mobile trigger's badge.
 *
 * A price range counts once, not twice: to a user "Rs. 500 - 2,000" is one
 * decision. Each selected condition counts separately, because each is one
 * removable chip.
 */
export function activeFilterCount(filters: ListingFilters): number {
  let count = 0;

  if (filters.q !== null) count += 1;
  if (filters.category !== null) count += 1;
  if (filters.subcategory !== null && filters.category !== null) count += 1;
  if (filters.city !== null) count += 1;
  if (filters.minPrice !== null || filters.maxPrice !== null) count += 1;
  if (filters.availableFrom !== null || filters.availableTo !== null)
    count += 1;

  return count + filters.conditions.length;
}

/**
 * A city slug, or null for unfiltered.
 *
 * `all` is not a city - it is the explicit "everywhere" marker, which narrows nothing and
 * so parses to the same `null` any unrecognised value would. `cityAnywhere` is what
 * remembers that it was said.
 */
function parseCity(value: string | undefined): string | null {
  return value === CITY_ANYWHERE ? null : parseSlug(value);
}

/** Repeated parameters arrive as an array; the first entry wins. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseQuery(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().slice(0, MAX_QUERY_LENGTH);

  return trimmed === "" ? null : trimmed;
}

/**
 * Accepts a slug without checking it exists.
 *
 * Existence is the database's answer, not this module's - it has no connection.
 * An unknown category slug therefore reaches the query and matches nothing,
 * which surfaces as the "no results" empty state. That is the honest outcome:
 * silently dropping the filter would show unfiltered results under a URL that
 * claims to be filtered.
 */
function parseSlug(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().toLowerCase();

  // Same shape the taxonomy seed writes. Rejecting anything else keeps
  // arbitrary text out of the query and out of the rendered filter chips.
  if (!/^[a-z0-9-]{1,60}$/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Parses the price pair, swapping a reversed range.
 *
 * `minPrice=5000&maxPrice=1000` matches nothing, which reads as a broken page.
 * A reversed range is far more likely to be a typo or a mis-dragged slider than
 * a deliberate request for the empty set, so the bounds are swapped.
 */
function parsePriceRange(
  rawMin: string | undefined,
  rawMax: string | undefined
): { minPrice: number | null; maxPrice: number | null } {
  const min = parsePositiveInt(rawMin);
  const max = parsePositiveInt(rawMax);

  if (min !== null && max !== null && min > max) {
    return { minPrice: max, maxPrice: min };
  }

  return { minPrice: min, maxPrice: max };
}

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  // Rejects NaN, negatives, and anything past Postgres' Int range, which the
  // schema notes tops out at 2,147,483,647 PKR.
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) {
    return null;
  }

  return parsed;
}

/**
 * Keeps only real `ItemCondition` values, deduped and in enum order.
 *
 * Normalising the order means `?condition=GOOD&condition=NEW` and
 * `?condition=NEW&condition=GOOD` serialise back to the same URL, so they are
 * one cache entry and one canonical link rather than two.
 */
function parseConditions(
  value: string | string[] | undefined
): ItemCondition[] {
  if (!value) {
    return [];
  }

  const requested = new Set(Array.isArray(value) ? value : [value]);

  return Object.values(ItemCondition).filter(
    (condition) => requested.has(condition) && VALID_CONDITIONS.has(condition)
  );
}

/**
 * Validates the availability window, swapping a reversed one.
 *
 * The pattern check is not enough on its own - `2026-02-31` matches it - so the
 * parsed date is round-tripped and compared. Dates are treated as plain calendar
 * days with no timezone applied, matching the `@db.Date` column they are
 * compared against.
 */
function parseDateRange(
  rawFrom: string | undefined,
  rawTo: string | undefined
): { from: string | null; to: string | null } {
  const from = parseIsoDate(rawFrom);
  const to = parseIsoDate(rawTo);

  if (from && to && from > to) {
    return { from: to, to: from };
  }

  return { from, to };
}

function parseIsoDate(value: string | undefined): string | null {
  if (!value || !ISO_DATE_PATTERN.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  // Rejects overflowed dates: `2026-02-31` parses to 3 March, whose ISO form no
  // longer matches the input.
  if (parsed.toISOString().slice(0, 10) !== value) {
    return null;
  }

  return value;
}

function parseSort(value: string | undefined): ListingSort {
  const match = LISTING_SORTS.find((sort) => sort === value);

  return match ?? DEFAULT_SORT;
}

function parsePage(value: string | undefined): number {
  const parsed = parsePositiveInt(value);

  if (parsed === null || parsed < 1) {
    return 1;
  }

  return parsed;
}
