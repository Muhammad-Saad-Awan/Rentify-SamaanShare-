import Link from "next/link";

import { PAKISTANI_CITIES } from "@/config/cities";
import { siteConfig } from "@/config/site";

/**
 * Footer for the public marketplace.
 *
 * The city list doubles as internal linking for SEO: a crawler reaching any
 * public page finds a path to every launch city's browse view. The hrefs use the
 * same `?city=` parameter the browse filters will read, so they keep working
 * unchanged once filtering lands.
 */
function SiteFooter() {
  return (
    <footer className="bg-muted/30 mt-auto border-t">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10 lg:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-2">
            <p className="font-heading text-sm font-semibold">
              {siteConfig.name}
            </p>
            <p className="text-muted-foreground max-w-xs text-sm">
              {siteConfig.description}
            </p>
          </div>

          <nav aria-labelledby="footer-cities" className="flex flex-col gap-2">
            <h2
              id="footer-cities"
              className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
            >
              Cities
            </h2>
            <ul className="flex flex-col gap-1.5">
              {PAKISTANI_CITIES.map((city) => (
                <li key={city.value}>
                  <Link
                    href={`/listings?city=${city.value}`}
                    className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded text-sm outline-none focus-visible:ring-2"
                  >
                    Rent in {city.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-col gap-2">
            <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Support
            </h2>
            <a
              href={`mailto:${siteConfig.supportEmail}`}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring w-fit rounded text-sm outline-none focus-visible:ring-2"
            >
              {siteConfig.supportEmail}
            </a>
          </div>
        </div>

        <p className="text-muted-foreground border-t pt-6 text-xs">
          {/*
            Rendered from a literal rather than `new Date().getFullYear()`: on a
            statically rendered page that call is evaluated once at build time,
            so the "current" year silently freezes to whenever the deploy ran.
          */}
          &copy; 2026 {siteConfig.name}. Built for Pakistan.
        </p>
      </div>
    </footer>
  );
}

export { SiteFooter };
