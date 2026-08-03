import { MapPinIcon, ShieldCheckIcon, WalletIcon } from "lucide-react";

import { ListingsSearch } from "@/components/marketplace/listings-search";
import { parseListingFilters } from "@/lib/marketplace/filters";

/**
 * An unfiltered filter state, for the hero's search box.
 *
 * `ListingsSearch` carries the rest of the browse state through hidden inputs, so
 * it needs a `ListingFilters` even where there is none to carry. Parsing an empty
 * object is how you get the canonical defaults without hand-writing the shape -
 * which would silently go stale the next time a filter is added.
 *
 * Safe at module scope: the parser is pure and touches no request state.
 */
const NO_FILTERS = parseListingFilters({});

const TRUST_POINTS = [
  { icon: WalletIcon, label: "Cash on handover" },
  { icon: MapPinIcon, label: "Karachi, Lahore & Islamabad" },
  { icon: ShieldCheckIcon, label: "Security deposit held per rental" },
];

interface HeroSectionProps {
  /** Live count of listings a visitor can browse right now. */
  listingCount: number;
}

/**
 * Landing hero.
 *
 * Owns the page's only `h1`. The search box is the same `ListingsSearch`
 * component the browse toolbar uses, so a term typed here lands on `/listings`
 * with exactly the URL the browse page would have produced - no second search
 * implementation to keep in step.
 *
 * The count is real rather than a rounded marketing number. On a marketplace this
 * young an inflated figure is checkable in one click, and being caught out is
 * worse than a small number.
 */
function HeroSection({ listingCount }: HeroSectionProps) {
  return (
    <section className="border-b">
      {/*
        A tinted band rather than a photograph: no hero image can represent
        "cameras, drills and party tents" at once, and a large one would be the
        page's largest contentful paint for no informational gain.
      */}
      <div className="from-primary/5 via-background to-background bg-gradient-to-b">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-6 px-4 py-14 text-center sm:py-20 lg:px-6">
          <div className="flex max-w-3xl flex-col gap-4">
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl">
              Rent what you need from people nearby
            </h1>

            <p className="text-muted-foreground mx-auto max-w-xl text-base text-pretty sm:text-lg">
              Cameras, power tools, camping gear and party equipment - available
              by the day, without buying something you will use once.
            </p>
          </div>

          <ListingsSearch filters={NO_FILTERS} className="w-full max-w-xl" />

          {listingCount > 0 && (
            <p className="text-muted-foreground text-sm">
              {listingCount === 1
                ? "1 item available to rent right now"
                : `${listingCount} items available to rent right now`}
            </p>
          )}

          <ul className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
            {TRUST_POINTS.map((point) => (
              <li key={point.label} className="flex items-center gap-1.5">
                <point.icon className="size-3.5 shrink-0" aria-hidden="true" />
                {point.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export { HeroSection };
