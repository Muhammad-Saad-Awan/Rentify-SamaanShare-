// From `/config`, not the package root: the root re-export is deprecated and stops working in
// the SDK's v11. The build says so, which is how this was caught.
import { withSentryConfig } from "@sentry/nextjs/config";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable React strict mode for better development experience
  reactStrictMode: true,

  /**
   * Image optimization configuration.
   *
   * ONE HOST, DELIBERATELY. Every entry here is a host `next/image` will fetch, proxy and cache
   * arbitrary bytes from on request, so this list is a security boundary rather than a convenience.
   * A `picsum.photos` entry lived here to make the demo seed's placeholder images render; both were
   * removed in Stage A6, before the first public deploy, because real uploads go to Cloudinary and
   * nothing else should be reachable through the optimizer.
   */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
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

/**
 * Sentry's build-time half: source map upload and release association.
 *
 * APPLIED ONLY WHEN A DSN EXISTS. The plugin is harmless without one, but it prints upload
 * warnings on every build, and a developer who has never heard of Sentry should not have to read
 * them to find out they do not matter. No DSN, no wrapper, no noise.
 *
 * Uploading source maps additionally needs `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and
 * `SENTRY_PROJECT`. Those are BUILD-TIME ONLY - nothing reads them at runtime, which is why they
 * are absent from `env.schema.ts`. Without them the build still succeeds and events still arrive;
 * the stack traces are just minified, which is the difference between an issue you can act on and
 * a line number in a bundle.
 *
 * No `tunnelRoute`. It would route browser events through this origin to dodge ad blockers, at
 * the cost of a public endpoint that proxies to a third party. Server-side errors - the ones that
 * matter most here - are never ad-blocked, so that trade has not been made.
 *
 * EXPECTED BUILD WARNING, when a DSN is set: the SDK asks for an `onRouterTransitionStart` export
 * in `instrumentation-client.ts` to instrument navigations. It is absent on purpose. Navigation
 * instrumentation is a tracing feature, tracing is off, and `removeTracing` below strips that code
 * from the bundle entirely - so the export would have nothing to hook into. Adding a no-op to
 * silence the warning would be the same mistake as a decorative `Content-Security-Policy`: it
 * would look like the feature exists, and it would quietly do nothing for whoever turns tracing on
 * later. The warning is a true statement and is left standing.
 */
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      ...(process.env.SENTRY_ORG ? { org: process.env.SENTRY_ORG } : {}),
      ...(process.env.SENTRY_PROJECT
        ? { project: process.env.SENTRY_PROJECT }
        : {}),
      // Quiet locally, verbose in CI where an upload failure is worth seeing.
      silent: !process.env.CI,

      /**
       * Shrink the SDK itself, since this install uses a fraction of it.
       *
       * `removeTracing` is the one that pays: `tracesSampleRate` is 0, so every byte of
       * performance-monitoring code in the bundle is dead weight, and it is the larger half of
       * the browser SDK. `removeDebugLogging` strips Sentry's own console output.
       *
       * Replaces the old top-level `disableLogger`, which the build warns is on its way out.
       */
      webpack: {
        treeshake: {
          removeDebugLogging: true,
          removeTracing: true,
        },
      },
    })
  : nextConfig;
