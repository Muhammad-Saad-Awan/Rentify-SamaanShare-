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

/** A message was written to a conversation the recipient is part of. */
export const CHAT_MESSAGE_EVENT = "chat-message";

/** A participant's read cursor moved. Clears badges in their other tabs, and is a read receipt. */
export const CHAT_READ_EVENT = "chat-read";

/**
 * A chat message, as the browser is told about it.
 *
 * THE DELIBERATE DEPARTURE from `NotificationEvent`, flagged in TODO.md when the transport landed. A
 * notification event is a nudge and the page refetches; a chat that refetched on every message would
 * cost a server render per line typed. So the open thread renders straight from this payload, and
 * the text goes through Pusher.
 *
 * WHAT STILL HOLDS from the notification rule:
 *   - It goes only to the two participants' own private channels, signed by `/api/realtime/auth`.
 *   - It carries no terms. An OFFER event has `offerId` and no amounts; the client fetches the offer.
 *     A SYSTEM body may restate terms in words, but nothing reads amounts from it.
 *   - The database stays the source of truth. A dropped event means the message appears on the next
 *     load, and `id` lets a duplicate be ignored.
 */
export interface ChatMessageEvent {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: string;
  body: string | null;
  offerId: string | null;
  /** The sender's own id for the message, so their tab can match its optimistic copy. */
  clientId: string | null;
  createdAt: string;
}

export interface ChatReadEvent {
  conversationId: string;
  readerId: string;
  readAt: string;
}

/**
 * What the browser is told.
 *
 * DELIBERATELY NOT THE NOTIFICATION. No body, no amounts, no counterparty name - an identifier, a
 * type, and just enough to raise a toast and deep-link it. Three reasons, in order of weight: a
 * third party sees less of our members' business; the client cannot drift from the database
 * because it has nothing to drift with; and a payload carrying state invites somebody to render
 * from it, at which point a dropped or duplicated event becomes a wrong badge rather than a
 * missed refresh.
 *
 * `title` is the one concession, and it buys the toast - the shortest user-facing sentence we
 * have, against a round trip made purely to render one line.
 *
 * DECLARED HERE, WITH THE CHANNEL NAMES, because this is the contract between the publisher and
 * the subscriber and both ends must read it from one place. It also keeps it out of `server.ts`,
 * which constructs a Pusher client and validates the environment on import - a pure mapping
 * should not drag either into a unit test.
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

/** The minimal wire form of what was just written. */
export function notificationEvents(
  created: readonly {
    id: string;
    userId: string;
    type: string;
    title: string;
    entityType: string | null;
    entityId: string | null;
    createdAt: Date;
  }[]
): { userId: string; event: NotificationEvent }[] {
  return created.map((notification) => ({
    userId: notification.userId,
    event: {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      entityType: notification.entityType,
      entityId: notification.entityId,
      createdAt: notification.createdAt.toISOString(),
    },
  }));
}

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

/** A chat message row, as far as the realtime payload needs it. */
export interface PublishableMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: string;
  body: string | null;
  offerId: string | null;
  clientId: string | null;
  createdAt: Date;
}

/** One pending chat delivery: an event name, a payload, and whose channel it goes to. */
export type ChatDelivery =
  | { userId: string; name: typeof CHAT_MESSAGE_EVENT; data: ChatMessageEvent }
  | { userId: string; name: typeof CHAT_READ_EVENT; data: ChatReadEvent };

/**
 * The deliveries for messages just written: each one to BOTH participants.
 *
 * The sender too, deliberately. Their other open tabs learn about the message the same way the
 * recipient does, and the tab that sent it recognises its own copy by `clientId`.
 */
export function chatMessageDeliveries(
  participants: { renterId: string; ownerId: string },
  messages: readonly PublishableMessage[]
): ChatDelivery[] {
  return messages.flatMap((message) =>
    [participants.renterId, participants.ownerId].map((userId) => ({
      userId,
      name: CHAT_MESSAGE_EVENT,
      data: {
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        kind: message.kind,
        body: message.body,
        offerId: message.offerId,
        clientId: message.clientId,
        createdAt: message.createdAt.toISOString(),
      },
    }))
  );
}

/** A read cursor moving, told to both participants - see `CHAT_READ_EVENT`. */
export function chatReadDeliveries(
  participants: { renterId: string; ownerId: string },
  read: { conversationId: string; readerId: string; readAt: Date }
): ChatDelivery[] {
  return [participants.renterId, participants.ownerId].map((userId) => ({
    userId,
    name: CHAT_READ_EVENT,
    data: {
      conversationId: read.conversationId,
      readerId: read.readerId,
      readAt: read.readAt.toISOString(),
    },
  }));
}
