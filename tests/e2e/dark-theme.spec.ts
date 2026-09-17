import { expect, test } from "@playwright/test";

import { THEME_CONFIG } from "@/config/theme";

import { expectNoViolations, measureContrast } from "./fixtures/axe";

import type { Page } from "@playwright/test";

/**
 * The dark theme, which nobody can currently see.
 *
 * \`THEME_CONFIG.darkMode.enabled\` is \`false\` for the MVP, and the provider passes
 * \`forcedTheme="light"\`, so every visitor is pinned to the light theme and \`setTheme\` is a no-op.
 * The tokens, the \`dark\` variant and the provider are all wired; only the switch is off.
 *
 * SO WHY TEST IT. Because turning it on is described as a one-line change, and a one-line change
 * is exactly the kind that ships without an audit. The light theme had a contrast failure that
 * survived every review until axe measured it; assuming the dark half is fine because nobody has
 * looked would be the same mistake with the same excuse. Measuring now means the switch can be
 * flipped on evidence rather than hope.
 *
 * The class is forced directly rather than through \`setTheme\`, which \`forcedTheme\` disables.
 * \`globals.css\` selects on \`.dark\`, so setting the class is what actually swaps the tokens - this
 * measures the real pair, not a simulation of it.
 */

async function forceDarkTheme(page: Page) {
  /**
   * THE CLASS GOES ON `<body>`, NOT `<html>`, and that is not a detail.
   *
   * `next-themes` owns the `<html>` class and re-applies `forcedTheme` on its next render, so
   * setting it there worked or did not depending on whether React happened to re-render before
   * the scan - two of these tests failed that way and the rest passed, which is the worst
   * possible outcome for a test. `<body>` is nobody's to reclaim.
   *
   * It still swaps the theme, because `globals.css` defines the dark tokens under a plain `.dark`
   * selector: the custom properties are redefined on whichever element carries the class and
   * inherit down from there. The `dark:` variant is `&:is(.dark *)`, so descendants match too.
   */
  const readBackground = () =>
    page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue("--background").trim()
    );

  const lightBackground = await readBackground();

  await page.evaluate(() => {
    document.body.classList.add("dark");
    // Keeps form controls and scrollbars in step, as a real dark theme would.
    document.documentElement.style.colorScheme = "dark";
  });

  // Fail loudly rather than silently scanning the light theme and reporting it as dark.
  await expect(page.locator("body")).toHaveClass(/dark/);

  /**
   * And prove the tokens actually changed hands, rather than trusting the class alone. If the
   * stylesheet ever stops keying off `.dark`, this fails instead of quietly measuring the light
   * theme and reporting it as a dark-theme pass - which is the failure mode that would make this
   * whole file worthless while looking green.
   */
  expect(
    await readBackground(),
    "The dark tokens did not apply - --background is unchanged from the light theme"
  ).not.toBe(lightBackground);
}

test.describe("dark theme", () => {
  test("muted text on a muted surface clears the AA threshold", async ({
    page,
  }) => {
    await page.goto("/listings");
    await forceDarkTheme(page);

    const ratio = await measureContrast(page, "--muted-foreground", "--muted");

    expect(
      ratio,
      `--muted-foreground on --muted measured ${ratio.toFixed(2)}:1 in the dark theme`
    ).toBeGreaterThanOrEqual(4.5);
  });

  test("body text on the page background clears the AA threshold", async ({
    page,
  }) => {
    await page.goto("/listings");
    await forceDarkTheme(page);

    const ratio = await measureContrast(page, "--foreground", "--background");

    expect(
      ratio,
      `--foreground on --background measured ${ratio.toFixed(2)}:1 in the dark theme`
    ).toBeGreaterThanOrEqual(4.5);
  });

  test("home passes axe in dark", async ({ page }) => {
    await page.goto("/");
    await forceDarkTheme(page);
    await expectNoViolations(page);
  });

  test("browse passes axe in dark", async ({ page }) => {
    await page.goto("/listings");
    await forceDarkTheme(page);
    await expectNoViolations(page);
  });

  test("login passes axe in dark", async ({ page }) => {
    await page.goto("/login");
    await forceDarkTheme(page);
    await expectNoViolations(page);
  });

  /**
   * A guard against this file quietly becoming decorative.
   *
   * If dark mode is switched on, forcing the class stops being a stand-in for the real thing and
   * these scans should be following the actual theme instead - including the switcher itself,
   * which does not render while \`isThemeSwitchable\` is false and is therefore untested here.
   */
  test("is still switched off, so these scans remain pre-emptive", () => {
    expect(
      THEME_CONFIG.darkMode.enabled,
      "Dark mode is now enabled - these tests should drive the real theme, not force the class"
    ).toBe(false);
  });
});
