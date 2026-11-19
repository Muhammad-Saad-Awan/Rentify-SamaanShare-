import {
  ArrowRightIcon,
  BadgeCheckIcon,
  ClipboardCheckIcon,
  MailIcon,
  MapPinIcon,
  ShieldCheckIcon,
} from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { PAKISTANI_CITIES } from "@/config/cities";
import { LOGIN_ROUTE } from "@/config/routes";
import { siteConfig } from "@/config/site";

/**
 * Link text on navy is `primary-foreground/70` - measured at 7.57:1 - and full strength on
 * hover. The focus ring is inverted so it stays visible on the dark surface.
 */
const FOOTER_LINK_CLASS =
  "text-primary-foreground/70 hover:text-primary-foreground focus-visible:ring-primary-foreground focus-visible:ring-offset-primary dark:text-muted-foreground dark:hover:text-foreground w-fit rounded text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

/**
 * Every link points at a route that exists today. `/dashboard/listings` and `/saved` are
 * protected; middleware sends a signed-out visitor to login and back, as with the homepage CTA.
 */
const LINK_GROUPS = [
  {
    title: "Marketplace",
    links: [
      { href: "/listings", label: "Browse all listings" },
      { href: "/dashboard/listings", label: "List an item" },
      { href: "/#how-it-works", label: "How it works" },
    ],
  },
  {
    title: "Your account",
    links: [
      { href: LOGIN_ROUTE, label: "Sign in" },
      { href: "/register", label: "Create an account" },
      { href: "/saved", label: "Saved items" },
    ],
  },
];

/** What the platform guarantees, each backed by the payment, identity and handover flows. */
const GUARANTEES = [
  { icon: ShieldCheckIcon, label: "Payments held until return" },
  { icon: BadgeCheckIcon, label: "CNIC-verified members" },
  { icon: ClipboardCheckIcon, label: "Condition recorded at handover" },
];

/**
 * The guarantees band that sits directly above the footer.
 *
 * Its own section rather than a row inside the navy panel: on a light card surface with mint
 * icon tiles it reads as a promise about the product, not as more footer navigation. It owns
 * `mt-auto`, which is what pushes the trust bar and footer together to the bottom of a short
 * page (`<body>` is a flex column in the root layout).
 */
function TrustBar() {
  return (
    <section aria-label="Our guarantees" className="bg-card mt-auto border-t">
      <ul className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-6 sm:grid-cols-3 sm:gap-6 lg:px-6">
        {GUARANTEES.map((item) => (
          <li
            key={item.label}
            className="flex items-center gap-3 sm:justify-center"
          >
            <span
              className="bg-brand-soft text-brand flex size-10 shrink-0 items-center justify-center rounded-xl"
              aria-hidden="true"
            >
              <item.icon className="size-5" strokeWidth={1.75} />
            </span>
            <span className="text-sm font-semibold">{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Footer for the public marketplace: the guarantees band, then a navy panel that closes every
 * public page.
 *
 * The city list doubles as internal linking for SEO: a crawler reaching any
 * public page finds a path to every launch city's browse view. The hrefs use the
 * same `?city=` parameter the browse filters read.
 *
 * Navy flips to a light surface under `.dark`, so the panel takes the card colour there
 * instead and its text uses the theme foregrounds - the same rule as the auth panel.
 */
function SiteFooter() {
  return (
    <>
      <TrustBar />

      <footer className="bg-primary text-primary-foreground dark:bg-card dark:text-card-foreground dark:border-t">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 pt-12 pb-5 lg:px-6">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)] lg:gap-16">
            <div className="flex flex-col items-start gap-4">
              <Brand
                href="/"
                tone="inverted"
                className="focus-visible:ring-primary-foreground focus-visible:ring-offset-primary"
              />
              <p className="text-primary-foreground/70 dark:text-muted-foreground max-w-sm text-sm leading-relaxed">
                Rent cameras, tools, camping gear and party equipment from
                people in your city, and earn from the things you own.
              </p>
              {/*
                Inverted light button: the default emerald would sit on navy at 2.66:1 and lose
                its edge, the same reason `CtaSection` inverts.
              */}
              <Button
                className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 focus-visible:ring-primary-foreground focus-visible:ring-offset-primary dark:bg-brand dark:text-brand-foreground h-10 rounded-xl px-5"
                render={<Link href="/dashboard/listings" />}
              >
                List an item
                <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.5fr)]">
              {LINK_GROUPS.map((group) => (
                <nav
                  key={group.title}
                  aria-label={group.title}
                  className="flex flex-col gap-3"
                >
                  <h2 className="font-heading text-sm font-bold">
                    {group.title}
                  </h2>
                  <ul className="flex flex-col gap-2">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <Link href={link.href} className={FOOTER_LINK_CLASS}>
                          {link.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}

              <nav
                aria-labelledby="footer-cities"
                className="flex flex-col gap-3"
              >
                <h2
                  id="footer-cities"
                  className="font-heading text-sm font-bold"
                >
                  Cities
                </h2>
                <ul className="flex flex-col gap-2">
                  {PAKISTANI_CITIES.map((city) => (
                    <li key={city.value}>
                      <Link
                        href={`/listings?city=${city.value}`}
                        className={`${FOOTER_LINK_CLASS} flex items-center gap-1.5`}
                      >
                        <MapPinIcon
                          className="size-3.5 shrink-0"
                          aria-hidden="true"
                        />
                        Rent in {city.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>

              {/* `min-w-0` + `break-all`: an email address is one unbreakable word, and at 360px
                  it was wider than its grid column, pushing the page into a sideways scroll. */}
              <div className="flex min-w-0 flex-col gap-3">
                <h2 className="font-heading text-sm font-bold">Support</h2>
                <a
                  href={`mailto:${siteConfig.supportEmail}`}
                  className={`${FOOTER_LINK_CLASS} flex items-center gap-1.5`}
                >
                  <MailIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 break-all">
                    {siteConfig.supportEmail}
                  </span>
                </a>
                <p className="text-primary-foreground/70 dark:text-muted-foreground text-xs leading-relaxed">
                  Questions about a booking, a payment or a deposit.
                </p>
              </div>
            </div>
          </div>

          <div className="text-primary-foreground/70 dark:text-muted-foreground border-primary-foreground/15 dark:border-border flex flex-col gap-1 border-t pt-4 text-xs sm:flex-row sm:items-center sm:justify-between">
            {/*
              Rendered from a literal rather than `new Date().getFullYear()`: on a
              statically rendered page that call is evaluated once at build time,
              so the "current" year silently freezes to whenever the deploy ran.
            */}
            <p>&copy; 2026 {siteConfig.name}. Built for Pakistan.</p>
            <p>All prices in Pakistani rupees.</p>
          </div>
        </div>
      </footer>
    </>
  );
}

export { SiteFooter };
