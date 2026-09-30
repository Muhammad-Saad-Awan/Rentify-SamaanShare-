import { expect, test } from "@playwright/test";

import { readAccount } from "./fixtures/account";

import type { BrowserContext, Page } from "@playwright/test";

/**
 * One browser sees another browser's action, without a reload.
 *
 * THIS IS THE TEST THE WHOLE REALTIME LAYER EXISTS TO PASS. Every other piece has been verified
 * on its own: the publisher reaches Pusher, the endpoint signs only the right channel, the
 * payload carries no more than it should. None of that is evidence that a renter sitting on
 * their bookings page learns that the owner approved. Until something watches that happen, the
 * feature is an inference drawn from parts.
 *
 * NOTHING HERE RELOADS, and that is the assertion. The renter's page is opened once and never
 * navigated again - no `goto`, no `reload`, no `router.refresh()` the test triggers itself. If
 * the badge changes, it changed because a message arrived and the subscriber went back to the
 * database for the truth.
 *
 * SKIPPED, NOT FAILED, WITHOUT KEYS. Realtime is an optional integration - absent, notifications
 * are written and seen on the next page load - and a suite that goes red on a missing optional
 * integration teaches people to ignore it. The skip is on the connection state the subscriber
 * publishes, so it also covers a misconfigured app rather than only an unconfigured one.
 */

const account = readAccount();

/** Signs in through the real form, because the session is what the subscription rests on. */
async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

/**
 * Waits for the socket, and reports honestly when there is none.
 *
 * The subscriber renders its connection state into a hidden element for exactly this. A test
 * that acts before the other browser has subscribed proves nothing and fails on timing, which is
 * the worst of both - so the wait is explicit and its absence is a skip rather than a guess.
 */
async function waitForRealtime(page: Page): Promise<boolean> {
  const marker = page.locator("[data-realtime-state]");

  /**
   * NO SUBSCRIBER AT ALL means realtime is unconfigured, which is the only legitimate skip.
   *
   * The distinction is the whole point of this helper. An earlier version caught the timeout too
   * and skipped on either - so when the socket failed to connect under parallel load, the test
   * reported a skip instead of a failure and stopped protecting anything. That is worse than
   * failing, because nobody investigates a skip.
   */
  if ((await marker.count()) === 0) {
    return false;
  }

  /**
   * Rendered but not connecting is a FAILURE, and this is left to throw.
   *
   * Forty-five seconds rather than twenty: the whole suite runs in parallel and every signed-in
   * page in it now opens a socket of its own, so first connection under load is measurably
   * slower than it is alone. Long enough that only a real problem reaches it.
   */
  await expect(marker).toHaveAttribute("data-realtime-state", "connected", {
    timeout: 45_000,
  });

  return true;
}

test("a renter sees the owner's approval arrive, without reloading", async ({
  browser,
}) => {
  test.setTimeout(120_000);

  expect(account, "The setup project must run first").not.toBeNull();

  const renterContext: BrowserContext = await browser.newContext();
  const ownerContext: BrowserContext = await browser.newContext();

  const renter = await renterContext.newPage();
  const owner = await ownerContext.newPage();

  try {
    await signIn(
      renter,
      account?.realtimeRenterEmail ?? "",
      account?.realtimeRenterPassword ?? ""
    );

    /**
     * The renter parks on their bookings page and does not touch it again.
     *
     * `networkidle` so the subscriber's dynamic import has landed - it is fetched after the page
     * is interactive, on purpose, and a test that raced it would be measuring the import.
     */
    await renter.goto("/dashboard/bookings");
    await renter.waitForLoadState("networkidle");

    const connected = await waitForRealtime(renter);

    test.skip(!connected, "Realtime is not configured; nothing to observe.");

    /** The request is pending, and the renter's own page says so before anything happens. */
    await expect(renter.getByText("E2E Realtime Listing")).toBeVisible();

    const bell = renter.getByRole("button", { name: /notifications/i }).first();

    await expect(bell).toBeVisible();

    /**
     * NOTHING IS UNREAD YET, asserted through the accessible name rather than an attribute.
     *
     * The count is an `sr-only` span inside the trigger, not an `aria-label` - the first version
     * of this test read the attribute, got null, and could never have passed however well the
     * feature worked. Matching on the role's computed name asks the same question the screen
     * reader does, and cannot drift from however the badge is marked up next.
     */
    await expect(renter.getByRole("button", { name: /unread/i })).toHaveCount(
      0
    );

    // ---------------------------------------------------------------- the other browser acts
    await signIn(
      owner,
      account?.realtimeOwnerEmail ?? "",
      account?.realtimeOwnerPassword ?? ""
    );

    await owner.goto("/dashboard/requests");
    await owner.waitForLoadState("networkidle");

    /**
     * Approving is two clicks, not one: the button opens a panel offering to send pickup details
     * with the approval. The realtime test takes the shortcut the panel provides, because what
     * is being measured is delivery, not the instructions form.
     */
    await owner
      .getByRole("button", { name: "Approve", exact: true })
      .first()
      .click();

    await owner
      .getByRole("button", { name: "Approve without details" })
      .click();

    /**
     * The owner's own view confirms the action landed, so a failure below is about delivery
     * rather than about the approval. Asserted on the status the server re-rendered, not on the
     * toast - the journey already paid for that lesson.
     */
    await expect(owner.getByText("Approved").first()).toBeVisible({
      timeout: 15_000,
    });

    // ---------------------------------------------------------------- the first browser learns
    /**
     * THE ASSERTION. The renter's page has not been navigated or reloaded since it was opened,
     * so the only way this badge can change is the event → `router.refresh()` → Server Component
     * → Postgres path this whole layer is.
     *
     * On the badge rather than on the toast: sonner dismisses itself on a timer, and the journey
     * already taught us what asserting a disappearing element costs. The badge is rendered by the
     * server from the database, which is the thing that has to be right.
     */
    await expect(renter.getByRole("button", { name: /1 unread/i })).toBeVisible(
      { timeout: 30_000 }
    );

    /**
     * And the notification itself, still without a reload - the panel is server-rendered too, so
     * its contents arriving proves the refresh reached further than the count.
     */
    await bell.click();

    await expect(renter.getByText(/was approved/i).first()).toBeVisible();

    /** The status moved on the card as well: one event, every surface. */
    await expect(renter.getByText("Approved").first()).toBeVisible();
  } finally {
    await renterContext.close();
    await ownerContext.close();
  }
});
