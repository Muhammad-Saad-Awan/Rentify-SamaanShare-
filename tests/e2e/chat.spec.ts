import { expect, test } from "@playwright/test";

import { readAccount } from "./fixtures/account";

import type { Browser, BrowserContext, Page } from "@playwright/test";

/**
 * Chat, end to end, across three browsers.
 *
 * WHAT IS PROVED HERE AND NOWHERE ELSE:
 *   1. A renter's first message reaches an owner who never reloads - the header badge and then the
 *      thread itself update from the realtime event.
 *   2. Negotiated terms travel only through an offer: the owner proposes, the renter accepts, and
 *      the booking made from it carries the offer's rent - not the listing's.
 *   3. A stranger asking for the conversation gets a real 404 status, not a 200 with a not-found
 *      page - checked with a request, because the browser renders the same page either way.
 *
 * Skipped without realtime, like the realtime test, and for the same reason: the first assertion is
 * about delivery, and there is nothing to deliver over.
 */

const account = readAccount();

/** The listing rate for three days is Rs. 1,500; the agreed rent is deliberately different. */
const AGREED_RENT = "1234";

function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

async function signedIn(
  browser: Browser,
  email: string,
  password: string
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

  return { context, page };
}

/** See `realtime-delivery.spec.ts`: no subscriber is a skip, a subscriber that will not connect is a failure. */
async function waitForRealtime(page: Page): Promise<boolean> {
  const marker = page.locator("[data-realtime-state]");

  if ((await marker.count()) === 0) {
    return false;
  }

  await expect(marker).toHaveAttribute("data-realtime-state", "connected", {
    timeout: 45_000,
  });

  return true;
}

test("message, negotiate, and book - and a stranger is refused", async ({
  browser,
}) => {
  test.setTimeout(180_000);

  expect(account, "The setup project must run first").not.toBeNull();

  const renter = await signedIn(
    browser,
    account?.chatRenterEmail ?? "",
    account?.chatRenterPassword ?? ""
  );
  const owner = await signedIn(
    browser,
    account?.chatOwnerEmail ?? "",
    account?.chatOwnerPassword ?? ""
  );
  const stranger = await signedIn(
    browser,
    account?.chatStrangerEmail ?? "",
    account?.chatStrangerPassword ?? ""
  );

  try {
    // The owner parks on the dashboard and is not navigated until the badge has changed.
    await owner.page.goto("/dashboard");
    await owner.page.waitForLoadState("networkidle");

    const connected = await waitForRealtime(owner.page);

    test.skip(!connected, "Realtime is not configured; nothing to observe.");

    await expect(
      owner.page.getByRole("link", { name: /messages, \d+ unread/i })
    ).toHaveCount(0);

    // ------------------------------------------------------------------ first contact
    await renter.page.goto(`/listings/${account?.chatListingId}`);
    await renter.page
      .getByRole("button", { name: "Message the owner" })
      .click();
    await expect(renter.page).toHaveURL(/\/dashboard\/messages\/[^/]+$/, {
      timeout: 15_000,
    });

    const threadPath = new URL(renter.page.url()).pathname;

    await renter.page
      .getByLabel(/^Message E2E Chat Owner/)
      .fill("Is the tent waterproof?");
    await renter.page.getByRole("button", { name: "Send message" }).click();
    await expect(
      renter.page.getByRole("log").getByText("Is the tent waterproof?")
    ).toBeVisible();

    // ----------------------------------------------------- the owner learns without reloading
    await expect(
      owner.page.getByRole("link", { name: /messages, 1 unread/i })
    ).toBeVisible({ timeout: 30_000 });

    await owner.page.goto(threadPath);
    await owner.page.waitForLoadState("networkidle");
    await waitForRealtime(owner.page);

    await expect(
      owner.page.getByRole("log").getByText("Is the tent waterproof?")
    ).toBeVisible();

    // A reply arrives in the renter's open thread without a reload.
    await owner.page
      .getByLabel(/^Message E2E Chat Renter/)
      .fill("Yes, fully. Pickup from Clifton.");
    await owner.page.getByRole("button", { name: "Send message" }).click();
    await expect(
      renter.page.getByRole("log").getByText("Yes, fully. Pickup from Clifton.")
    ).toBeVisible({ timeout: 30_000 });

    // ------------------------------------------------------------------ the offer
    await owner.page.getByRole("button", { name: "Propose terms" }).click();
    await owner.page.getByLabel("From").fill(isoDaysFromNow(40));
    await owner.page.getByLabel("Until").fill(isoDaysFromNow(42));
    await owner.page.getByLabel("Total rent (Rs.)").fill(AGREED_RENT);
    await owner.page.getByLabel("Security deposit (Rs.)").fill("2000");
    await owner.page.getByRole("button", { name: "Send offer" }).click();

    await expect(owner.page.getByText("Your offer")).toBeVisible({
      timeout: 15_000,
    });

    // The renter sees it arrive and accepts it.
    const offerCard = renter.page.getByText("E2E Chat Owner's offer");

    await expect(offerCard).toBeVisible({ timeout: 30_000 });
    await renter.page.getByRole("button", { name: "Accept" }).click();
    await expect(
      renter.page.getByRole("log").getByText(/^Offer accepted:/)
    ).toBeVisible({ timeout: 15_000 });

    // ------------------------------------------------------- booking on the agreed terms
    await renter.page
      .getByRole("button", { name: "Request booking at these terms" })
      .click();
    await expect(renter.page).toHaveURL(/\/dashboard\/bookings/, {
      timeout: 15_000,
    });

    const card = renter.page
      .locator("div")
      .filter({ hasText: "E2E Chat Listing" })
      .filter({ hasText: "Rs. 1,234" })
      .first();

    await expect(card).toBeVisible();

    // -------------------------------------------------------------- a stranger is refused
    const response = await stranger.page.request.get(threadPath, {
      maxRedirects: 0,
    });

    expect(response.status()).toBe(404);
  } finally {
    await renter.context.close();
    await owner.context.close();
    await stranger.context.close();
  }
});
