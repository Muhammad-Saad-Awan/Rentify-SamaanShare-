import { describe, expect, it } from "vitest";

import { UserStatus } from "@/generated/prisma/enums";
import {
  canReadConversation,
  canStartConversation,
  canWriteToConversation,
  CONVERSATION_CLOSED_ERROR,
  CONVERSATION_NOT_FOUND_ERROR,
  counterpartyId,
  lastReadAtFor,
  participantRole,
  readCursorField,
  unreadMessagesWhere,
} from "@/lib/chat/rules";

/**
 * Chat participation.
 *
 * The load-bearing assertions are that a third party is refused with the same message whatever the
 * reason, that a thread with an inactive counterparty is read-only but still readable, and that the
 * unread count includes SYSTEM messages.
 */

const conversation = { renterId: "renter", ownerId: "owner" };
const active = { status: UserStatus.ACTIVE, deletedAt: null };

describe("participantRole", () => {
  it("identifies each side and refuses a stranger", () => {
    expect(participantRole(conversation, "renter")).toBe("renter");
    expect(participantRole(conversation, "owner")).toBe("owner");
    expect(participantRole(conversation, "stranger")).toBeNull();
  });

  it("pairs each side with the other", () => {
    expect(counterpartyId(conversation, "renter")).toBe("owner");
    expect(counterpartyId(conversation, "owner")).toBe("renter");
  });
});

describe("read cursors", () => {
  it("keeps each side's cursor separate", () => {
    const read = new Date("2026-10-01T10:00:00Z");
    const cursors = { renterLastReadAt: read, ownerLastReadAt: null };

    expect(readCursorField("renter")).toBe("renterLastReadAt");
    expect(readCursorField("owner")).toBe("ownerLastReadAt");
    expect(lastReadAtFor(cursors, "renter")).toBe(read);
    expect(lastReadAtFor(cursors, "owner")).toBeNull();
  });

  it("counts other people's messages and SYSTEM messages, never one's own", () => {
    const where = unreadMessagesWhere("c1", "renter", null);

    expect(where).toEqual({
      conversationId: "c1",
      OR: [{ senderId: null }, { senderId: { not: "renter" } }],
    });
  });

  it("counts only messages after the cursor", () => {
    const read = new Date("2026-10-01T10:00:00Z");

    expect(unreadMessagesWhere("c1", "owner", read).createdAt).toEqual({
      gt: read,
    });
  });
});

describe("canStartConversation", () => {
  it("lets a renter contact the owner of a visible listing", () => {
    expect(
      canStartConversation({
        userId: "renter",
        listingOwnerId: "owner",
        listingVisible: true,
        existing: false,
      })
    ).toEqual({ allowed: true });
  });

  it("refuses an owner messaging about their own listing", () => {
    expect(
      canStartConversation({
        userId: "owner",
        listingOwnerId: "owner",
        listingVisible: true,
        existing: false,
      }).allowed
    ).toBe(false);
  });

  it("refuses first contact about a listing that is not visible", () => {
    expect(
      canStartConversation({
        userId: "renter",
        listingOwnerId: "owner",
        listingVisible: false,
        existing: false,
      }).allowed
    ).toBe(false);
  });

  it("reopens an existing thread even after the listing is hidden", () => {
    expect(
      canStartConversation({
        userId: "renter",
        listingOwnerId: "owner",
        listingVisible: false,
        existing: true,
      })
    ).toEqual({ allowed: true });
  });
});

describe("canReadConversation", () => {
  it("admits both participants", () => {
    expect(canReadConversation(conversation, "renter").allowed).toBe(true);
    expect(canReadConversation(conversation, "owner").allowed).toBe(true);
  });

  it("refuses anyone else with the shared not-found message", () => {
    expect(canReadConversation(conversation, "stranger")).toEqual({
      allowed: false,
      reason: CONVERSATION_NOT_FOUND_ERROR,
    });
  });
});

describe("canWriteToConversation", () => {
  it("allows a participant when the other side is active", () => {
    expect(
      canWriteToConversation({
        conversation,
        userId: "owner",
        counterparty: active,
      })
    ).toEqual({ allowed: true });
  });

  it("refuses a stranger with the not-found message, even if the counterparty is banned", () => {
    expect(
      canWriteToConversation({
        conversation,
        userId: "stranger",
        counterparty: { status: UserStatus.BANNED, deletedAt: null },
      })
    ).toEqual({ allowed: false, reason: CONVERSATION_NOT_FOUND_ERROR });
  });

  it.each([
    ["suspended", { status: UserStatus.SUSPENDED, deletedAt: null }],
    ["banned", { status: UserStatus.BANNED, deletedAt: null }],
    ["deleted", { status: UserStatus.ACTIVE, deletedAt: new Date() }],
  ])(
    "closes the thread when the counterparty is %s",
    (_label, counterparty) => {
      expect(
        canWriteToConversation({ conversation, userId: "renter", counterparty })
      ).toEqual({ allowed: false, reason: CONVERSATION_CLOSED_ERROR });
    }
  );
});
