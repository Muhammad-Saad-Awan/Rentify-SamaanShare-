import { UserStatus } from "@/generated/prisma/enums";

import type { Prisma } from "@/generated/prisma/client";

/**
 * Who may take part in a conversation, and what they may do in it. Pure.
 *
 * THE BOUNDARY IS THE CONVERSATION ROW. A conversation has exactly two participants, its renter and
 * its owner, and every rule below starts by working out which of them the caller is. Somebody who is
 * neither is told the conversation was not found, never that it exists and is not theirs - the same
 * reasoning as the shared not-found message the payment actions use.
 *
 * WHAT IS NOT HERE: the email-confirmation gate and the session check. Both read the database, and
 * the actions apply them before any of this runs. Administrator access is a separate module,
 * `admin-access.ts`, because it is a different kind of access - read-only, on stated grounds, and
 * logged.
 */

/** Longest message, in characters after trimming. A message, not a document. */
export const MESSAGE_BODY_MAX = 2000;

/** Messages loaded per page of a thread, newest first. */
export const MESSAGE_PAGE_SIZE = 30;

/**
 * Rate limits. Keys must carry the action name as well as the identity - see `checkRateLimit`.
 *
 * Two limits on sending, because they stop different things. The per-user limit bounds one account
 * spamming many threads; the per-conversation burst limit bounds flooding one person, which the
 * wider limit would allow at 30 messages a minute.
 */
export const MESSAGE_RATE_LIMIT = { limit: 30, windowMs: 60_000 };
export const CONVERSATION_BURST_LIMIT = { limit: 8, windowMs: 10_000 };

/**
 * New conversations per user per hour. Opening a thread is how a stranger first reaches an owner,
 * so it is the limit that matters against unsolicited messages. Fifteen leaves room for someone
 * comparing several items.
 */
export const START_CONVERSATION_RATE_LIMIT = { limit: 15, windowMs: 3_600_000 };

/** Offers per user per conversation per hour. Negotiation takes a few rounds, not dozens. */
export const OFFER_RATE_LIMIT = { limit: 10, windowMs: 3_600_000 };

/** Shown for every reason a caller may not see a conversation, so none of them leaks. */
export const CONVERSATION_NOT_FOUND_ERROR = "That conversation was not found.";

export const CONVERSATION_CLOSED_ERROR =
  "This member's account is no longer active, so the conversation is closed.";

export type ParticipantRole = "renter" | "owner";

export type ChatDecision =
  { allowed: true } | { allowed: false; reason: string };

interface ConversationParties {
  renterId: string;
  ownerId: string;
}

/** Which side of this conversation the user is on, or `null` if neither. */
export function participantRole(
  conversation: ConversationParties,
  userId: string
): ParticipantRole | null {
  if (conversation.renterId === userId) {
    return "renter";
  }

  if (conversation.ownerId === userId) {
    return "owner";
  }

  return null;
}

/** The other participant's id. */
export function counterpartyId(
  conversation: ConversationParties,
  role: ParticipantRole
): string {
  return role === "renter" ? conversation.ownerId : conversation.renterId;
}

/** The column holding this side's read cursor. */
export function readCursorField(
  role: ParticipantRole
): "renterLastReadAt" | "ownerLastReadAt" {
  return role === "renter" ? "renterLastReadAt" : "ownerLastReadAt";
}

/** This side's read cursor, or `null` if they have never opened the thread. */
export function lastReadAtFor(
  conversation: { renterLastReadAt: Date | null; ownerLastReadAt: Date | null },
  role: ParticipantRole
): Date | null {
  return conversation[readCursorField(role)];
}

/**
 * The messages this user has not read in one conversation.
 *
 * "From anybody but me, newer than my cursor." SYSTEM messages have no sender and count, which is
 * the point of them - an accepted offer is something both sides should notice. Spelled as an OR
 * because `NOT { senderId: me }` would also drop the NULL-sender rows, as SQL inequality does.
 *
 * Served by `@@index([conversationId, createdAt])`.
 */
export function unreadMessagesWhere(
  conversationId: string,
  userId: string,
  lastReadAt: Date | null
): Prisma.MessageWhereInput {
  return {
    conversationId,
    OR: [{ senderId: null }, { senderId: { not: userId } }],
    ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
  };
}

interface AccountState {
  status: UserStatus;
  deletedAt: Date | null;
}

/** Whether an account can still take part. Mirrors the check in `getActiveUser`. */
export function isActiveAccount(account: AccountState): boolean {
  return account.status === UserStatus.ACTIVE && account.deletedAt === null;
}

/**
 * Whether this user may open a conversation about this listing.
 *
 * AN EXISTING THREAD IS ALWAYS REOPENED. The visibility check guards a stranger making first
 * contact. It must not lock a renter out of the thread about a rental they are in the middle of
 * because the owner paused the listing afterwards.
 *
 * `listingVisible` is the result of `VISIBLE_LISTING_WHERE`, which covers listing status, soft
 * deletion and the owner's own status, so a banned owner's listing cannot be messaged about.
 */
export function canStartConversation({
  userId,
  listingOwnerId,
  listingVisible,
  existing,
}: {
  userId: string;
  listingOwnerId: string;
  listingVisible: boolean;
  existing: boolean;
}): ChatDecision {
  if (listingOwnerId === userId) {
    return {
      allowed: false,
      reason: "This is your own listing.",
    };
  }

  if (existing) {
    return { allowed: true };
  }

  if (!listingVisible) {
    return { allowed: false, reason: "That listing is not available." };
  }

  return { allowed: true };
}

/**
 * Whether this user may read this conversation as a participant.
 *
 * Reading survives the other side being suspended. The thread is still this user's record of what
 * was agreed, and a ban on one account should not take it away from the other.
 */
export function canReadConversation(
  conversation: ConversationParties,
  userId: string
): ChatDecision {
  return participantRole(conversation, userId)
    ? { allowed: true }
    : { allowed: false, reason: CONVERSATION_NOT_FOUND_ERROR };
}

/**
 * Whether this user may write to this conversation - a message or an offer.
 *
 * A thread with an inactive counterparty is read-only. Writing to someone who can no longer sign in
 * reaches nobody, and an offer they cannot answer would sit open until it expired.
 *
 * The caller's own status is not checked here. `getActiveUser` has already refused an inactive
 * caller before this runs.
 */
export function canWriteToConversation({
  conversation,
  userId,
  counterparty,
}: {
  conversation: ConversationParties;
  userId: string;
  counterparty: AccountState;
}): ChatDecision {
  if (!participantRole(conversation, userId)) {
    return { allowed: false, reason: CONVERSATION_NOT_FOUND_ERROR };
  }

  if (!isActiveAccount(counterparty)) {
    return { allowed: false, reason: CONVERSATION_CLOSED_ERROR };
  }

  return { allowed: true };
}
