import { MailIcon } from "lucide-react";
import Link from "next/link";

import { Brand } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { PAKISTANI_CITIES } from "@/config/cities";
import { LOGIN_ROUTE } from "@/config/routes";
import { siteConfig } from "@/config/site";

const FOOTER_LINK_CLASS =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring w-fit rounded text-sm transition-colors outline-none focus-visible:ring-2";

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

/**
 * Footer for the public marketplace.
 *
 * The city list doubles as internal linking for SEO: a crawler reaching any
 * public page finds a path to every launch city's browse view. The hrefs use the
 * same `?city=` parameter the browse filters read.
 */
function SiteFooter() {
  return (
    <footer className="bg-muted/40 mt-auto border-t">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-12 px-4 pt-14 pb-8 lg:px-6">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)] lg:gap-16">
          <div className="flex flex-col items-start gap-4">
            <Brand href="/" />
            <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
              Rent cameras, tools, camping gear and party equipment from people
              in your city, and earn from the things you own.
            </p>
            <Button
              variant="outline"
              className="mt-1"
              render={<Link href="/dashboard/listings" />}
            >
              List an item
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.5fr)]">
            {LINK_GROUPS.map((group) => (
              <nav
                key={group.title}
                aria-label={group.title}
                className="flex flex-col gap-3"
              >
                <h2 className="font-heading text-sm font-semibold">
                  {group.title}
                </h2>
                <ul className="flex flex-col gap-2.5">
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
                className="font-heading text-sm font-semibold"
              >
                Cities
              </h2>
              <ul className="flex flex-col gap-2.5">
                {PAKISTANI_CITIES.map((city) => (
                  <li key={city.value}>
                    <Link
                      href={`/listings?city=${city.value}`}
                      className={FOOTER_LINK_CLASS}
                    >
                      Rent in {city.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="flex flex-col gap-3">
              <h2 className="font-heading text-sm font-semibold">Support</h2>
              <a
                href={`mailto:${siteConfig.supportEmail}`}
                className={`${FOOTER_LINK_CLASS} flex items-center gap-1.5`}
              >
                <MailIcon className="size-3.5 shrink-0" aria-hidden="true" />
                {siteConfig.supportEmail}
              </a>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Questions about a booking, a payment or a deposit.
              </p>
            </div>
          </div>
        </div>

        <div className="text-muted-foreground flex flex-col gap-2 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
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
  );
}

export { SiteFooter };
