import { defineConfig } from "@playwright/test";

/**
 * End-to-end and accessibility tests.
 *
 * WHAT THIS EXISTS FOR, beyond "we should have E2E tests". The 15 September accessibility work -
 * focus handed back when a panel closes, `aria-disabled` in place of `disabled` so an unavailable
 * control keeps its place in the tab order - was written, reviewed and shipped **without any of it
 * being observed**. `tsc`, ESLint and 552 unit tests can all pass while focus lands on `<body>`,
 * because none of them run a browser. This is the harness that can tell.
 *
 * AGAINST A PRODUCTION BUILD, not `next dev`. The dev server injects its own overlay and dev-tools
 * portal into the page, and an axe scan cannot tell Next's injected markup from ours - a violation
 * in the overlay would be reported against the application, and a real one it happens to cover
 * would be missed. `reuseExistingServer` keeps local iteration fast: start the app once yourself
 * and every run attaches to it.
 *
 * THESE TESTS NEED A DATABASE, like the `verify:*` scripts do. The pages under test are Server
 * Components that query Prisma, so there is no meaningful version of this that runs against
 * nothing. Point `DATABASE_URL` at a database with the demo seed applied (`npm run db:seed` then
 * `npm run db:seed:demo`).
 */

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",

  /**
   * Parallel by file. Every test here is read-only against shared seed data, so they cannot
   * interfere with each other. A test that *writes* would have to opt out of this, and would be
   * better off creating and removing its own row instead.
   */
  fullyParallel: true,

  // `.only` left in a file is a local convenience and a CI blind spot.
  forbidOnly: Boolean(process.env.CI),

  /**
   * No retries locally. A test that passes on a second attempt is telling you something, and
   * hiding it behind a retry locally means only CI ever hears it. CI retries once, because a
   * cold serverless database really can time out on first contact - see Stage A4.
   */
  retries: process.env.CI ? 1 : 0,

  /**
   * Spread rather than `workers: process.env.CI ? 1 : undefined`.
   *
   * The project sets `exactOptionalPropertyTypes`, under which a deliberately-passed `undefined`
   * is not the same as an absent property and is rejected. Omitting it lets Playwright pick its
   * own default, which is what "undefined" was trying to say.
   */
  ...(process.env.CI ? { workers: 1 } : {}),

  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL,
    // Kept only for a retry, so the common green run writes nothing to disk.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        // Desktop-sized on purpose: the browse filters, the thumbnail strip and the calendar all
        // collapse below `sm`, and the controls being tested here are the expanded ones.
        viewport: { width: 1280, height: 900 },
      },
    },
  ],

  webServer: {
    /**
     * Boots an ALREADY-BUILT app, and deliberately does not build one.
     *
     * Folding the build into this command puts a two-and-a-half minute compile inside the
     * server's start-up budget, which is exactly how the first run of this suite failed: it
     * timed out having compiled the shell and run no tests at all. `npm run test:e2e` builds
     * first and then calls Playwright, leaving this with nothing to do but start.
     *
     * Skipped entirely whenever a server is already listening, which is what makes local
     * iteration quick.
     */
    command: "npm run start",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
