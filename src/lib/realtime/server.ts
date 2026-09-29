import Pusher from "pusher";

import { env } from "@/config/env";
import { NOTIFICATION_EVENT, userChannel } from "@/lib/realtime/channels";

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
 * What the browser is told.
 *
 * DELIBERATELY NOT THE NOTIFICATION. No body, no amounts, no counterparty name - the payload is
 * an identifier, a type, and just enough to raise a toast and deep-link it. Three reasons, in
 * order of weight: a third party sees less of our members' business; the client cannot drift from
 * the database because it has nothing to drift with; and a payload that carries state invites
 * somebody to start rendering from it, at which point a dropped or duplicated event becomes a
 * wrong badge rather than a missed refresh.
 *
 * `title` is the one concession, and it buys the toast. It is already the shortest user-facing
 * sentence we have and it saves a round trip purely to render one line.
 */
export interface NotificationEvent {
  /** The row's id. The subscriber deduplicates on this. */
  id: string;
  type: string;
  title: string;
  /** Where the notification points, so a toast can link without a fetch. */
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
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
