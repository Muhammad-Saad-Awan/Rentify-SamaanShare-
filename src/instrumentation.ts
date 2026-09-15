import { publicEnv } from "@/config/env.public";

import type { Instrumentation } from "next";

/**
 * Server and edge error reporting.
 *
 * WHY A DEPENDENCY HERE, WHEN `cloudinary.ts` AND `email/send.ts` BOTH REFUSED ONE. The rule in
 * this codebase is that a dependency earns its place by doing something hard, and those two did
 * not: signing an upload and posting JSON are each a `fetch`. This is the other side of that rule.
 * Useful error tracking needs source maps uploaded and stack frames symbolicated, events grouped
 * into issues so one broken route is one alert rather than nine thousand, release association,
 * breadcrumbs, and capture across three runtimes. Hand-rolling that is a project, not a module.
 *
 * ENTIRELY OPTIONAL, like Resend and Cloudinary. With no DSN the SDK is never initialised and
 * nothing is sent - the app does not degrade, it simply is not being watched. That keeps the
 * project runnable locally without a fourth third-party account, and it means the `import` below
 * is the only cost paid by a developer who has not configured it.
 *
 * NEXT_RUNTIME rather than one shared init: the Node and edge runtimes are separate bundles with
 * separate SDK builds, and `register` is called once in each.
 */
export async function register() {
  const dsn = publicEnv.NEXT_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    return;
  }

  // Imported inside the guard so an unconfigured project does not pay for loading the SDK at all.
  const Sentry = await import("@sentry/nextjs");

  if (
    process.env.NEXT_RUNTIME === "nodejs" ||
    process.env.NEXT_RUNTIME === "edge"
  ) {
    Sentry.init({
      dsn,

      /**
       * ERRORS ONLY, NO PERFORMANCE TRACING.
       *
       * The task this was added for is knowing when something breaks in production, where today
       * the only record is a platform log nobody is watching. Tracing is a different tool with its
       * own quota cost, and turning it on silently would spend that quota without anyone deciding
       * to. Raise this and add `captureRouterTransitionStart` on the client when tracing is
       * actually wanted.
       */
      tracesSampleRate: 0,

      /**
       * NO PERSONALLY IDENTIFYING INFORMATION, EXPLICITLY.
       *
       * This is the default, and it is set anyway because the default is not the point - the
       * intent is. `email/send.ts` refuses to log a recipient because a reset mail body carries a
       * live account-takeover credential, and shipping request bodies, headers and cookies to a
       * third party would undo that from the other end. This app handles addresses, phone numbers
       * and pickup instructions; none of it belongs in an error report.
       */
      sendDefaultPii: false,
    });
  }
}

/**
 * Errors thrown while rendering a route, a Server Action, a route handler or middleware.
 *
 * This is the hook that makes server-side failures visible at all: a Server Component that throws
 * renders `error.tsx` to the user and leaves nothing behind but a line in the platform log.
 *
 * Guarded rather than conditionally exported, because Next reads this export once at startup.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  ...args
) => {
  if (!publicEnv.NEXT_PUBLIC_SENTRY_DSN) {
    return;
  }

  const Sentry = await import("@sentry/nextjs");

  Sentry.captureRequestError(...args);
};
