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
          "border-foreground bg-background focus-within:ring-foreground/10 gap-1.5 rounded-xl border-2 p-1.5 focus-within:ring-4",
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
          type="search"
          name={FILTER_PARAM.q}
          defaultValue={filters.q ?? ""}
          maxLength={MAX_QUERY_LENGTH}
          placeholder="Search cameras, drills, tents..."
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
        className="shrink-0"
      >
        Search
      </Button>
    </FilterForm>
  );
}

export { ListingsSearch };
