// ============================================================================
// SamaanShare - Realtime delivery checks
// ============================================================================
// Phase 2 adds a publisher and a channel authorizer. The authorization DECISION is
// pure and unit-tested; what is left is everything that only exists against the real
// Pusher app:
//
//   THE CREDENTIALS  - that the four values in .env.local are a working set. Three
//                      correct ones and a stale secret produce a signature Pusher
//                      rejects at subscribe time, in a browser, with no useful
//                      message. Here it is an HTTP status.
//   THE CLUSTER      - a wrong cluster is not an error, it is a different app that
//                      happens to accept the call and delivers to nobody. Checked by
//                      reading the channel back from the Admin API.
//   THE SIGNATURE    - that `authorizeChannel` produces the shape pusher-js expects,
//                      keyed to the socket id, and that two sockets do not share one.
//   DEGRADATION      - that an unconfigured install publishes nothing and reports it,
//                      rather than throwing into a booking transaction.
//
// Exercises the modules directly rather than the HTTP route: the route needs a session
// and the Next runtime, and it is covered by a signed-in Playwright test instead.
//
// Publishes to a throwaway channel for a user id that does not exist. Nothing is
// written to the database and nothing is left behind at Pusher - a channel with no
// subscribers is not a resource, it is a routing key.
//
//   npm run verify:realtime
// ============================================================================

import dotenv from "dotenv";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

let failures = 0;

function check(label: string, passed: boolean, detail?: string): void {
  if (passed) {
    console.log(`  ok    ${label}`);

    return;
  }

  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ""}`);
}

async function main(): Promise<void> {
  /**
   * Imported after dotenv, not at the top.
   *
   * `config/env.ts` validates and freezes `process.env` the moment it is first imported, so a
   * static import here would run before the file is loaded and see no keys at all.
   */
  const { isRealtimeEnabled } = await import("../src/config/env");
  const { authorizeUserChannel, NOTIFICATION_EVENT, userChannel } =
    await import("../src/lib/realtime/channels");
  const { authorizeChannel, publishNotifications } =
    await import("../src/lib/realtime/server");

  console.log("\nConfiguration");

  if (!isRealtimeEnabled()) {
    /**
     * Not a failure. An unconfigured install is a supported state, and this script is the one
     * place that can tell the difference between "no keys" and "wrong keys" - so it says which.
     */
    console.log(
      "  --    PUSHER_* not set. Nothing to verify; realtime is off and the app falls back to page loads."
    );
    console.log("\nSkipped: realtime is not configured.");

    return;
  }

  check("all four PUSHER_* values are present", true);

  const stamp = Date.now();
  const fakeUserId = `verify-realtime-${stamp}`;
  const channel = userChannel(fakeUserId);

  // ------------------------------------------------------------ the signature
  console.log("\nChannel authorization");

  const first = authorizeChannel("123.456", channel);

  check(
    "a signature is produced in the shape pusher-js expects",
    typeof first.auth === "string" && first.auth.includes(":"),
    first.auth
  );

  check(
    "the signature is prefixed with the app key, so the browser can be told which app signed it",
    first.auth.startsWith(`${process.env.PUSHER_KEY}:`)
  );

  const sameSocket = authorizeChannel("123.456", channel);

  check(
    "the same socket and channel sign identically",
    first.auth === sameSocket.auth
  );

  /**
   * The socket id is part of what is signed, which is what stops a signature being lifted from
   * one browser and replayed by another. If these ever matched, the authorization would be
   * transferable and the private channel would not be private.
   */
  const otherSocket = authorizeChannel("999.888", channel);

  check(
    "a different socket gets a different signature",
    first.auth !== otherSocket.auth
  );

  const otherChannel = authorizeChannel("123.456", userChannel("someone-else"));

  check(
    "a different channel gets a different signature",
    first.auth !== otherChannel.auth
  );

  // ------------------------------------------------------------ the decision
  console.log("\nThe decision the route makes");

  check(
    "a member's own channel is allowed",
    authorizeUserChannel({
      sessionUserId: fakeUserId,
      requestedChannel: channel,
    }).ok
  );

  check(
    "another member's channel is refused",
    !authorizeUserChannel({
      sessionUserId: fakeUserId,
      requestedChannel: userChannel("someone-else"),
    }).ok
  );

  // ------------------------------------------------------------ a real publish
  console.log("\nPublishing");

  const published = await publishNotifications([
    {
      userId: fakeUserId,
      event: {
        id: `verify-${stamp}`,
        type: "BOOKING_SETTLED",
        title: "Verification event - no subscribers",
        entityType: "booking",
        entityId: `verify-${stamp}`,
        createdAt: new Date().toISOString(),
      },
    },
  ]);

  check(
    "Pusher accepted a real publish, so the credentials and cluster are a working set",
    published,
    "check PUSHER_SECRET and PUSHER_CLUSTER - a wrong cluster is a different app"
  );

  check("nothing to publish is not a failure", await publishNotifications([]));

  /**
   * THE CLUSTER, CONFIRMED FROM THE OTHER SIDE.
   *
   * A publish returning 200 only proves some app accepted it. Reading the app's own channel list
   * back over the Admin API proves it was OUR app, in the cluster we think we are on - the one
   * mistake that otherwise looks exactly like success and delivers to nobody. The channel is
   * absent from the listing because it has no subscribers, which is expected; what is asserted is
   * that the call authenticates at all.
   */
  const { default: Pusher } = await import("pusher");

  const admin = new Pusher({
    appId: process.env.PUSHER_APP_ID!,
    key: process.env.PUSHER_KEY!,
    secret: process.env.PUSHER_SECRET!,
    cluster: process.env.PUSHER_CLUSTER!,
    useTLS: true,
  });

  let adminReachable = false;

  try {
    const response = await admin.get({ path: "/channels" });

    adminReachable = response.status === 200;
  } catch (error) {
    console.log(`        ${(error as Error).message}`);
  }

  check(
    "the Admin API authenticates, so the app id and cluster agree with the secret",
    adminReachable
  );

  check(
    "the event name is the one the subscriber listens for",
    NOTIFICATION_EVENT === "notification"
  );

  console.log(
    failures === 0
      ? "\nAll realtime checks passed."
      : `\n${failures} check(s) FAILED.`
  );

  process.exitCode = failures === 0 ? 0 : 1;
}

// No top-level await: the package is CommonJS under tsx.
main().catch((error: unknown) => {
  console.error("Verification failed:", error);
  process.exitCode = 1;
});
