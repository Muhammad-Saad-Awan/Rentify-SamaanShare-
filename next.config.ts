import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  // Image optimization configuration
  images: {
    // Cloudinary will be added here when configured
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      // Demo seed data only (prisma/seed-demo.ts). Listing cards render through
      // next/image, which refuses any host not listed here, so demo listings
      // would show broken images without it. Remove this entry - and the demo
      // data - before launch: real uploads go to Cloudinary above.
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },

  /**
   * Security headers.
   *
   * Applied to every route. A hosting platform supplies some of these, but not
   * consistently and not CSP - and the app now renders user-submitted text and
   * user-uploaded images on public pages, which is exactly when they start to matter.
   *
   * NO CONTENT-SECURITY-POLICY YET, deliberately. Next injects inline scripts for
   * hydration and inline styles, so a useful CSP needs per-request nonces threaded through
   * middleware; a policy loose enough to work without them (`unsafe-inline`) would provide
   * close to no protection while looking like it does. Worth doing properly as its own
   * change rather than shipping a decorative header.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Stops a browser from second-guessing a declared Content-Type, which is how a
          // user-uploaded file gets treated as script.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // No framing at all: nothing here is meant to be embedded, and this is the
          // clickjacking defence that does not depend on CSP support.
          { key: "X-Frame-Options", value: "DENY" },
          // Send the full URL within our own origin, only the origin cross-site - so a
          // listing's path is never leaked to Cloudinary or an outbound link.
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Nothing in the app uses these, so they are denied outright rather than left to
          // a future dependency to request.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
          // Two years, subdomains included. Harmless locally over http, since browsers
          // ignore HSTS on a non-secure origin.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ],
      },
    ];
  },

  // Experimental features
  experimental: {
    // Enable server actions (enabled by default in Next.js 15)
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
