import Link from "next/link";

import { FilterForm } from "@/components/marketplace/filter-form";
import { HiddenFilterFields } from "@/components/marketplace/hidden-filter-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PAKISTANI_CITIES } from "@/config/cities";
import { ItemCondition } from "@/generated/prisma/enums";
import {
  clearListingFiltersHref,
  FILTER_PARAM,
  hasActiveFilters,
} from "@/lib/marketplace/filters";
import { cn } from "@/lib/utils/cn";
import { CONDITION_LABELS } from "@/lib/utils/listing";

import type { ListingFilters } from "@/lib/marketplace/filters";
import type { CategoryOption } from "@/lib/queries/categories";
import type { ReactNode } from "react";

/**
 * Parameters this form's visible controls submit.
 *
 * Everything not listed is carried by `HiddenFilterFields`, so `q` and `sort`
 * survive an "Apply filters" submit.
 */
const OWNED_PARAMS = [
  FILTER_PARAM.category,
  FILTER_PARAM.subcategory,
  FILTER_PARAM.city,
  FILTER_PARAM.minPrice,
  FILTER_PARAM.maxPrice,
  FILTER_PARAM.condition,
  FILTER_PARAM.availableFrom,
  FILTER_PARAM.availableTo,
] as const;

/** Matches `Input`'s tokens so a native select sits flush beside one. */
const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-8 w-full rounded-lg border bg-transparent px-2 py-1 text-sm transition-colors outline-none focus-visible:ring-3";

interface ListingsFiltersProps {
  filters: ListingFilters;
  categories: readonly CategoryOption[];
  /**
   * Namespace for element ids.
   *
   * The desktop sidebar and the mobile drawer render this same form, so both are
   * in the DOM at once on a tablet. Without a prefix their `id`s collide and
   * every `<label for>` in the second copy points at the first copy's control -
   * clicking a label would focus an off-screen input.
   */
  idPrefix: string;
}

/**
 * The browse filter form.
 *
 * A GET form, not a set of controls wired to a router. The fields become the
 * query string, so every control here is a plain server-rendered input with no
 * client state and no effects - `FilterForm` is the only client boundary, and it
 * only upgrades the submit.
 *
 * Filters apply on an explicit submit rather than on change, and that is a
 * deliberate trade. Auto-submitting would fire a navigation on the first
 * condition checkbox before the user ticks the second, discarding the in-progress
 * selection and firing a query per keystroke in the price fields. One submit is
 * one query and one history entry.
 */
