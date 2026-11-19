import {
  ArrowLeftRightIcon,
  ShieldCheckIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react";
import Image from "next/image";

import { ListingsSearch } from "@/components/marketplace/listings-search";
import { parseListingFilters } from "@/lib/marketplace/filters";

import heroImage from "../../../public/images/hero-camera.jpg";

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
 * Short trust points under the search box. Each is backed by the product: payments are held by
 * the platform until the item is back, members verify their CNIC, and a booking is a request,
 * an approval and a payment.
 */
const TRUST_POINTS = [
  { icon: ShieldCheckIcon, label: "Safe & Secure Transactions" },
  { icon: UsersIcon, label: "Trusted Community" },
  { icon: ZapIcon, label: "Fast & Easy" },
];

/**
 * Landing hero.
 *
 * Owns the page's only `h1`. The search box is the same `ListingsSearch`
 * component the browse toolbar uses, so a term typed here lands on `/listings`
 * with exactly the URL the browse page would have produced - no second search
 * implementation to keep in step.
 *
 * The photograph is the composed hero visual (camera, floating rental cards, mint shape) on
 * white. `mix-blend-multiply` lets that white take on the page colour, so the image has no
 * visible rectangle around it. It is the largest paint on the page, hence `priority`, and
 * decorative - the "Rent a Laptop" cards inside it are illustration, not listings - so its alt
 * is empty.
 */
function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-4 pt-8 pb-12 sm:pt-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8 lg:px-6 lg:pt-10 lg:pb-16">
        <div className="animate-fade-up flex min-w-0 flex-col gap-7">
          <p className="bg-brand-soft text-brand-soft-foreground flex w-fit items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold">
            <ArrowLeftRightIcon className="size-4" aria-hidden="true" />
            Rent
            <span aria-hidden="true">&middot;</span>
            Borrow
            <span aria-hidden="true">&middot;</span>
            Share
          </p>

          <div className="flex flex-col gap-5">
            {/* Sized so each of the three lines fits its column whole from `lg` up, as in the
                reference; below that the phrases are free to wrap. */}
            <h1 className="font-heading text-[2.5rem] leading-[1.05] font-extrabold tracking-[-0.035em] sm:text-6xl lg:text-[3.25rem] xl:text-[3.75rem]">
              <span className="block">SamaanShare</span>
              <span className="block">
                <span className="text-brand">Rent</span> What You Need,
              </span>
              <span className="block">
                <span className="text-brand">Share</span> What You Have
              </span>
            </h1>

            <p className="text-muted-foreground max-w-[44ch] text-base leading-relaxed text-pretty sm:text-lg">
              A trusted peer-to-peer platform to rent and lend items easily,
              safely and affordably.
            </p>
          </div>

          <ListingsSearch
            filters={NO_FILTERS}
            size="hero"
            className="max-w-2xl"
          />

          <ul className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {TRUST_POINTS.map((point, index) => (
              <li
                key={point.label}
                className="flex items-center gap-2 text-sm font-medium"
              >
                {index > 0 && (
                  <span
                    className="bg-border mr-3 hidden h-7 w-px sm:block"
                    aria-hidden="true"
                  />
                )}
                <point.icon
                  className="text-brand size-5 shrink-0"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                {point.label}
              </li>
            ))}
          </ul>
        </div>

        {/*
          Staggered a beat after the copy, so the eye lands on the headline first.
          The blend sits HERE, not on the <img>: the animation's opacity/transform makes this
          wrapper a stacking context, and an image blending inside it would multiply against
          the wrapper's transparent backdrop - leaving its white background visible as a box.
        */}
        <div className="animate-fade-up relative mx-auto w-full max-w-2xl mix-blend-multiply [animation-delay:150ms] lg:max-w-none">
          <Image
            src={heroImage}
            alt=""
            priority
            placeholder="blur"
            sizes="(min-width: 1280px) 660px, (min-width: 1024px) 52vw, 100vw"
            className="h-auto w-full"
          />
        </div>
      </div>
    </section>
  );
}

export { HeroSection };
