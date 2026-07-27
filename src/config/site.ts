/**
 * Site-wide configuration and metadata
 */
export const siteConfig = {
  name: "SamaanShare",
  description: "Peer-to-Peer Rental Marketplace for Pakistan",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",

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
