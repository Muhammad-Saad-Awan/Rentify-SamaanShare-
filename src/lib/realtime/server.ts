import Pusher from "pusher";

import { env } from "@/config/env";
import { NOTIFICATION_EVENT, userChannel } from "@/lib/realtime/channels";

import type { ChatDelivery, NotificationEvent } from "@/lib/realtime/channels";

/**
 * The server half of realtime delivery.
 *
 * WHAT THIS IS FOR, in one line: telling a browser that something changed, so it can go and ask
 * the database what. It never carries state. The `Notification` row is written inside the
 * transaction that caused it and remains the only source of truth; this layer exists so the other
 * party does not have to reload the page to find out.
 *
 * SO A FAILURE HERE IS NOT AN ERROR. If Pusher is down, unconfigured, or rejects the call, the
 * notification is still in Postgres and appears on the recipient's next page load. Every function
 * below therefore swallows its failures and reports them, and none of them can be made to fail an
 * action. Getting that backwards - letting a publish reject a booking transition - would make a
 * third-party outage into lost rentals.
 *
 * NOT MARKED `server-only`, and that is the codebase's existing decision rather than an oversight:
 * `config/env.ts` explains why the package is not a dependency and throws on `typeof window` in
 * its place. This module imports `env`, so it inherits that guard - a client component reaching
 * this file gets that message at runtime. It also keeps the module importable by a `verify:*`
 * script, which `server-only` would break, since that package throws in plain Node too.
 *
 * PUBLISHING IS AN HTTPS POST, which is what makes this work on Vercel at all. Nothing here holds
 * a socket; the persistent connections live in Pusher's infrastructure and in the browser.
 */

/**
 * One client per server instance, created on first use.
 *
 * `null` when unconfigured, which is a supported state rather than a failure - see
 * `isRealtimeEnabled`. Lazy so that importing this module never throws in an environment that has
 * no keys, including CI.
 */
let client: Pusher | null = null;

function getClient(): Pusher | null {
  /**
   * Destructured so the four checks below narrow the types.
   *
   * `isRealtimeEnabled()` answers the same question, but a boolean from another module tells
   * TypeScript nothing about these four fields - and the alternative is four non-null assertions
   * in the constructor, which is the same claim made where nothing verifies it.
   */
  const { PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER } = env;

  if (!PUSHER_APP_ID || !PUSHER_KEY || !PUSHER_SECRET || !PUSHER_CLUSTER) {
    return null;
  }

  client ??= new Pusher({
    appId: PUSHER_APP_ID,
    key: PUSHER_KEY,
    secret: PUSHER_SECRET,
    cluster: PUSHER_CLUSTER,
    // Pusher's SDK defaults this to false. There is no reason to send an app secret's signatures
    // over plaintext, and Vercel would not be the weak point if we did.
    useTLS: true,
  });

  return client;
}

/**
 * Sends one event to each recipient's own channel.
 *
 * BATCHED, one call per publish rather than one per notification. An event that notifies both
 * parties is two channels; `triggerBatch` sends them in a single request, which matters because
 * this runs inside a serverless invocation that is being kept alive for it.
 *
 * Returns whether the send happened, for logging and for the verify script. Callers do not branch
 * on it - there is nothing useful for them to do about a `false`, which is the point.
 */
export async function publishNotifications(
  events: readonly { userId: string; event: NotificationEvent }[]
): Promise<boolean> {
  if (events.length === 0) {
    return true;
  }

  const pusher = getClient();

  if (!pusher) {
    return false;
  }

  try {
    await pusher.triggerBatch(
      events.map(({ userId, event }) => ({
        channel: userChannel(userId),
        name: NOTIFICATION_EVENT,
        data: event,
      }))
    );

    return true;
  } catch (error) {
    /**
     * Logged and swallowed. The rows are already committed, so the worst case is that somebody
     * sees their notification on the next page load instead of immediately - which is exactly
     * how the product behaved before this layer existed.
     */
    console.error("Realtime publish failed", error);

    return false;
  }
}

/** Pusher's ceiling on events in one `triggerBatch` call. */
const BATCH_LIMIT = 10;

/**
 * Sends chat events to each recipient's own channel.
 *
 * The same contract as `publishNotifications`: the same per-member channels, so the same
 * authorization boundary; failures swallowed and logged, because the message is already committed
 * and will appear on the next load. Chunked, since one message goes to both participants and a
 * future fan-out should not trip the batch ceiling.
 */
export async function publishChatEvents(
  events: readonly ChatDelivery[]
): Promise<boolean> {
  if (events.length === 0) {
    return true;
  }

  const pusher = getClient();

  if (!pusher) {
    return false;
  }

  try {
    for (let start = 0; start < events.length; start += BATCH_LIMIT) {
      await pusher.triggerBatch(
        events
          .slice(start, start + BATCH_LIMIT)
          .map(({ userId, name, data }) => ({
            channel: userChannel(userId),
            name,
            data,
          }))
      );
    }

    return true;
  } catch (error) {
    console.error("Realtime chat publish failed", error);

    return false;
  }
}

/**
 * What the browser needs to subscribe, or `null` when realtime is off.
 *
 * READ ON THE SERVER AND PASSED AS PROPS, rather than exposed as `NEXT_PUBLIC_` variables. The
 * key is public in practice - it appears in every WebSocket handshake - so this is not secrecy;
 * it is the route `cloudName` already takes to the uploader, and it keeps two strings out of the
 * bundle on every public page that will never subscribe to anything.
 *
 * The channel is derived here from the session's user id. The browser is told which channel to
 * ask for; it is never believed about it - `/api/realtime/auth` derives it again and compares.
 */
export function realtimeClientConfig(
  userId: string
): { channel: string; pusherKey: string; cluster: string } | null {
  const { PUSHER_KEY, PUSHER_CLUSTER } = env;

  if (!getClient() || !PUSHER_KEY || !PUSHER_CLUSTER) {
    return null;
  }

  return {
    channel: userChannel(userId),
    pusherKey: PUSHER_KEY,
    cluster: PUSHER_CLUSTER,
  };
}

/**
 * Signs a subscription to a channel the caller has already been shown to own.
 *
 * TAKES A CHANNEL, NOT A USER, and that is the whole contract: by the time this is called the
 * decision has been made by `authorizeUserChannel` against the session. This function does no
 * checking, which is why it must never be exported to anywhere that has not done that first.
 *
 * Throws rather than returning null when unconfigured: reaching here without a client means the
 * route rendered a subscriber it should not have, and a silent empty response would show up as an
 * unexplained authorization failure in the browser instead.
 */
export function authorizeChannel(
  socketId: string,
  channel: string
): { auth: string } {
  const pusher = getClient();

  if (!pusher) {
    throw new Error("Realtime is not configured.");
  }

  return pusher.authorizeChannel(socketId, channel);
}
