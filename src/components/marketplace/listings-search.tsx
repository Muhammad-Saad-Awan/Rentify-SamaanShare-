import { SearchIcon } from "lucide-react";

import { FilterForm } from "@/components/marketplace/filter-form";
import { HiddenFilterFields } from "@/components/marketplace/hidden-filter-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FILTER_PARAM, MAX_QUERY_LENGTH } from "@/lib/marketplace/filters";
import { cn } from "@/lib/utils/cn";

import type { ListingFilters } from "@/lib/marketplace/filters";

interface ListingsSearchProps {
  filters: ListingFilters;
  /**
   * `hero` is the homepage's oversized field - the first thing a visitor uses, so it is drawn
   * at touch size with a heavier rule. `toolbar` is the compact one beside browse filters.
   */
  size?: "toolbar" | "hero";
  className?: string;
}

/**
 * Keyword search over listing titles and descriptions.
 *
 * A GET form pointed at the same route, which is the whole mechanism: the fields
 * become the query string and the page re-renders from it. Search needs no client
 * state and no debounce - the term is submitted, not typed into state.
 * `role="search"` gives it the landmark a screen reader user can jump to.
 *
 * `defaultValue` rather than `value`: an uncontrolled input lets the user type
 * freely while the URL changes only on submit. A controlled one would mean a
 * state round trip per keystroke.
 */
function ListingsSearch({
  filters,
  size = "toolbar",
  className,
}: ListingsSearchProps) {
  const isHero = size === "hero";

  return (
    <FilterForm
      role="search"
      className={cn(
        "flex min-w-0 items-center gap-2",
        isHero &&
          // Raised rather than outlined, as in the reference: a white bar floating on the page.
          // The `border-input` edge is kept so the field still has a 3:1 boundary.
          "border-input bg-card shadow-soft focus-within:border-brand focus-within:ring-brand/15 gap-1.5 rounded-2xl border p-1.5 focus-within:ring-4",
        className
      )}
    >
      <HiddenFilterFields filters={filters} owned={[FILTER_PARAM.q]} />

      <div className="relative min-w-0 flex-1">
        <SearchIcon
          className={cn(
            "text-muted-foreground pointer-events-none absolute top-1/2 size-4 -translate-y-1/2",
            isHero ? "left-3 size-5" : "left-3"
          )}
          aria-hidden="true"
        />

        <Input
          // Explicit, like the header search's: a generated Base UI id can differ between
          // server and client renders and trip a hydration mismatch.
          id={`listings-search-${size}`}
          type="search"
          name={FILTER_PARAM.q}
          defaultValue={filters.q ?? ""}
          maxLength={MAX_QUERY_LENGTH}
          placeholder={
            isHero
              ? "Search for items (e.g. camera, laptop, dress...)"
              : "Search cameras, drills, tents..."
          }
          // The visible label would duplicate the placeholder in this toolbar,
          // so the accessible name is supplied directly.
          aria-label="Search listings"
          className={cn(
            "pl-9",
            isHero &&
              "h-11 border-0 pl-10 text-base shadow-none focus-visible:ring-0 sm:text-base"
          )}
        />
      </div>

      <Button
        type="submit"
        size={isHero ? "lg" : "default"}
        className={cn("shrink-0", isHero && "h-12 rounded-xl px-7 text-base")}
      >
        Search
      </Button>
    </FilterForm>
  );
}

export { ListingsSearch };