function ListingsFilters({
  filters,
  categories,
  idPrefix,
}: ListingsFiltersProps) {
  const headingId = `${idPrefix}-filters-heading`;

  // Subcategories belong to the *applied* category, because without JavaScript
  // nothing can repopulate this list until the form round-trips. Choosing a
  // category and its subcategory is therefore two submits - the cost of a form
  // that works without a client bundle.
  const activeCategory = categories.find(
    (category) => category.slug === filters.category
  );

  return (
    <FilterForm ariaLabelledBy={headingId} className="flex flex-col gap-5">
      <HiddenFilterFields filters={filters} owned={OWNED_PARAMS} />

      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="font-heading text-sm font-semibold">
          Filters
        </h2>

        {hasActiveFilters(filters) && (
          <Link
            href={clearListingFiltersHref(filters)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded text-xs underline underline-offset-2 outline-none focus-visible:ring-2"
          >
            Clear all
          </Link>
        )}
      </div>

      <FilterGroup label="Category" htmlFor={`${idPrefix}-category`}>
        <select
          id={`${idPrefix}-category`}
          name={FILTER_PARAM.category}
          defaultValue={filters.category ?? ""}
          className={SELECT_CLASS}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup
        label="Subcategory"
        htmlFor={`${idPrefix}-subcategory`}
        hint={
          activeCategory
            ? undefined
            : "Pick a category and apply to narrow further."
        }
      >
        <select
          id={`${idPrefix}-subcategory`}
          name={FILTER_PARAM.subcategory}
          defaultValue={filters.subcategory ?? ""}
          disabled={!activeCategory}
          className={cn(SELECT_CLASS, "disabled:opacity-50")}
        >
          <option value="">
            {activeCategory
              ? `All in ${activeCategory.name}`
              : "All subcategories"}
          </option>
          {activeCategory?.subcategories.map((subcategory) => (
            <option key={subcategory.slug} value={subcategory.slug}>
              {subcategory.name}
            </option>
          ))}
        </select>
      </FilterGroup>

      <FilterGroup label="City" htmlFor={`${idPrefix}-city`}>
        <select
          id={`${idPrefix}-city`}
          name={FILTER_PARAM.city}
          defaultValue={filters.city ?? ""}
          className={SELECT_CLASS}
        >
          <option value="">All cities</option>
          {PAKISTANI_CITIES.map((city) => (
            <option key={city.value} value={city.value}>
              {city.label}
            </option>
          ))}
        </select>
      </FilterGroup>

      {/*
        A fieldset, because two inputs answer one question. The legend names the
        pair for a screen reader, which the individual "Min"/"Max" labels cannot.
      */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium">
          Price per day (PKR)
        </legend>

        <div className="flex items-center gap-2">
          <Input
            id={`${idPrefix}-min-price`}
            name={FILTER_PARAM.minPrice}
            defaultValue={filters.minPrice ?? ""}
            type="number"
            min={0}
            // `inputMode` gets a numeric keypad on mobile; `type="number"` alone
            // is inconsistent about that across browsers.
            inputMode="numeric"
            placeholder="Min"
            aria-label="Minimum price per day in rupees"
          />
          <span className="text-muted-foreground text-xs" aria-hidden="true">
            to
          </span>
          <Input
            id={`${idPrefix}-max-price`}
            name={FILTER_PARAM.maxPrice}
            defaultValue={filters.maxPrice ?? ""}
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="Max"
            aria-label="Maximum price per day in rupees"
          />
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium">Condition</legend>

        <div className="flex flex-col gap-1.5">
          {Object.values(ItemCondition).map((condition) => (
            <label
              key={condition}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              {/*
                Native checkboxes: they submit as repeated `condition` values
                with no JavaScript, which is exactly what the parser reads.
                `accent-primary` themes them from the design tokens, so they
                follow dark mode without a custom control.
              */}
              <input
                type="checkbox"
                name={FILTER_PARAM.condition}
                value={condition}
                defaultChecked={filters.conditions.includes(condition)}
                className="accent-primary focus-visible:ring-ring size-4 rounded outline-none focus-visible:ring-2"
              />
              {CONDITION_LABELS[condition]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium">Available between</legend>

        <div className="flex flex-col gap-2">
          <Input
            id={`${idPrefix}-from`}
            name={FILTER_PARAM.availableFrom}
            defaultValue={filters.availableFrom ?? ""}
            type="date"
            aria-label="Available from date"
          />
          <Input
            id={`${idPrefix}-to`}
            name={FILTER_PARAM.availableTo}
            defaultValue={filters.availableTo ?? ""}
            type="date"
            aria-label="Available until date"
          />
        </div>

        <p className="text-muted-foreground text-xs">
          Hides listings with a blocked date in this range.
        </p>
      </fieldset>

      <Button type="submit" size="sm" className="w-full">
        Apply filters
      </Button>
    </FilterForm>
  );
}

interface FilterGroupProps {
  label: string;
  htmlFor: string;
  /**
   * Explains why a control is inert, when it is.
   *
   * Optional *and* explicitly `| undefined`: the project sets
   * `exactOptionalPropertyTypes`, under which a plain `hint?: string` rejects a
   * deliberately-passed `undefined` - which is what a conditional expression
   * produces at one of the call sites below.
   */
  hint?: string | undefined;
  children: ReactNode;
}

/** One labelled control. A `<label>` suffices where a group has a single input. */
function FilterGroup({ label, htmlFor, hint, children }: FilterGroupProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </label>

      {children}

      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

export { ListingsFilters };
