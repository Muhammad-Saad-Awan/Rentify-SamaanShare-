import { siteConfig } from "@/config/site";
import { PROTECTED_PREFIXES } from "@/config/routes";

import type { MetadataRoute } from "next";

/**
 * Crawler rules.
 *
 * The disallow list is derived from `PROTECTED_PREFIXES` rather than written out, so a
 * route added to the auth config cannot be left crawlable by omission. Every one of those
 * paths answers a signed-out request with a redirect to `/login`, and a crawler that
 * follows them just accumulates copies of the login page.
 *
 * `/api/` is excluded separately: it is not in `PROTECTED_PREFIXES` (Auth.js needs its own
 * endpoints reachable) but nothing under it is a page.
 *
 * Filtered browse URLs are NOT listed here. They are handled with `robots: { index: false }`
 * in the page's metadata instead - a `Disallow` would stop the crawler *fetching* them,
 * which also stops it seeing the canonical tag that consolidates them onto `/listings`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...PROTECTED_PREFIXES.map((prefix) => `${prefix}/`), "/api/"],
    },
    sitemap: new URL("/sitemap.xml", siteConfig.url).toString(),
    host: siteConfig.url,
  };
}
