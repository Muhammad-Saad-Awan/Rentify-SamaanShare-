import { HandshakeIcon, MapPinIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";

import { ListingsSearch } from "@/components/marketplace/listings-search";
import { parseListingFilters } from "@/lib/marketplace/filters";

import type { FeaturedCategory } from "@/lib/queries/categories";

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

/**
 * What a first-time renter needs to trust a stranger's camera, stated as fact.
 *
 * The payment line matches `PaymentInstructions`: renters pay SamaanShare, by card or bank
 * transfer, and the platform holds the deposit. This used to say "cash on handover", which
 * stopped being true when payment moved onto the platform.
 */
const TRUST_POINTS = [
  {
    icon: ShieldCheckIcon,
    title: "Your money is held, not handed over",
    description:
      "You pay SamaanShare. The owner is paid once the item is back, and your deposit is returned.",
  },
  {
    icon: HandshakeIcon,
    title: "Condition recorded at handover",
    description:
      "The item's condition is recorded at pickup and at return, so a dispute starts from evidence.",
  },
  {
    icon: MapPinIcon,
    title: "Karachi, Lahore and Islamabad",
    description: "Filter by city and collect from an owner near you.",
  },
];

interface HeroSectionProps {
  /** Live count of listings a visitor can browse right now. */
  listingCount: number;
  /**
   * The homepage's category tiles, reused as one-tap shortcuts under the search box. Only those
   * with something to rent are offered - a shortcut to an empty page is a dead end.
   */
  categories?: readonly FeaturedCategory[];
}

/**
 * Landing hero.
 *
 * Owns the page's only `h1`. The search box is the same `ListingsSearch`
 * component the browse toolbar uses, so a term typed here lands on `/listings`
 * with exactly the URL the browse page would have produced - no second search
 * implementation to keep in step.
 *
 * Type, not imagery, carries the page: no single photograph can represent
 * "cameras, drills and party tents" at once, and a large one would be the page's
 * largest contentful paint for no informational gain. Left-aligned so the
 * headline, the search field and the trust column share one reading edge.
 *
 * The count is real rather than a rounded marketing number. On a marketplace this
 * young an inflated figure is checkable in one click, and being caught out is
 * worse than a small number.
 */
function HeroSection({ listingCount, categories = [] }: HeroSectionProps) {
  const shortcuts = categories
    .filter((category) => category.listingCount > 0)
    .slice(0, 4);

  return (
    <section className="border-b">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 pt-14 pb-16 sm:pt-20 sm:pb-20 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-16 lg:px-6 lg:pt-24 lg:pb-24">
        <div className="flex min-w-0 flex-col gap-8">
          <div className="flex flex-col gap-5">
            <h1 className="font-heading max-w-[13ch] text-[2.75rem] leading-[0.95] font-extrabold tracking-[-0.035em] sm:text-6xl lg:text-7xl">
              Rent what you need from people nearby.
            </h1>

            <p className="text-muted-foreground max-w-[46ch] text-base leading-relaxed text-pretty sm:text-lg">
              Cameras, power tools, camping gear and party equipment, by the
              day. Skip buying something you will use once.
            </p>
          </div>

          <div className="flex max-w-2xl flex-col gap-4">
            <ListingsSearch filters={NO_FILTERS} size="hero" />

            {shortcuts.length > 0 && (
              <nav
                aria-label="Popular categories"
                className="flex flex-wrap items-center gap-2"
              >
                {shortcuts.map((category) => (
                  <Link
                    key={category.slug}
                    href={`/categories/${category.slug}`}
                    className="hover:border-foreground focus-visible:ring-ring rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2"
                  >
                    {category.name}
                  </Link>
                ))}
              </nav>
            )}

            {listingCount > 0 && (
              <p className="text-muted-foreground text-sm">
                <span className="text-foreground font-medium tabular-nums">
                  {listingCount.toLocaleString("en-PK")}
                </span>{" "}
                {listingCount === 1
                  ? "item available to rent right now"
                  : "items available to rent right now"}
              </p>
            )}
          </div>
        </div>

        <ul className="flex flex-col self-end border-t lg:border-t-0 lg:border-l">
          {TRUST_POINTS.map((point) => (
            <li
              key={point.title}
              className="flex gap-4 border-b py-5 last:border-b-0 lg:pl-8"
            >
              <point.icon
                className="mt-0.5 size-5 shrink-0"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <div className="flex flex-col gap-1">
                <p className="font-heading text-[0.9375rem] leading-snug font-semibold">
                  {point.title}
                </p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {point.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export { HeroSection };
