import { expect, test } from "@playwright/test";

import { readAccount, STORAGE_STATE } from "./fixtures/account";

import type { BrowserContext, Page } from "@playwright/test";

/**
 * The critical path: register → book → pay → hand over → return → review.
 *
 * ONE TEST, NOT SIX. Every step depends on the state the previous one left behind, so splitting
 * them would either mean re-driving the whole journey per test or sharing mutable state between
 * tests that Playwright is free to reorder. A journey is one assertion about a sequence.
 *
 * TWO PEOPLE, TWO CONTEXTS. The owner and the renter are signed in simultaneously and hand the
 * booking back and forth - approve, pay, confirm, collect, return, review. A single context
 * signing in and out would not be the same test: the interleaving IS the thing being checked.
 *
 * WHAT IS NOT COVERED HERE, and why it is seeded instead:
 *
 *   Creating a listing through the form cannot run in this suite. `createListing` calls
 *   `verifyListingImages`, which asks Cloudinary's Admin API whether each public id really exists
 *   and refuses the submission otherwise - correctly, since it is the only thing stopping a client
 *   asserting its own image URLs. A listing therefore cannot be published without a real upload,
 *   and the check happens on the server, so a browser-side route stub cannot reach it either.
 *   Making it pass would mean either uploading to Cloudinary from the test suite or weakening that
 *   check, and the second is not on the table.
 *
 *   No stand-in test is kept for it either. The photo minimum is already asserted directly in
 *   `src/lib/validations/listing.test.ts`, and walking three steps of a stepper to re-assert a
 *   unit-tested rule would be testing the stepper. The gap is the publish itself, and it is named
 *   here rather than papered over.
 */

test.describe.configure({ mode: "serial" });

const account = readAccount();

/** The journey's dates, far enough out that no past-date or overlap rule interferes. */
const START_OFFSET_DAYS = 40;
const END_OFFSET_DAYS = 43;

function isoDate(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);

  return date.toISOString().slice(0, 10);
}

/**
 * Navigates and waits for the page to become INTERACTIVE, not merely present.
 *
 * WHY THIS IS NOT PARANOIA. Registration failed on two of the first five runs: the form stayed
 * filled, the URL stayed on `/register`, and no error was shown anywhere - the click had simply
 * gone nowhere. These are Base UI buttons inside a React-Hook-Form form, so before hydration the
 * submit handler does not exist yet and a click lands on a button that is not listening. Playwright
 * waits for an element to be actionable, which this element already was; what it cannot know is
 * whether React has caught up.
 *
 * `networkidle` is the available proxy for "the RSC payload has arrived and hydration has had its
 * turn". It is a heuristic, which is why it is confined to this helper with its reason attached
 * rather than sprinkled through the journey.
 */
