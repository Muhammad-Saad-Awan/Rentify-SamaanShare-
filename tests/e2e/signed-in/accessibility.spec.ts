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

/**
 * Named assertions for the two violations axe found on 16 September.
 *
 * The scans above would fail again if either regressed, but only as "1 violation on settings",
 * which says nothing about which fix came undone. These two name the thing being protected, so a
 * regression reports itself.
 */
test.describe("regressions", () => {
  test("muted text on a muted surface clears the AA threshold", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    /**
     * Measured from the live page, not recomputed from the token.
     *
     * Reading `--muted-foreground` and asserting it equals 0.545 would only prove the file says
     * what the file says. This paints both tokens, reads the pixels back, and applies the WCAG
     * formula - so it stays true through a token rename, a theme change, or any later edit that
     * happens to darken the surface instead.
     */
    const ratio = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.color = "var(--muted-foreground)";
      probe.style.backgroundColor = "var(--muted)";
      document.body.appendChild(probe);

      const computed = getComputedStyle(probe);
      const foreground = computed.color;
      const background = computed.backgroundColor;

      probe.remove();

      /** Any colour syntax resolves to sRGB bytes once something actually paints it. */
      const toRgb = (value: string): [number, number, number] => {
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;

        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("No 2D context available to resolve colours.");
        }

        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);

        const { data } = context.getImageData(0, 0, 1, 1);

        return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
      };

      const luminance = ([red, green, blue]: [number, number, number]) => {
        const channel = (value: number) => {
          const scaled = value / 255;

          return scaled <= 0.03928
            ? scaled / 12.92
            : Math.pow((scaled + 0.055) / 1.055, 2.4);
        };

        return (
          0.2126 * channel(red) +
          0.7152 * channel(green) +
          0.0722 * channel(blue)
        );
      };

      const one = luminance(toRgb(foreground));
      const two = luminance(toRgb(background));
      const lighter = Math.max(one, two);
      const darker = Math.min(one, two);

      return (lighter + 0.05) / (darker + 0.05);
    });

    // 4.5:1 is the WCAG AA minimum for normal-size text. This pair measured 4.34:1 before the fix.
    expect(
      ratio,
      `--muted-foreground on --muted measured ${ratio.toFixed(2)}:1`
    ).toBeGreaterThanOrEqual(4.5);
  });

  test("the notification switches carry an accessible name", async ({
    page,
  }) => {
    await page.goto("/settings");

    /**
     * Queried BY ROLE, which is the entire point.
     *
     * Base UI renders a `<span role="switch">` beside a hidden `<input>`, and `id` lands on the
     * input - so the `<label htmlFor>` named an element assistive technology never reports, while
     * the switch itself announced as "switch, on" with nothing to say what was on. Resolving these
     * through the accessibility tree is what proves the name reached the reported control, and it
     * is what a lookup by test id or CSS class would have missed entirely.
     */
    await expect(
      page.getByRole("switch", { name: "Review reminders" })
    ).toBeVisible();

    await expect(
      page.getByRole("switch", { name: "Review published" })
    ).toBeVisible();
  });
});
