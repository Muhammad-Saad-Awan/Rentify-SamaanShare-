import { expect, test } from "@playwright/test";

/**
 * Keyboard and focus behaviour, which axe cannot see.
 *
 * Every assertion here corresponds to a fix shipped on 15 September 2026 that was, until this
 * file existed, entirely unobserved. A control can have a perfect accessible name, pass every
 * automated rule, and still be unreachable by the only input method some people have.
 */

test.describe("skip link", () => {
  test("is the first tab stop and moves focus to the content", async ({
    page,
  }) => {
    await page.goto("/listings");

    /**
     * From the address bar into the document. The skip link is `sr-only` until focused, so a test
     * that looked for a visible element would find nothing - being invisible right up until it is
     * needed is the entire design.
     */
    await page.keyboard.press("Tab");

    const skipLink = page.getByRole("link", { name: "Skip to content" });
    await expect(skipLink).toBeFocused();

    // Now visible, because focus is what reveals it.
    await expect(skipLink).toBeVisible();

    await page.keyboard.press("Enter");

    /**
     * The point of the link: everything before `<main>` is now behind the user. Without it, a
     * keyboard user walks the wordmark, the nav, the search field and both account actions on
     * every single navigation.
     */
    await expect(page).toHaveURL(/#main-content$/);
  });
});

test.describe("pagination", () => {
  /**
   * Regression test for a real defect.
   *
   * The edge control rendered `disabled` under a comment promising `aria-disabled` and claiming
   * screen readers would still announce it. They would not: `disabled` removes an element from
   * the tab order entirely, so on page 1 the "Previous" control was not merely inert, it was
   * absent - to a keyboard user and to a screen reader alike.
   *
   * Requires more than one page of listings, which the demo seed provides (14 visible against a
   * page size of 12). Skipped rather than failed otherwise, because a single page of results is a
   * data condition and not a bug.
   */
  test("keeps the unavailable edge control reachable", async ({ page }) => {
    await page.goto("/listings");

    const pagination = page.getByRole("navigation", { name: "Pagination" });

    if ((await pagination.count()) === 0) {
      test.skip(
        true,
        "Needs more than one page of visible listings; seed the demo data."
      );
    }

    const previous = pagination.getByRole("button", { name: "Previous page" });

    await expect(previous).toBeVisible();

    // Marked unavailable, so it is announced as such...
    await expect(previous).toHaveAttribute("aria-disabled", "true");

    /**
     * ...but WITHOUT the HTML `disabled` attribute, which is the whole distinction: that
     * attribute, and only that attribute, removes an element from the tab order.
     *
     * Checked against the DOM rather than with `.not.toBeDisabled()`. Playwright resolves that
     * matcher through the accessibility tree, where `aria-disabled="true"` reports as disabled
     * too - correctly, since that is exactly what it is meant to convey. So the matcher cannot
     * tell the two apart, and it is the difference between them that this test exists for.
     */
    const hasDisabledAttribute = await previous.evaluate((element) =>
      element.hasAttribute("disabled")
    );
    expect(hasDisabledAttribute).toBe(false);

    // The assertion that would have caught the original bug: it can still hold focus.
    await previous.focus();
    await expect(previous).toBeFocused();
  });

  /**
   * KNOWN DEFECT, found by this test on its first run - `test.fixme` so the suite stays honest
   * about it rather than either failing forever or asserting the broken behaviour as correct.
   *
   * `Pagination`'s own doc comment says these are "Real `<Link>`s, not buttons with an
   * `onClick`", and in the DOM they are. But the project's `Button` derives
   * `nativeButton={false}` whenever `render` is not a literal `"button"`, and Base UI then
   * applies `role="button"` to the anchor so a non-button behaves like one. The accessibility
   * tree therefore reads:
   *
   *     navigation "Pagination":
   *       button "Previous page" [disabled]
   *       paragraph: Page 1 of 2
   *       button "Next page"
   *
   * So a screen reader user is told these activate something, never that they navigate - and the
   * "shareable and linkable" property the comment is proud of is invisible to them.
   *
   * NOT FIXED HERE because it is not local to pagination: 42 modules use `render={<Link />}`, and
   * every one of them announces a navigation as a button. The fix is to style the link instead of
   * rendering a button as one - `buttonVariants` is already exported for exactly that and is
   * currently used nowhere. That is its own change, with its own review.
   */
  test.fixme("next page is a real link, so the page is shareable", async ({
    page,
  }) => {
    await page.goto("/listings");

    const pagination = page.getByRole("navigation", { name: "Pagination" });

    if ((await pagination.count()) === 0) {
      test.skip(true, "Needs more than one page of visible listings.");
    }

    /**
     * A `<Link>` and not a click handler, which is why this is a role=link assertion. It keeps the
     * control working without JavaScript, makes each page linkable, and lets the browser's own
     * back button move between pages.
     */
    const next = pagination.getByRole("link", { name: "Next page" });
    await expect(next).toHaveAttribute("href", /page=2/);

    await next.click();
    await expect(page).toHaveURL(/page=2/);

    // And now the other edge is the inert one.
    await expect(
      pagination.getByRole("link", { name: "Previous page" })
    ).toBeVisible();
  });
});

test.describe("listing gallery", () => {
  /**
   * The thumbnail strip only exists for a listing with more than one photo, and the restored demo
   * seed deliberately carries none - `picsum.photos` was removed from `next.config.ts` before the
   * first deploy, and the seed came back without images rather than pointing at a host the image
   * optimizer is not allowed to fetch.
   *
   * So this skips today and starts running the moment real listings exist, which is the useful
   * behaviour: it does not rot, and it does not pretend to have verified something it has not.
   */
  test("announces which photo is showing", async ({ page }) => {
    await page.goto("/listings");

    const firstListing = page.locator('a[href^="/listings/"]').first();
    await expect(firstListing).toBeVisible();
    await firstListing.click();

    const thumbnails = page.getByRole("group", { name: /photos of/ });

    if ((await thumbnails.count()) === 0) {
      test.skip(
        true,
        "No visible listing has more than one photo; the demo seed ships without images."
      );
    }

    const second = thumbnails.getByRole("button", { name: /Show photo 2 / });
    await second.click();

    // `aria-current`, not `aria-pressed`: one photo is shown at a time, so these are a set with a
    // current item rather than a row of independent toggles.
    await expect(second).toHaveAttribute("aria-current", "true");

    /**
     * The swap is silent without this. An `alt` is read when the image is first encountered, so
     * changing it in place tells a screen reader user nothing.
     */
    await expect(page.getByText(/Showing photo 2 of /)).toBeAttached();
  });
});
