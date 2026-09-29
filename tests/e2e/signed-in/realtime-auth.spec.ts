import { expect, test } from "@playwright/test";

import { readAccount } from "../fixtures/account";

/**
 * The realtime channel authorization endpoint.
 *
 * This is the boundary of the whole realtime layer: sign the wrong channel and one member
 * receives another's notifications. The decision itself is pure and unit-tested in
 * `channels.test.ts`; what only exists here is the endpoint around it - that a session is
 * genuinely required, and that a signed-in member asking for somebody else's channel is refused
 * by the real handler rather than only by the function it calls.
 *
 * Driven through the browser's own cookies rather than a fabricated header, so what is exercised
 * is the session the application actually issues.
 */

const AUTH_URL = "/api/realtime/auth";

/** The form encoding Pusher's client uses. Sending JSON would test a shape nothing sends. */
function body(channel: string, socketId = "123.456"): string {
  return new URLSearchParams({
    socket_id: socketId,
    channel_name: channel,
  }).toString();
}

const FORM = { "content-type": "application/x-www-form-urlencoded" };

test.describe("realtime channel authorization", () => {
  test("refuses a channel that belongs to somebody else", async ({
    page,
    request,
  }) => {
    // Any cuid-shaped id that is not this session's. The handler must not sign it.
    const response = await request.post(AUTH_URL, {
      headers: FORM,
      data: body("private-user-cmf1111111111111111111111"),
    });

    expect(response.status()).toBe(403);
    expect(await response.text()).not.toContain("auth");

    // And the page is unaffected - a refused subscription is not an error for the app.
    await page.goto("/dashboard");
    await expect(page).toHaveTitle(/.+/);
  });

  test("refuses a malformed request", async ({ request }) => {
    const missingSocket = await request.post(AUTH_URL, {
      headers: FORM,
      data: new URLSearchParams({ channel_name: "private-user-x" }).toString(),
    });

    expect(missingSocket.status()).toBe(400);

    const missingChannel = await request.post(AUTH_URL, {
      headers: FORM,
      data: new URLSearchParams({ socket_id: "123.456" }).toString(),
    });

    expect(missingChannel.status()).toBe(403);
  });

  /**
   * The success path.
   *
   * The channel is built from the fixture's own user id rather than scraped from the page, so
   * this asserts the endpoint on its own terms and does not wait on a subscriber existing.
   *
   * SKIPPED, NOT FAILED, without keys. An unconfigured install is a supported state - the app
   * falls back to page loads - and a suite that goes red on a missing optional integration
   * teaches people to ignore it. The refusals above still run either way, because they are
   * decided before Pusher is reached.
   */
  test("signs the member's own channel", async ({ request }) => {
    const account = readAccount();

    test.skip(account === null, "The setup project did not run.");

    const response = await request.post(AUTH_URL, {
      headers: FORM,
      data: body(`private-user-${account!.userId}`),
    });

    test.skip(
      response.status() === 503,
      "Realtime is not configured; PUSHER_* is unset."
    );

    expect(response.status()).toBe(200);

    const payload = (await response.json()) as { auth?: string };

    // Pusher's shape: "<app key>:<hmac>". The browser hands it straight back to Pusher.
    expect(payload.auth).toMatch(/^.+:[a-f0-9]{64}$/);
  });
});
