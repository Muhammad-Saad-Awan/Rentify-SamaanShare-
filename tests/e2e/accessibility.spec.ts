import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import type { Page } from "@playwright/test";

/**
 * Automated accessibility scanning of the public pages.
 *
 * WHAT AXE CAN AND CANNOT DO. It catches the computed and the structural - contrast ratios,
 * missing names, broken heading order, form fields with no label - which is exactly the half a
 * human reading the source cannot check. It cannot tell whether focus goes somewhere sensible when
 * a panel closes, or whether a keyboard user can reach an explanation. That half is in
 * `keyboard.spec.ts`, and neither file is a substitute for the other.
 *
 * A CLEAN AXE RUN IS NOT AN ACCESSIBLE PAGE. Published figures put automated coverage at roughly
 * a third of real issues. These tests are a floor, not a certificate.
 */

/** WCAG 2.1 A and AA, which is the level this project is aiming at. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
}

/**
 * Formats violations so a failure names what to fix and where, rather than printing a count.
 *
 * A bare `expect(violations).toEqual([])` reports "expected length 3 to be 0", which sends whoever
 * sees it back to the browser to find out what the three were.
 */
function describeViolations(
  violations: Awaited<ReturnType<typeof scan>>["violations"]
): string {
  return violations
    .map((violation) => {
      const targets = violation.nodes
        .slice(0, 4)
        .map((node) => `      ${node.target.join(" ")}`)
        .join("\n");

      const more =
        violation.nodes.length > 4
          ? `\n      ...and ${violation.nodes.length - 4} more`
          : "";

      return `  [${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help}\n${targets}${more}\n      ${violation.helpUrl}`;
    })
    .join("\n\n");
}

async function expectNoViolations(page: Page) {
  /**
   * WAIT FOR THE DOCUMENT TO FINISH ARRIVING BEFORE SCANNING IT.
   *
   * Next streams the response, and `generateMetadata` resolves into `<head>` as part of that
   * stream. Scanning too early reports `document-title` against a page that does have a title a
   * moment later - which is exactly what happened once the suite grew enough to run scans under
   * load. A real browser is never in a hurry the way a test is.
   *
   * Asserted rather than slept on: this retries until the title is there, and fails loudly if it
   * genuinely never arrives instead of hiding a real missing title behind a timeout.
   */
  await expect(page).toHaveTitle(/.+/);

  const { violations } = await scan(page);

  expect(
    violations,
    violations.length > 0
      ? `\n${describeViolations(violations)}\n`
      : "no violations"
  ).toEqual([]);
}

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
    await page.goto("/listings");

    /**
     * Followed from the browse page rather than hard-coded.
     *
     * A listing id pasted into a test is a row someone can archive, and the failure that produces
     * is a 404 in a test about contrast ratios. Whatever is visible today is what gets scanned.
     */
    const firstListing = page.locator('a[href^="/listings/"]').first();
    await expect(firstListing).toBeVisible();
    await firstListing.click();

    await expect(page).toHaveURL(/\/listings\/.+/);
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
