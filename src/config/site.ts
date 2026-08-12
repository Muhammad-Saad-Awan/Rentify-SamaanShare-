import { publicEnv } from "@/config/env.public";

/**
 * Site-wide configuration and metadata.
 *
 * Imported by Client Components, so it may only read from `env.public` - never `env`, which is
 * server-only and would throw in the browser.
 */
export const siteConfig = {
  name: "SamaanShare",
  description: "Peer-to-Peer Rental Marketplace for Pakistan",
  // Validated and trailing-slash-stripped at startup; the `|| localhost` fallback that used to
  // live here is now the schema's default.
  url: publicEnv.NEXT_PUBLIC_APP_URL,

  // SEO
  keywords: [
    "rental",
    "Pakistan",
    "peer-to-peer",
    "marketplace",
    "rent items",
    "Karachi",
    "Lahore",
    "Islamabad",
  ],

  // Social
  links: {
    github: "https://github.com/Muhammad-Saad-Awan/Rentify-SamaanShare-",
  },

  // Contact
  supportEmail: "support@samaanshare.pk",
} as const;

export type SiteConfig = typeof siteConfig;
