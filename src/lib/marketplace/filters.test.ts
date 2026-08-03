import { describe, expect, it } from "vitest";

import {
  buildListingsHref,
  clearListingFiltersHref,
  hasActiveFilters,
  activeFilterCount,
  listingFilterEntries,
  parseListingFilters,
  searchParamsToRaw,
} from "@/lib/marketplace/filters";

/**
 * The browse URL layer.
 *
 * Everything here exists to keep three consumers agreeing: the page that parses
 * `searchParams`, the forms whose inputs are named after the same keys, and every link built
 * by the serializer. A filter that "silently does nothing" is almost always those three
 * drifting, so the round-trip tests below are the point of this file.
 */

const NONE = parseListingFilters({});

describe("parseListingFilters", () => {
  it("defaults to an unfiltered first page sorted by newest", () => {
    expect(NONE).toMatchObject({
      q: null,
      category: null,
      city: null,
      minPrice: null,
      maxPrice: null,
      conditions: [],
      sort: "newest",
      page: 1,
    });
  });

  it("degrades unusable values instead of throwing", () => {
    // These all arrive from a URL anyone can edit, so each must render the unfiltered page
    // rather than a 500.
    expect(parseListingFilters({ minPrice: "abc" }).minPrice).toBeNull();
    expect(parseListingFilters({ minPrice: "-5" }).minPrice).toBeNull();
    expect(parseListingFilters({ page: "0" }).page).toBe(1);
    expect(parseListingFilters({ page: "-3" }).page).toBe(1);
    expect(parseListingFilters({ sort: "bogus" }).sort).toBe("newest");
    expect(parseListingFilters({ city: "Karachi!" }).city).toBeNull();
  });

  it("swaps a reversed price range rather than matching nothing", () => {
    // 5000-1000 matches the empty set, which reads as a broken page. Far more likely a typo.
    const filters = parseListingFilters({ minPrice: "5000", maxPrice: "1000" });

    expect(filters.minPrice).toBe(1000);
    expect(filters.maxPrice).toBe(5000);
  });

  it("swaps a reversed availability window", () => {
    const filters = parseListingFilters({
      from: "2026-09-20",
      to: "2026-09-10",
    });

    expect(filters.availableFrom).toBe("2026-09-10");
    expect(filters.availableTo).toBe("2026-09-20");
  });

  it("rejects a date that matches the pattern but is not real", () => {
    // 2026-02-31 parses to 3 March; without the round-trip check it would filter the wrong
    // day silently.
    expect(
      parseListingFilters({ from: "2026-02-31" }).availableFrom
    ).toBeNull();
    expect(parseListingFilters({ from: "2028-02-29" }).availableFrom).toBe(
      "2028-02-29"
    );
  });

  it("normalises conditions to enum order and drops unknown values", () => {
    // Normalising the order means two different URLs serialise back to one canonical form.
    const a = parseListingFilters({ condition: ["GOOD", "NEW"] }).conditions;
    const b = parseListingFilters({ condition: ["NEW", "GOOD"] }).conditions;

    expect(a).toEqual(b);
    expect(a).toEqual(["NEW", "GOOD"]);
    expect(parseListingFilters({ condition: ["NOPE"] }).conditions).toEqual([]);
  });

  it("takes the first value when a scalar parameter repeats", () => {
    expect(parseListingFilters({ city: ["karachi", "lahore"] }).city).toBe(
      "karachi"
    );
  });

  it("trims and caps the search term", () => {
    expect(parseListingFilters({ q: "  camera  " }).q).toBe("camera");
    expect(parseListingFilters({ q: "   " }).q).toBeNull();
    expect(parseListingFilters({ q: "x".repeat(500) }).q).toHaveLength(100);
  });
});

describe("buildListingsHref", () => {
  it("omits defaults so the unfiltered view has exactly one URL", () => {
    expect(buildListingsHref(NONE)).toBe("/listings");
    expect(buildListingsHref(NONE, { sort: "newest" })).toBe("/listings");
    expect(buildListingsHref(NONE, { page: 1 })).toBe("/listings");
  });

  it("round-trips every filter through parse and serialize", () => {
    const url = buildListingsHref(NONE, {
      q: "drone",
      category: "electronics",
      subcategory: "drones",
      city: "lahore",
      minPrice: 1000,
      maxPrice: 5000,
      conditions: ["NEW", "GOOD"],
      availableFrom: "2026-09-01",
      availableTo: "2026-09-05",
      sort: "price-desc",
      page: 3,
    });

    const query = Object.fromEntries(
      new URLSearchParams(url.split("?")[1] ?? "")
    );
    // `condition` repeats, so it has to be read with getAll rather than the object form.
    const reparsed = parseListingFilters({
      ...query,
      condition: new URLSearchParams(url.split("?")[1] ?? "").getAll(
        "condition"
      ),
    });

    expect(buildListingsHref(reparsed)).toBe(url);
  });

  it("drops a subcategory with no category", () => {
    // Subcategory slugs are unique only within a parent, so one alone is unresolvable.
    const url = buildListingsHref(NONE, { subcategory: "cameras" });

    expect(url).toBe("/listings");
  });

  it("supports a different base path and omitting the category", () => {
    // The category route carries the category in its path, so repeating it in the query
    // would be redundant - but the subcategory must survive.
    const url = buildListingsHref(
      NONE,
      { category: "electronics", subcategory: "cameras", sort: "rating" },
      { basePath: "/categories/electronics", omitCategory: true }
    );

    expect(url).toBe("/categories/electronics?subcategory=cameras&sort=rating");
  });
});

describe("hasActiveFilters and activeFilterCount", () => {
  it("ignores sort and page, which do not narrow anything", () => {
    expect(hasActiveFilters({ ...NONE, sort: "rating", page: 4 })).toBe(false);
  });

  it("counts a price range once but each condition separately", () => {
    expect(activeFilterCount({ ...NONE, minPrice: 100, maxPrice: 900 })).toBe(
      1
    );
    expect(activeFilterCount({ ...NONE, conditions: ["NEW", "GOOD"] })).toBe(2);
  });
});

describe("clearListingFiltersHref", () => {
  it("clears filters but keeps the chosen sort order", () => {
    // Clearing filters is about which listings show, not the order they show in.
    const href = clearListingFiltersHref({
      ...NONE,
      city: "lahore",
      q: "drone",
      sort: "price-asc",
      page: 5,
    });

    expect(href).toBe("/listings?sort=price-asc");
  });
});

describe("searchParamsToRaw", () => {
  it("collapses repeated keys to an array so multi-selects survive", () => {
    const params = new URLSearchParams(
      "condition=NEW&condition=GOOD&city=karachi"
    );

    expect(searchParamsToRaw(params)).toEqual({
      condition: ["NEW", "GOOD"],
      city: "karachi",
    });
  });
});

describe("listingFilterEntries", () => {
  it("emits one entry per selected condition", () => {
    const entries = listingFilterEntries({
      ...NONE,
      conditions: ["NEW", "FAIR"],
    });

    expect(entries).toEqual([
      ["condition", "NEW"],
      ["condition", "FAIR"],
    ]);
  });
});
