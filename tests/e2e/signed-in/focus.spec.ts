import { expect, test } from "@playwright/test";

import { readAccount } from "../fixtures/account";

/**
 * The owner-side accessibility fixes, finally observed.
 *
 * Everything here was shipped on 15 September against reasoning alone. These controls all live
 * behind a sign-in, which is why the first Playwright pass could not reach them and why this file
 * needed the throwaway-account fixture before it could exist.
 */

const account = readAccount();

test.beforeEach(() => {
  /**
   * A missing fixture means the setup project did not run, which would otherwise show up as a
   * confusing 404 on a route built from `undefined`.
   */
  expect(
    account,
    "No test account found. The `setup` project must run first."
  ).not.toBeNull();
});

test.describe("availability calendar", () => {
  test("a past day stays reachable and says why it is unavailable", async ({
    page,
  }) => {
    await page.goto(`/dashboard/listings/${account?.listingId}/availability`);

    /**
     * Found by its label rather than its position, because which cells are in the past depends on
     * the day the suite runs. On the 1st of a month there may be none at all, which is a calendar
     * fact rather than a failure.
     */
    const pastDay = page
      .getByRole("button", { name: /, in the past$/ })
      .first();

    if ((await pastDay.count()) === 0) {
      test.skip(true, "No past days in the current month view.");
    }

    await expect(pastDay).toBeVisible();

    // Announced as unavailable...
    await expect(pastDay).toHaveAttribute("aria-disabled", "true");

    /**
     * ...while keeping its place in the tab order. This is the assertion the whole change was for:
     * that label is the only place the calendar explains *why* a day cannot be toggled, and
     * `disabled` would have put it permanently out of a keyboard user's reach.
     */
    const hasDisabledAttribute = await pastDay.evaluate((element) =>
      element.hasAttribute("disabled")
    );
    expect(hasDisabledAttribute).toBe(false);

    await pastDay.focus();
    await expect(pastDay).toBeFocused();
  });

  test("a booked day is reachable too", async ({ page }) => {
    await page.goto(`/dashboard/listings/${account?.listingId}/availability`);

    const booked = page.getByRole("button", { name: /- Booked/ }).first();

    if ((await booked.count()) === 0) {
      test.skip(true, "The test listing has no bookings holding a date.");
    }

    await expect(booked).toHaveAttribute("aria-disabled", "true");
    await booked.focus();
    await expect(booked).toBeFocused();
  });

  test("weekday headers are announced unabbreviated", async ({ page }) => {
    await page.goto(`/dashboard/listings/${account?.listingId}/availability`);

    /**
     * A column header is read out for every cell beneath it, so across a month this is heard
     * thirty-odd times. Both spans rendered "Mon" until 15 September, under a comment promising
     * otherwise - the visible one is `aria-hidden`, so the accessible name is the `sr-only` half
     * alone, and this assertion fails if they are ever allowed to drift back together.
     */
    await expect(
      page.getByRole("columnheader", { name: "Monday", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Wednesday", exact: true })
    ).toBeVisible();
  });
});

test.describe("image uploader", () => {
  /**
   * NOT REACHED YET, and the first version of this file was wrong about why.
   *
   * It assumed the uploader was on `/listings/new`. It is not: that route is a five-step form and
   * Photos is step four, so both tests failed looking for a control three "Next" clicks away.
   * That was the test being wrong, not the component - worth recording, because the same mistaken
   * assumption is easy to make again.
   *
   * Walking those steps belongs with the critical-path work rather than here, and the fixes that
   * most need watching - focus moving to a neighbouring photo on delete, the reorder arrows
   * staying focusable at either end - need photos that have actually been uploaded, which means
   * deciding whether this suite may reach Cloudinary. That is a real decision and not one to make
   * by writing a test that quietly does it.
   */
  test.fixme("announces how many photos are attached, and the drop zone is operable", async ({
    page,
  }) => {
    await page.goto("/listings/new");

    // Step four of five. Reaching it means filling Basics, Pricing and Location first.
    const status = page.locator('p[aria-live="polite"]', {
      hasText: /photos added/,
    });

    await expect(status).toHaveText(/0 of 10 photos added/);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.focus();
    await expect(fileInput).toBeFocused();
  });
});
