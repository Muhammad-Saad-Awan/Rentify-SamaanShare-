import { publicEnv } from "@/config/env.public";

/**
 * Browser error reporting.
 *
 * A SEPARATE FILE FROM `instrumentation.ts` because Next loads them differently: that one runs on
 * the server and edge through `register()`, this one is bundled into the client and evaluated
 * before the app mounts. Neither can stand in for the other.
 *
 * THE IMPORT IS DYNAMIC, WHICH IS A REAL TRADE AND NOT AN OVERSIGHT. A static import would put
 * the browser SDK in the initial bundle of every page for every visitor, configured or not -
 * measurably, since this build's shared JS is 121 kB. Loading it as its own chunk means an error
 * thrown in the first moments after hydration can be missed, and that is the cost being accepted:
 * this application is almost entirely Server Components, so the errors worth catching arrive
 * through `onRequestError` on the server, where there is no such race.
 *
 * A DSN IS NOT A SECRET, despite looking like one. It is a write-only ingest address, published in
 * every client bundle of every app using Sentry, which is why it is `NEXT_PUBLIC_`. The credential
 * that actually matters is `SENTRY_AUTH_TOKEN`, which uploads source maps at build time and never
 * reaches the browser.
 */
if (publicEnv.NEXT_PUBLIC_SENTRY_DSN) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn: publicEnv.NEXT_PUBLIC_SENTRY_DSN,

      // Errors only - see the note in `instrumentation.ts`.
      tracesSampleRate: 0,

      /**
       * Not `sendDefaultPii`, and on the client this matters more than on the server: the browser
       * SDK would otherwise attach the user's IP address to every event.
       */
      sendDefaultPii: false,
    });
  });
}
