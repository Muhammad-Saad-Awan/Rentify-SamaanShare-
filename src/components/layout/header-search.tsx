"use client";

import { SearchIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Input } from "@/components/ui/input";
import {
  buildListingsHref,
  FILTER_PARAM,
  MAX_QUERY_LENGTH,
  parseListingFilters,
  searchParamsToRaw,
} from "@/lib/marketplace/filters";
import { cn } from "@/lib/utils/cn";

import type { FormEvent } from "react";

interface HeaderSearchProps {
  className?: string;
}

/**
 * Site-wide search, in the marketplace header.
 *
 * A Client Component, and that is forced rather than chosen: this renders inside
 * `(marketplace)/layout.tsx`, and a layout cannot read `searchParams` in Next 15.
 * Without `useSearchParams()` the header could only ever submit a bare `?q=`,
 * which would silently discard the city, price and condition filters a visitor had
 * already applied on the browse page.
 *
 * Reading them lets it do the right thing instead: the current URL is parsed with
 * the same `parseListingFilters` the page uses, `q` is replaced, and the result is
 * serialised by the same `buildListingsHref` every other link on the site goes
 * through. So a search from the header preserves filters and sort exactly as the
 * browse toolbar's own search box does.
 *
 * `page` is reset. A new term produces a different result set, so the old offset
 * points into nothing related.
 *
 * Leaving a category page loses the category, by design: the header is global, and
 * `/categories/electronics` carries its category in the *path*. Anything that
 * would only make sense with it - a subcategory - is dropped by the serializer, so
 * no orphaned parameter survives the hop to `/listings`.
 */
function HeaderSearch({ className }: HeaderSearchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = parseListingFilters(searchParamsToRaw(searchParams));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const submitted = new FormData(event.currentTarget).get(FILTER_PARAM.q);
    const term = typeof submitted === "string" ? submitted.trim() : "";

    router.push(buildListingsHref(filters, { q: term || null, page: 1 }));
  }

  return (
    <form
      // Still a real GET form: with JavaScript unavailable the browser submits it
      // natively to /listings. That path cannot preserve the other filters, but
      // search itself keeps working, which is the more important half.
      action="/listings"
      method="get"
      onSubmit={handleSubmit}
      role="search"
      className={cn("min-w-0", className)}
    >
      <div className="relative">
        <SearchIcon
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          aria-hidden="true"
        />

        <Input
          type="search"
          name={FILTER_PARAM.q}
          // Uncontrolled, so typing needs no re-render. The key remounts the
          // input when the committed term changes, which is what syncs it after a
          // navigation - including a back button press, and the "Clear all" chip
          // that removes the search on the browse page.
          key={filters.q ?? ""}
          defaultValue={filters.q ?? ""}
          maxLength={MAX_QUERY_LENGTH}
          placeholder="Search listings..."
          aria-label="Search listings"
          className="pl-8"
        />
      </div>
    </form>
  );
}

export { HeaderSearch };
