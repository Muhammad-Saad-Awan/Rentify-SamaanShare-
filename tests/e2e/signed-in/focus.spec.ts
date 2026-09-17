import { expect, test } from "@playwright/test";

import { readAccount } from "../fixtures/account";

import type { Locator } from "@playwright/test";

/**
 * The owner-side accessibility fixes, finally observed.
 *
 * Everything here was shipped on 15 September against reasoning alone. These controls all live
 * behind a sign-in, which is why the first Playwright pass could not reach them and why this file
 * needed the throwaway-account fixture before it could exist.
 */

const account = readAccount();

/**
 * Whether a control is on the page, waiting properly for it.
 *
 * `locator.count()` DOES NOT AUTO-WAIT. Used directly in a skip guard it asks "is this here right
 * now", which under a loaded machine is answered "no" for a control that appears a moment later -
 * and the test then skips itself and reports green. That happened: the approve-panel test passed
 * on one run and skipped on the next with nothing changed but timing, which is worse than a
 * failure because nobody investigates a skip.
 *
 * So the wait is explicit, and only a real timeout counts as absent.
 */
async function isPresent(locator: Locator): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: "visible", timeout: 10_000 });

    return true;
  } catch {
    return false;
  }
}

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

    if (!(await isPresent(pastDay))) {
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

    if (!(await isPresent(booked))) {
      test.skip(
        true,
        "The test listing has no booking holding a date - dates are held on approval, and the fixture's request is still pending."
      );
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

/**
 * The image uploader, reached through the EDIT form rather than the create form.
 *
 * `/listings/new` is five steps with Photos at step four - an earlier version of this file assumed
 * otherwise and failed looking for a control three clicks away. The edit form renders the same
 * component with the listing's photos already loaded, which is the state the delete and reorder
 * behaviour only exists in, and it is one navigation away.
 *
 * The photos come from seeded rows, not uploads. See `fixtures/db.ts` for why this suite does not
 * talk to Cloudinary.
 */
test.describe("image uploader", () => {
  test("the first photo's reorder arrow stays focusable at the edge", async ({
    page,
  }) => {
    await page.goto(`/dashboard/listings/${account?.listingId}/edit`);

    const moveEarlier = page.getByRole("button", {
      name: "Move photo 1 earlier",
    });

    await expect(moveEarlier).toBeVisible();
    await expect(moveEarlier).toHaveAttribute("aria-disabled", "true");

    /**
     * The bug this guards: moving a photo to the front disables the very button just pressed, and
     * a `disabled` element cannot hold focus - so focus was dropped to `<body>` at the exact
     * moment the action succeeded.
     */
    const hasDisabledAttribute = await moveEarlier.evaluate((element) =>
      element.hasAttribute("disabled")
    );
    expect(hasDisabledAttribute).toBe(false);

    await moveEarlier.focus();
    await expect(moveEarlier).toBeFocused();
  });

  test("removing a photo hands focus to its neighbour", async ({ page }) => {
    await page.goto(`/dashboard/listings/${account?.listingId}/edit`);

    const firstRemove = page.getByRole("button", { name: "Remove photo 1" });
    await expect(firstRemove).toBeVisible();

    await firstRemove.click();

    /**
     * The photo that was second slides into first place, and focus should land on ITS remove
     * button - the same accessible name, now a different element. Without the handoff the `<li>`
     * holding the pressed button is unmounted and focus falls to `<body>`, sending a keyboard user
     * back to the top of the page on every deletion.
     */
    await expect(
      page.getByRole("button", { name: "Remove photo 1" })
    ).toBeFocused();
  });

  test("announces how many photos are attached", async ({ page }) => {
    await page.goto(`/dashboard/listings/${account?.listingId}/edit`);

    /**
     * A label is not a live region: it names the input, and changing its text tells a waiting
     * screen reader user nothing. This is the separate polite region, kept outside the `<label>`
     * so it cannot be folded into the input's accessible name and read twice.
     */
    const status = page.locator('p[aria-live="polite"]', {
      hasText: /photos added/,
    });

    await expect(status).toHaveText(/2 of 10 photos added/);
  });
});

/**
 * The focus handoff itself - `useFocusReturn`, the part that stayed unverified longest.
 *
 * These panels REPLACE their trigger rather than appearing beside it, which is what makes the
 * usual pattern useless: by the time the panel closes, the node `document.activeElement` pointed
 * at is gone and the trigger has come back as a new one. Nothing short of a browser can say
 * whether the handoff actually lands.
 */
test.describe("booking panel focus handoff", () => {
  test("opening the decline panel moves focus into it, and cancelling gives it back", async ({
    page,
  }) => {
    await page.goto("/dashboard/requests");

    const decline = page.getByRole("button", { name: "Decline" }).first();

    if (!(await isPresent(decline))) {
      test.skip(true, "No pending request on the test listing.");
    }

    await expect(decline).toBeVisible();
    await decline.click();

    /**
     * The panel stands where the button was. Focus has to move into it, or the person who opened
     * it is left focused on an element that no longer exists.
     */
    await expect(page.getByLabel("Why are you declining?")).toBeFocused();

    // Backing out, not declining: dismissal is the path that returns focus.
    await page.getByRole("button", { name: "Keep it" }).click();

    /**
     * THE ASSERTION THIS WHOLE MECHANISM EXISTS FOR. The trigger was unmounted and remounted, so
     * this is a different DOM node from the one clicked - which is exactly why stashing
     * `document.activeElement` could never have worked, and why `useFocusReturn` claims focus
     * through a callback ref when the element comes back instead.
     */
    await expect(
      page.getByRole("button", { name: "Decline" }).first()
    ).toBeFocused();
  });

  test("the approve panel does the same", async ({ page }) => {
    await page.goto("/dashboard/requests");

    const approve = page.getByRole("button", { name: "Approve" }).first();

    if (!(await isPresent(approve))) {
      test.skip(true, "No pending request on the test listing.");
    }

    await approve.click();

    await expect(
      page.getByLabel("Where and when should the renter collect?")
    ).toBeFocused();

    await page.getByRole("button", { name: "Back" }).click();

    await expect(
      page.getByRole("button", { name: "Approve" }).first()
    ).toBeFocused();
  });
});
