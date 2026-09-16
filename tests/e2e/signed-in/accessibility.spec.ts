import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { readAccount } from "../fixtures/account";

import type { Page } from "@playwright/test";

/**
 * axe over the signed-in surface, which the first pass could not reach.
 *
 * These are the denser pages - forms, tables, a calendar - and they are also where the two
 * outstanding contrast suspicions live: `opacity-40` on past calendar days and `opacity-50` on an
 * exhausted drop zone. Contrast is one of the things axe actually computes, so this is where those
 * get settled.
 */

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const account = readAccount();

function describeViolations(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]
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
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    .analyze();

  expect(
    violations,
    violations.length > 0
      ? `\n${describeViolations(violations)}\n`
      : "no violations"
  ).toEqual([]);
}

test("dashboard", async ({ page }) => {
  await page.goto("/dashboard");
  await expectNoViolations(page);
});

test("my listings", async ({ page }) => {
  await page.goto("/dashboard/listings");
  await expectNoViolations(page);
});

test("new listing form", async ({ page }) => {
  await page.goto("/listings/new");
  await expectNoViolations(page);
});

test("availability calendar", async ({ page }) => {
  await page.goto(`/dashboard/listings/${account?.listingId}/availability`);
  await expectNoViolations(page);
});

test("settings", async ({ page }) => {
  await page.goto("/settings");
  await expectNoViolations(page);
});

test("profile", async ({ page }) => {
  await page.goto("/profile");
  await expectNoViolations(page);
});
