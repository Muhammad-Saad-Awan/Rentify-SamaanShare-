import { expect, test } from "@playwright/test";

import { readAccount } from "./fixtures/account";
import { expectNoViolations } from "./fixtures/axe";

/**
 * Automated accessibility scanning of the public pages.
 *
 * The scan itself lives in `fixtures/axe.ts`, shared with the signed-in and dark-theme suites.
 * What is here is the list of pages that must stay clean, and the way the listing is reached.
 */

test.describe("public pages pass axe", () => {
  test("home", async ({ page }) => {
    await page.goto("/");
    await expectNoViolations(page);
  });

  test("browse", async ({ page }) => {
    await page.goto("/listings");
    await expectNoViolations(page);
  });

  test("listing detail", async ({ page }) => {
    const account = readAccount();

    expect(account, "The setup project must run first").not.toBeNull();

    /**
     * LOADED DIRECTLY, not followed from the browse page.
     *
     * Clicking through is a client-side navigation, and the App Router swaps `<head>` as part of
     * it. That produced a `document-title` violation from a page that demonstrably has a title:
     * the scan's own guard saw the OLD page's title, passed, and axe then ran in the instant the
     * new one had not yet been written. A full load is also the stricter case for metadata, since
     * it is what a crawler and a first-time visitor get.
     *
     * The fixture listing rather than whichever row happens to be newest, so the page under scan
     * is the same every run - and it is the only one carrying photos, which is more of the page
     * actually rendered.
     */
    await page.goto(`/listings/${account?.listingId}`);

    await expectNoViolations(page);
  });

  test("login", async ({ page }) => {
    await page.goto("/login");
    await expectNoViolations(page);
  });

  test("register", async ({ page }) => {
    await page.goto("/register");
    await expectNoViolations(page);
  });
});