async function gotoReady(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

/**
 * Opens the owner's request list fresh each time it is needed.
 *
 * The owner and renter act in turns, and a Server Component page does not know that the other
 * party changed something. Re-navigating is what a real owner does - they come back to the tab and
 * reload - and it is more honest than waiting for a revalidation the app never promised.
 */
async function ownerRequests(page: Page) {
  await gotoReady(page, "/dashboard/requests");
}

test("register, book, pay, hand over, return and review", async ({
  browser,
}) => {
  /**
   * Playwright's 30-second default is per TEST, and this one is a whole journey: two contexts,
   * eight round trips, and a production build that re-renders a Server Component page on each.
   * The first run died at the default having got somewhere past registration, which told us
   * nothing about the application and everything about the budget.
   */
  test.setTimeout(180_000);

  expect(account, "The setup project must run first").not.toBeNull();

  const ownerContext: BrowserContext = await browser.newContext({
    storageState: STORAGE_STATE,
  });
  const renterContext: BrowserContext = await browser.newContext();

  const owner = await ownerContext.newPage();
  const renter = await renterContext.newPage();

  try {
    // ---------------------------------------------------------------- 1. register
    await gotoReady(renter, "/register");

    await renter.getByLabel("Full name").fill("E2E Journey Renter");
    await renter.getByLabel("Email").fill(account?.journeyEmail ?? "");
    await renter
      .getByLabel("Password", { exact: true })
      .fill(account?.journeyPassword ?? "");
    await renter
      .getByLabel("Confirm password")
      .fill(account?.journeyPassword ?? "");

    await renter.getByRole("button", { name: "Create account" }).click();

    /**
     * Registration signs the new account straight in. Asserted on the destination rather than on a
     * toast, because the session is what every step after this depends on.
     *
     * The failure is caught and re-thrown WITH whatever the form is saying, because a bare
     * "expected /dashboard, got /register" sends the reader to a screenshot to find out why. The
     * form renders server-side refusals - a taken address, a rate limit - in a `role="alert"`, and
     * that text is the difference between a product bug and a test bug.
     */
    try {
      await expect(renter).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    } catch (error) {
      const alerts = await renter.locator('[role="alert"]').allTextContents();
      const fieldErrors = await renter
        .locator("[data-invalid] p, [aria-invalid='true'] ~ p")
        .allTextContents();

      throw new Error(
        `Registration did not sign the new account in.\n` +
          `  url:           ${renter.url()}\n` +
          `  form alerts:   ${JSON.stringify(alerts)}\n` +
          `  field errors:  ${JSON.stringify(fieldErrors)}\n` +
          `  original:      ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`
      );
    }

    // ---------------------------------------------------------------- 2. request to book
    await gotoReady(renter, `/listings/${account?.journeyListingId}`);

    await expect(
      renter.getByRole("heading", { name: "Request to book" })
    ).toBeVisible();

    await renter.getByLabel("From").fill(isoDate(START_OFFSET_DAYS));
    await renter.getByLabel("Until").fill(isoDate(END_OFFSET_DAYS));

    await renter.getByRole("button", { name: "Request to book" }).click();

    /**
     * The toast is the app's own confirmation, and it names the 48-hour window - so this asserts
     * the promise the renter was actually given, not merely that something happened.
     */
    await expect(
      renter.getByText(/Request sent\. The owner has 48 hours to respond\./)
    ).toBeVisible();

    // ---------------------------------------------------------------- 3. owner approves
    await ownerRequests(owner);

    const journeyRequest = owner
      .locator("li, article, div")
      .filter({ hasText: "E2E Journey Listing" })
      .last();

    await expect(journeyRequest).toBeVisible();

    await owner.getByRole("button", { name: "Approve" }).first().click();

    /**
     * Approval collects the pickup details in the same step, and the panel refuses to send without
     * them being at least considered - this is the ONLY channel to the renter until profiles carry
     * a verified phone, which is why Stage A1 put it here.
     */
    await owner
      .getByLabel("Where and when should the renter collect?")
      .fill("Flat 4, Bahria Town Phase 5, after 6pm. Call 0300 1234567.");

    await owner.getByRole("button", { name: "Approve and send" }).click();

    await expect(
      owner.getByText(/Request approved\. The renter can now arrange payment\./)
    ).toBeVisible();

    // ---------------------------------------------------------------- 4. renter chooses payment
    await gotoReady(renter, "/dashboard/bookings");

    await expect(
      renter.getByText("Flat 4, Bahria Town Phase 5", { exact: false })
    ).toBeVisible();

    await renter.getByRole("button", { name: "Pay by cash" }).click();

    await expect(
      renter.getByText(
        /Cash selected\. Pay the owner when you collect the item\./
      )
    ).toBeVisible();

    // ---------------------------------------------------------------- 5. owner confirms payment
    await ownerRequests(owner);

    await owner
      .getByRole("button", { name: "Confirm payment received" })
      .first()
      .click();

    await expect(owner.getByText(/Payment confirmed\./)).toBeVisible();

    // ---------------------------------------------------------------- 6. pickup handover
    await ownerRequests(owner);

    await owner
      .getByRole("button", { name: "Mark item as collected" })
      .first()
      .click();

    /**
     * The button opens the form rather than submitting, because `startBooking` refuses a payload
     * without a condition. Nothing is preselected on purpose - a default of "as expected" would be
     * answered by inertia and the record would then say what the form said.
     */
    const pickupCondition = owner.getByRole("radio", { name: "As expected" });
    await expect(pickupCondition).toBeVisible();
    await pickupCondition.check();

    await owner
      .getByRole("button", { name: "Mark item as collected" })
      .last()
      .click();

    await expect(
      owner.getByText(/Marked as collected\. The rental is now active\./)
    ).toBeVisible();

    // ---------------------------------------------------------------- 7. return handover
    await ownerRequests(owner);

    await owner
      .getByRole("button", { name: "Mark item as returned" })
      .first()
      .click();

    const returnCondition = owner.getByRole("radio", { name: "As expected" });
    await expect(returnCondition).toBeVisible();
    await returnCondition.check();

    await owner
      .getByRole("button", { name: "Mark item as returned" })
      .last()
      .click();

    await expect(
      owner.getByText(/Rental completed and those dates are free again\./)
    ).toBeVisible();

    // ---------------------------------------------------------------- 8. both review
    await ownerRequests(owner);
    await owner.getByRole("button", { name: "Leave a review" }).first().click();
    await owner.getByRole("radio", { name: "5 stars" }).click();
    await owner
      .getByLabel("Review comment")
      .fill("Collected and returned on time. Would rent to again.");
    await owner.getByRole("button", { name: "Post review" }).click();

    /**
     * ASSERTED, not assumed. The first review is deliberately withheld, and the app says so in
     * these exact words - so this confirms both that the write landed and that reciprocal release
     * is doing what it claims. Clicking and moving on lets a silent failure here surface three
     * steps later as a confusing absence, which is exactly how the first run of this test read.
     */
    await expect(
      owner.getByText(
        /Review saved\. It becomes public once the other person reviews too/
      )
    ).toBeVisible();

    await gotoReady(renter, "/dashboard/bookings");
    await renter
      .getByRole("button", { name: "Leave a review" })
      .first()
      .click();
    await renter.getByRole("radio", { name: "5 stars" }).click();
    await renter
      .getByLabel("Review comment")
      .fill("Item was exactly as described and pickup was easy.");
    await renter.getByRole("button", { name: "Post review" }).click();

    /** The second review releases the pair, and the wording changes to say exactly that. */
    await expect(
      renter.getByText(/Review posted\. Both reviews are now public\./)
    ).toBeVisible();

    /**
     * RECIPROCAL RELEASE is the thing worth asserting at the end. Neither review is visible until
     * both are in, so the second submission is what publishes the pair - and the public listing is
     * where a stranger would see them, which is the only audience that matters for a review.
     */
    await gotoReady(renter, `/listings/${account?.journeyListingId}`);

    await expect(
      renter.getByText("Item was exactly as described and pickup was easy.")
    ).toBeVisible();
  } finally {
    await ownerContext.close();
    await renterContext.close();
  }
});
