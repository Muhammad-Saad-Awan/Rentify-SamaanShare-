import { describe, expect, it } from "vitest";

import {
  authorizeUserChannel,
  CHAT_MESSAGE_EVENT,
  CHAT_READ_EVENT,
  chatMessageDeliveries,
  chatReadDeliveries,
  NOTIFICATION_EVENT,
  userChannel,
} from "@/lib/realtime/channels";

/**
 * The authorization boundary of the realtime layer.
 *
 * Everything else in `lib/realtime` is delivery; this decides who may listen. If it says yes to
 * the wrong channel, one member receives another's notifications and nothing downstream notices -
 * so the awkward cases are written out here rather than left to a browser to discover.
 */

const USER = "cmf0000000000000000000000";
const OTHER = "cmf1111111111111111111111";

describe("userChannel", () => {
  /** The `private-` prefix is what makes Pusher demand a signature at all. */
  it("is a private channel", () => {
    expect(userChannel(USER)).toBe(`private-user-${USER}`);
    expect(userChannel(USER).startsWith("private-")).toBe(true);
  });

  it("gives two members different channels", () => {
    expect(userChannel(USER)).not.toBe(userChannel(OTHER));
  });
});

describe("authorizeUserChannel", () => {
  it("allows a member their own channel", () => {
    const result = authorizeUserChannel({
      sessionUserId: USER,
      requestedChannel: userChannel(USER),
    });

    expect(result).toEqual({ ok: true, channel: `private-user-${USER}` });
  });

  it("refuses somebody else's channel", () => {
    const result = authorizeUserChannel({
      sessionUserId: USER,
      requestedChannel: userChannel(OTHER),
    });

    expect(result.ok).toBe(false);
  });

  /**
   * The case a parsing implementation gets wrong.
   *
   * Reading the id out of the requested name and comparing prefixes lets `...000` match `...0001`
   * or anything else that starts the same way. Building the allowed name and testing equality has
   * nowhere for that to hide, and these assert it stays that way.
   */
  it("refuses a channel whose name merely starts with the member's", () => {
    for (const suffix of ["x", "-extra", "0", "/../admin"]) {
      expect(
        authorizeUserChannel({
          sessionUserId: USER,
          requestedChannel: `${userChannel(USER)}${suffix}`,
        }).ok
      ).toBe(false);
    }
  });

  it("refuses a channel the member's name is merely a suffix of", () => {
    expect(
      authorizeUserChannel({
        sessionUserId: USER,
        requestedChannel: `private-user-prefix${USER}`,
      }).ok
    ).toBe(false);
  });

  /** A public channel with the right id is still not the channel we signed up to protect. */
  it("refuses the same id without the private prefix", () => {
    expect(
      authorizeUserChannel({
        sessionUserId: USER,
        requestedChannel: `user-${USER}`,
      }).ok
    ).toBe(false);
  });

  it("refuses presence and other channel families", () => {
    for (const channel of [
      `presence-user-${USER}`,
      "private-admin",
      "private-",
      "",
    ]) {
      expect(
        authorizeUserChannel({ sessionUserId: USER, requestedChannel: channel })
          .ok
      ).toBe(false);
    }
  });

  /** The body is untrusted input, so a non-string must be a refusal and not a crash. */
  it("refuses anything that is not a string", () => {
    for (const channel of [undefined, null, 42, {}, [], new FormData()]) {
      expect(
        authorizeUserChannel({ sessionUserId: USER, requestedChannel: channel })
          .ok
      ).toBe(false);
    }
  });
});

describe("the event name", () => {
  /** Shared so the publisher and subscriber cannot drift; asserted so neither renames it alone. */
  it("is stable", () => {
    expect(NOTIFICATION_EVENT).toBe("notification");
  });
});

describe("chat deliveries", () => {
  const participants = { renterId: USER, ownerId: OTHER };
  const message = {
    id: "m1",
    conversationId: "c1",
    senderId: USER,
    kind: "OFFER",
    body: null,
    offerId: "o1",
    clientId: null,
    createdAt: new Date("2026-10-06T10:00:00.000Z"),
  };

  it("sends a message to both participants and nobody else", () => {
    const deliveries = chatMessageDeliveries(participants, [message]);

    expect(deliveries.map((d) => d.userId).sort()).toEqual(
      [USER, OTHER].sort()
    );
    expect(deliveries.every((d) => d.name === CHAT_MESSAGE_EVENT)).toBe(true);
  });

  it("carries an offer by reference, never its amounts", () => {
    const [delivery] = chatMessageDeliveries(participants, [message]);

    expect(delivery?.data).toEqual({
      id: "m1",
      conversationId: "c1",
      senderId: USER,
      kind: "OFFER",
      body: null,
      offerId: "o1",
      clientId: null,
      createdAt: "2026-10-06T10:00:00.000Z",
    });
  });

  it("tells both participants when a cursor moves", () => {
    const deliveries = chatReadDeliveries(participants, {
      conversationId: "c1",
      readerId: OTHER,
      readAt: new Date("2026-10-06T10:00:00.000Z"),
    });

    expect(deliveries).toHaveLength(2);
    expect(deliveries.every((d) => d.name === CHAT_READ_EVENT)).toBe(true);
  });
});
