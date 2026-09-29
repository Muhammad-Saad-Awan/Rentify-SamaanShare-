/**
 * Channel naming and the authorization decision.
 *
 * Pure, and separate from `server.ts` for one reason: this is the security boundary of the whole
 * realtime layer, and a boundary that can only be exercised through a Pusher SDK and an HTTP
 * request is a boundary nobody writes the awkward tests for. Everything here is a string in and a
 * verdict out.
 *
 * THE RULE, stated once: the channel a client asks for is never trusted. It is compared against a
 * channel derived from the session, and the comparison is the authorization. Nothing reads a user
 * id out of the request body, and there is no code path where a caller's claim about who they are
 * reaches Pusher.
 */

/**
 * Pusher's prefix for channels that require server-signed authorization.
 *
 * Not decoration. Pusher itself refuses a subscription to any `private-` channel without a valid
 * signature from our secret, so the prefix is what makes the whole scheme work - a channel named
 * `user-abc` would be world-readable to anybody who guessed it.
 */
const PRIVATE_PREFIX = "private-";

const USER_CHANNEL_PREFIX = `${PRIVATE_PREFIX}user-`;

/** The one channel a given member may subscribe to. */
export function userChannel(userId: string): string {
  return `${USER_CHANNEL_PREFIX}${userId}`;
}

/** Event names, kept here so the publisher and the subscriber cannot drift apart. */
export const NOTIFICATION_EVENT = "notification";

export type ChannelAuthorization =
  { ok: true; channel: string } | { ok: false; reason: string };

/**
 * Whether this session may subscribe to this channel.
 *
 * DERIVES THE ANSWER, RATHER THAN CHECKING THE REQUEST. It builds the channel the session is
 * entitled to and compares; it never parses a user id out of the requested name. The difference
 * matters: parsing invites a comparison that a prefix trick can slip past - `private-user-abc`
 * against `private-user-abcd`, or a name with a separator in it - while an equality test on a
 * string we constructed has nowhere for that to hide.
 *
 * ONE REFUSAL FOR EVERY FAILURE. A caller learns that they may not have this channel, never
 * whether it exists or belongs to somebody real - the same reasoning as the shared not-found
 * message in the payment actions.
 */
export function authorizeUserChannel({
  sessionUserId,
  requestedChannel,
}: {
  sessionUserId: string;
  requestedChannel: unknown;
}): ChannelAuthorization {
  if (typeof requestedChannel !== "string" || requestedChannel.length === 0) {
    return { ok: false, reason: "No channel was requested." };
  }

  const allowed = userChannel(sessionUserId);

  if (requestedChannel !== allowed) {
    return { ok: false, reason: "That channel is not yours." };
  }

  return { ok: true, channel: allowed };
}
