import { expect, test } from "@playwright/test";

import { expectNoViolations, measureContrast } from "../fixtures/axe";
import { readAccount } from "../fixtures/account";

/**
 * axe over the signed-in surface.
 *
 * These are the denser pages - forms, tables, a calendar - and they are where both 16 September
 * violations were found. The scan helper is shared; see `fixtures/axe.ts`.
 */

const account = readAccount();

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
    const ratio = await measureContrast(page, "--muted-foreground", "--muted");

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
