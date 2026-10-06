import { Prisma } from "@/generated/prisma/client";
import { MessageKind, OfferStatus } from "@/generated/prisma/enums";
import { offerEventText } from "@/lib/chat/messages";
import {
  bookingTermsAmendable,
  canProposeOffer,
  canRespondToOffer,
  canWithdrawOffer,
  offerExpiresAt,
  OFFER_NOT_FOUND_ERROR,
  TERMS_AMENDABLE_STATUSES,
  TERMS_LOCKED_ERROR,
  toCalendarDay,
} from "@/lib/chat/offers";
import {
  canStartConversation,
  canWriteToConversation,
  CONVERSATION_NOT_FOUND_ERROR,
  participantRole,
  readCursorField,
} from "@/lib/chat/rules";
import { prisma } from "@/lib/prisma";
import { VISIBLE_LISTING_WHERE } from "@/lib/queries/visibility";
import {
  chatMessageDeliveries,
  chatReadDeliveries,
} from "@/lib/realtime/channels";

import type { ChatDecision, ParticipantRole } from "@/lib/chat/rules";
import type { ChatDelivery, PublishableMessage } from "@/lib/realtime/channels";
import type { ProposeOfferInput } from "@/lib/validations/chat";

/**
 * Every chat write. Session, rate limits and publishing are the action's job; everything that
 * touches the database is here, so `scripts/verify-chat.ts` can drive it without a session.
 *
 * THE CONVERSATION ROW IS THE LOCK. Every write that changes offers starts its transaction by
 * updating its conversation, which takes that row's lock. Two offers proposed at once, or an accept
 * racing a withdrawal, are therefore serialized per conversation - the second waits, then re-reads
 * and sees what the first did. No advisory locks, and no partial unique index for Prisma to fight.
 *
 * GUARDED WRITES DECIDE RACES; READS BEFORE THEM ONLY EXPLAIN. As in the booking actions, the rules
 * run first to give a good message, and each state change is a conditional update that re-asserts
 * them. The database triggers are the last line behind both.
 *
 * Results carry the realtime deliveries for the action to publish after commit.
 */

export type ChatWriteResult<T> =
  | { ok: true; data: T; deliveries: ChatDelivery[] }
  | { ok: false; error: string };

export const CONCURRENT_OFFER_ERROR =
  "This offer was just changed. Please refresh and try again.";

const messageSelect = {
  id: true,
  conversationId: true,
  senderId: true,
  kind: true,
  body: true,
  offerId: true,
  clientId: true,
  createdAt: true,
} as const satisfies Prisma.MessageSelect;

const accountSelect = { status: true, deletedAt: true } as const;

/** Thrown inside a transaction to roll it back with a message for the caller. */
class ChatAbort extends Error {
  constructor(readonly userMessage: string) {
    super(userMessage);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function fail<T>(error: string): ChatWriteResult<T> {
  return { ok: false, error };
}

function refusal<T>(decision: ChatDecision): ChatWriteResult<T> | null {
  return decision.allowed ? null : fail(decision.reason);
}

// ------------------------------------------------------------------ conversations

/**
 * The conversation for this listing and renter, created if it does not exist.
 *
 * Not inside the caller's transaction, deliberately. A concurrent first message from two tabs makes
 * one insert lose on `@@unique([listingId, renterId])`; that loser re-reads the winner's row here. In
 * a transaction the failed insert would abort everything after it - and `createBookingRequest`
 * reads any P2002 in its transaction as a date clash.
 */
export async function ensureConversation({
  listingId,
  renterId,
  ownerId,
}: {
  listingId: string;
  renterId: string;
  ownerId: string;
}): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.conversation.findUnique({
    where: { listingId_renterId: { listingId, renterId } },
    select: { id: true },
  });

  if (existing) {
    return { id: existing.id, created: false };
  }

  try {
    const created = await prisma.conversation.create({
      data: { listingId, renterId, ownerId },
      select: { id: true },
    });

    return { id: created.id, created: true };
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const winner = await prisma.conversation.findUniqueOrThrow({
      where: { listingId_renterId: { listingId, renterId } },
      select: { id: true },
    });

    return { id: winner.id, created: false };
  }
}

/**
 * Opens - or reopens - the renter's conversation about a listing.
 *
 * `beforeCreate` runs only when a new conversation would be made, so the action can apply the
 * first-contact rate limit and the email gate to first contact only. Reopening an existing thread
 * is a navigation, not a new message to a stranger.
 */
export async function startConversation({
  userId,
  listingId,
  beforeCreate,
}: {
  userId: string;
  listingId: string;
  beforeCreate: () => Promise<ChatDecision>;
}): Promise<ChatWriteResult<{ conversationId: string; created: boolean }>> {
  const existing = await prisma.conversation.findUnique({
    where: { listingId_renterId: { listingId, renterId: userId } },
    select: { id: true, ownerId: true },
  });

  const listing = existing
    ? null
    : await prisma.listing.findFirst({
        where: { id: listingId, ...VISIBLE_LISTING_WHERE },
        select: { ownerId: true },
      });

  const ownerId = existing?.ownerId ?? listing?.ownerId;

  if (!ownerId) {
    return fail("That listing is not available.");
  }

  const refused = refusal<{ conversationId: string; created: boolean }>(
    canStartConversation({
      userId,
      listingOwnerId: ownerId,
      listingVisible: listing !== null,
      existing: existing !== null,
    })
  );

  if (refused) {
    return refused;
  }

  if (existing) {
    return {
      ok: true,
      data: { conversationId: existing.id, created: false },
      deliveries: [],
    };
  }

  const gate = await beforeCreate();

  if (!gate.allowed) {
    return fail(gate.reason);
  }

  const conversation = await ensureConversation({
    listingId,
    renterId: userId,
    ownerId,
  });

  return {
    ok: true,
    data: { conversationId: conversation.id, created: conversation.created },
    deliveries: [],
  };
}

interface ParticipantContext {
  conversation: {
    id: string;
    listingId: string;
    renterId: string;
    ownerId: string;
  };
  role: ParticipantRole;
  writable: ChatDecision;
}

/**
 * The conversation as seen by one of its participants, or `null` for anyone else.
 *
 * Participation is in the WHERE clause, so a stranger's lookup finds nothing - the same shape as
 * `loadBookingForParty`. `writable` covers the counterparty's status.
 */
export async function loadForParticipant(
  conversationId: string,
  userId: string
): Promise<ParticipantContext | null> {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      OR: [{ renterId: userId }, { ownerId: userId }],
    },
    select: {
      id: true,
      listingId: true,
      renterId: true,
      ownerId: true,
      renter: { select: accountSelect },
      owner: { select: accountSelect },
    },
  });

  if (!conversation) {
    return null;
  }

  const role = participantRole(conversation, userId);

  if (!role) {
    return null;
  }

  const { renter, owner, ...parties } = conversation;

  return {
    conversation: parties,
    role,
    writable: canWriteToConversation({
      conversation: parties,
      userId,
      counterparty: role === "renter" ? owner : renter,
    }),
  };
}

/**
 * Moves the thread's clock and the writer's own read cursor to a just-written message.
 *
 * The writer has evidently read the thread up to their own message, so it never counts as unread
 * for them - and their badge does not light up for something they typed.
 */
async function touchConversation(
  tx: Prisma.TransactionClient,
  conversationId: string,
  role: ParticipantRole | null,
  at: Date
): Promise<void> {
  await tx.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: at,
      ...(role ? { [readCursorField(role)]: at } : {}),
    },
    select: { id: true },
  });
}

/** Takes the conversation's row lock for the rest of the transaction. See the module note. */
async function lockConversation(
  tx: Prisma.TransactionClient,
  conversationId: string
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "conversations" WHERE "id" = ${conversationId} FOR UPDATE`;
}

/**
 * The conversation for a booking, from either side of it.
 *
 * `startConversation` is renter-only - first contact runs from renter to owner. This is the other
 * door: an owner looking at a request, or anyone looking at a booking made before chat existed.
 * Those older bookings have no link yet, so the conversation is found or created and the link is
 * written. `conversationId` is not one of the columns the `bookings` trigger locks, so this works
 * on a paid booking too.
 */
export async function openBookingConversation({
  userId,
  bookingId,
}: {
  userId: string;
  bookingId: string;
}): Promise<ChatWriteResult<{ conversationId: string }>> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, OR: [{ renterId: userId }, { ownerId: userId }] },
    select: {
      id: true,
      listingId: true,
      renterId: true,
      ownerId: true,
      conversationId: true,
    },
  });

  if (!booking) {
    return fail("That booking was not found.");
  }

  if (booking.conversationId) {
    return {
      ok: true,
      data: { conversationId: booking.conversationId },
      deliveries: [],
    };
  }

  const conversation = await ensureConversation({
    listingId: booking.listingId,
    renterId: booking.renterId,
    ownerId: booking.ownerId,
  });

  try {
    // Only if still unlinked. A concurrent open from the other side links the same conversation -
    // (listingId, renterId) is unique - so losing that race changes nothing.
    await prisma.booking.update({
      where: { id: booking.id, conversationId: null },
      data: { conversationId: conversation.id },
      select: { id: true },
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2025"
    ) {
      throw error;
    }
  }

  return {
    ok: true,
    data: { conversationId: conversation.id },
    deliveries: [],
  };
}

// ------------------------------------------------------------------ messages

/**
 * Writes a TEXT message.
 *
 * IDEMPOTENT ON `clientId`. A send retried after a dropped response returns the first copy and
 * publishes nothing new, so the recipient never sees a message twice. The unique index on
 * (senderId, clientId) settles two concurrent retries the same way.
 */
export async function sendMessage({
  userId,
  conversationId,
  body,
  clientId,
}: {
  userId: string;
  conversationId: string;
  body: string;
  clientId?: string | undefined;
}): Promise<ChatWriteResult<{ message: PublishableMessage }>> {
  const context = await loadForParticipant(conversationId, userId);

  if (!context) {
    return fail(CONVERSATION_NOT_FOUND_ERROR);
  }

  const refused = refusal<{ message: PublishableMessage }>(context.writable);

  if (refused) {
    return refused;
  }

  const findRetried = async () =>
    clientId
      ? prisma.message.findFirst({
          where: { senderId: userId, clientId, conversationId },
          select: messageSelect,
        })
      : null;

  const retried = await findRetried();

  if (retried) {
    return { ok: true, data: { message: retried }, deliveries: [] };
  }

  try {
    const message = await prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          kind: MessageKind.TEXT,
          body,
          ...(clientId ? { clientId } : {}),
        },
        select: messageSelect,
      });

      await touchConversation(
        tx,
        conversationId,
        context.role,
        created.createdAt
      );

      return created;
    });

    return {
      ok: true,
      data: { message },
      deliveries: chatMessageDeliveries(context.conversation, [message]),
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await findRetried();

      if (winner) {
        return { ok: true, data: { message: winner }, deliveries: [] };
      }
    }

    throw error;
  }
}

/**
 * Moves this participant's read cursor to `now`.
 *
 * Forward only: the guard refuses to move a cursor backwards, so a stale tab marking read cannot
 * resurrect messages a newer tab already cleared. Publishes nothing when nothing moved.
 */
export async function markConversationRead({
  userId,
  conversationId,
  now = new Date(),
}: {
  userId: string;
  conversationId: string;
  now?: Date;
}): Promise<ChatWriteResult<{ readAt: Date | null }>> {
  const context = await loadForParticipant(conversationId, userId);

  if (!context) {
    return fail(CONVERSATION_NOT_FOUND_ERROR);
  }

  const field = readCursorField(context.role);

  const moved = await prisma.conversation.updateMany({
    where: {
      id: conversationId,
      OR: [{ [field]: null }, { [field]: { lt: now } }],
    },
    data: { [field]: now },
  });

  if (moved.count === 0) {
    return { ok: true, data: { readAt: null }, deliveries: [] };
  }

  return {
    ok: true,
    data: { readAt: now },
    deliveries: chatReadDeliveries(context.conversation, {
      conversationId,
      readerId: userId,
      readAt: now,
    }),
  };
}

// ------------------------------------------------------------------ offers

/**
 * Proposes terms, closing any offer still open in the conversation.
 *
 * ONE OPEN OFFER PER CONVERSATION. A new proposal is a counter-offer, so the open one is marked
 * SUPERSEDED - or EXPIRED, if its deadline had passed and nothing had said so yet. Both happen under
 * the conversation lock, so two concurrent proposals cannot both end up open.
 */
export async function proposeOffer({
  userId,
  input,
  now = new Date(),
  today,
}: {
  userId: string;
  input: ProposeOfferInput;
  now?: Date;
  today: string;
}): Promise<ChatWriteResult<{ offerId: string }>> {
  const context = await loadForParticipant(input.conversationId, userId);

  if (!context) {
    return fail(CONVERSATION_NOT_FOUND_ERROR);
  }

  const { conversation, role } = context;

  const bookingSelect = {
    id: true,
    status: true,
    paymentId: true,
    startDate: true,
    endDate: true,
  } as const;

  // The booking must be THIS conversation's: same listing, same renter.
  const bookingWhere = input.bookingId
    ? {
        id: input.bookingId,
        listingId: conversation.listingId,
        renterId: conversation.renterId,
      }
    : null;

  const booking = bookingWhere
    ? await prisma.booking.findFirst({
        where: bookingWhere,
        select: bookingSelect,
      })
    : null;

  if (bookingWhere && !booking) {
    return fail("That booking was not found.");
  }

  const terms = {
    startDate: input.startDate,
    endDate: input.endDate,
    totalPrice: input.totalPrice,
    securityDeposit: input.securityDeposit,
  };

  const refused = refusal<{ offerId: string }>(
    canProposeOffer({
      role,
      writable: context.writable,
      terms,
      today,
      booking: booking
        ? {
            status: booking.status,
            paymentId: booking.paymentId,
            startDate: toCalendarDay(booking.startDate),
            endDate: toCalendarDay(booking.endDate),
          }
        : null,
    })
  );

  if (refused) {
    return refused;
  }

  try {
    const message = await prisma.$transaction(async (tx) => {
      await lockConversation(tx, conversation.id);

      // Re-read under the lock: payment may have begun since the check above.
      if (bookingWhere) {
        const current = await tx.booking.findFirst({
          where: bookingWhere,
          select: { status: true, paymentId: true },
        });

        if (!current || !bookingTermsAmendable(current)) {
          throw new ChatAbort(TERMS_LOCKED_ERROR);
        }
      }

      await tx.offer.updateMany({
        where: {
          conversationId: conversation.id,
          status: OfferStatus.PENDING,
          expiresAt: { lte: now },
        },
        data: { status: OfferStatus.EXPIRED, respondedAt: now },
      });
      await tx.offer.updateMany({
        where: { conversationId: conversation.id, status: OfferStatus.PENDING },
        data: { status: OfferStatus.SUPERSEDED, respondedAt: now },
      });

      const offer = await tx.offer.create({
        data: {
          conversationId: conversation.id,
          ...(input.bookingId ? { bookingId: input.bookingId } : {}),
          proposedById: userId,
          recipientId:
            role === "renter" ? conversation.ownerId : conversation.renterId,
          startDate: new Date(`${input.startDate}T00:00:00.000Z`),
          endDate: new Date(`${input.endDate}T00:00:00.000Z`),
          totalPrice: input.totalPrice,
          securityDeposit: input.securityDeposit,
          expiresAt: offerExpiresAt(now),
        },
        select: { id: true },
      });

      const created = await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderId: userId,
          kind: MessageKind.OFFER,
          offerId: offer.id,
        },
        select: messageSelect,
      });

      await touchConversation(tx, conversation.id, role, created.createdAt);

      return created;
    });

    return {
      ok: true,
      data: { offerId: message.offerId! },
      deliveries: chatMessageDeliveries(conversation, [message]),
    };
  } catch (error) {
    if (error instanceof ChatAbort) {
      return fail(error.userMessage);
    }

    throw error;
  }
}

const offerForResponseSelect = {
  id: true,
  status: true,
  expiresAt: true,
  proposedById: true,
  recipientId: true,
  bookingId: true,
  startDate: true,
  endDate: true,
  totalPrice: true,
  securityDeposit: true,
  conversationId: true,
  booking: { select: { status: true, paymentId: true } },
} as const satisfies Prisma.OfferSelect;

/**
 * Accepts or declines an offer.
 *
 * Accepting an offer made against a booking also renegotiates that booking, in the same
 * transaction: the offer becomes ACCEPTED and the booking carries its terms, or neither happens. The
 * booking write is guarded on the terms still being amendable - if payment began in between, the
 * update matches nothing and the whole acceptance rolls back. The `bookings` trigger stands behind
 * that guard, and the `payments` path re-checks from its side.
 */
export async function respondToOffer({
  userId,
  offerId,
  response,
  now = new Date(),
  today,
}: {
  userId: string;
  offerId: string;
  response: "accept" | "decline";
  now?: Date;
  today: string;
}): Promise<
  ChatWriteResult<{ status: OfferStatus; bookingId: string | null }>
> {
  type Data = { status: OfferStatus; bookingId: string | null };

  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: offerForResponseSelect,
  });

  const context = offer
    ? await loadForParticipant(offer.conversationId, userId)
    : null;

  if (!offer || !context) {
    return fail(OFFER_NOT_FOUND_ERROR);
  }

  const refused =
    refusal<Data>(context.writable) ??
    refusal<Data>(
      canRespondToOffer({
        offer: { ...offer, startDate: toCalendarDay(offer.startDate) },
        userId,
        response,
        now,
        today,
        booking: offer.booking,
      })
    );

  if (refused) {
    return refused;
  }

  const status =
    response === "accept" ? OfferStatus.ACCEPTED : OfferStatus.DECLINED;

  try {
    const message = await prisma.$transaction(async (tx) => {
      await lockConversation(tx, offer.conversationId);

      const closed = await tx.offer.updateMany({
        where: {
          id: offer.id,
          recipientId: userId,
          status: OfferStatus.PENDING,
          expiresAt: { gt: now },
        },
        data: { status, respondedAt: now },
      });

      if (closed.count !== 1) {
        throw new ChatAbort(CONCURRENT_OFFER_ERROR);
      }

      if (status === OfferStatus.ACCEPTED && offer.bookingId) {
        try {
          await tx.booking.update({
            where: {
              id: offer.bookingId,
              status: { in: [...TERMS_AMENDABLE_STATUSES] },
              payment: { is: null },
            },
            /**
             * The scalar `agreedOfferId`, NOT `agreedOffer: { connect }`. Prisma runs a mixed
             * scalar-and-connect update as two statements - terms first, link second - and the
             * `bookings` trigger rightly refuses the first, which changes terms without naming a
             * new offer. One statement changes both together.
             */
            data: {
              totalPrice: offer.totalPrice,
              securityDeposit: offer.securityDeposit,
              agreedOfferId: offer.id,
            },
            select: { id: true },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025"
          ) {
            throw new ChatAbort(TERMS_LOCKED_ERROR);
          }

          throw error;
        }
      }

      const created = await tx.message.create({
        data: {
          conversationId: offer.conversationId,
          kind: MessageKind.SYSTEM,
          offerId: offer.id,
          body: offerEventText(
            status === OfferStatus.ACCEPTED ? "accepted" : "declined",
            offer,
            { appliedToBooking: offer.bookingId !== null }
          ),
        },
        select: messageSelect,
      });

      await touchConversation(
        tx,
        offer.conversationId,
        context.role,
        created.createdAt
      );

      return created;
    });

    return {
      ok: true,
      data: { status, bookingId: offer.bookingId },
      deliveries: chatMessageDeliveries(context.conversation, [message]),
    };
  } catch (error) {
    if (error instanceof ChatAbort) {
      return fail(error.userMessage);
    }

    throw error;
  }
}

/** Withdraws an open offer. Only its proposer, only while it is open. */
export async function withdrawOffer({
  userId,
  offerId,
  now = new Date(),
}: {
  userId: string;
  offerId: string;
  now?: Date;
}): Promise<ChatWriteResult<{ status: OfferStatus }>> {
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: offerForResponseSelect,
  });

  const context = offer
    ? await loadForParticipant(offer.conversationId, userId)
    : null;

  if (!offer || !context) {
    return fail(OFFER_NOT_FOUND_ERROR);
  }

  const refused = refusal<{ status: OfferStatus }>(
    canWithdrawOffer({ offer, userId, now })
  );

  if (refused) {
    return refused;
  }

  try {
    const message = await prisma.$transaction(async (tx) => {
      await lockConversation(tx, offer.conversationId);

      const closed = await tx.offer.updateMany({
        where: {
          id: offer.id,
          proposedById: userId,
          status: OfferStatus.PENDING,
          expiresAt: { gt: now },
        },
        data: { status: OfferStatus.WITHDRAWN, respondedAt: now },
      });

      if (closed.count !== 1) {
        throw new ChatAbort(CONCURRENT_OFFER_ERROR);
      }

      const created = await tx.message.create({
        data: {
          conversationId: offer.conversationId,
          kind: MessageKind.SYSTEM,
          offerId: offer.id,
          body: offerEventText("withdrawn", offer, {
            appliedToBooking: false,
          }),
        },
        select: messageSelect,
      });

      await touchConversation(
        tx,
        offer.conversationId,
        context.role,
        created.createdAt
      );

      return created;
    });

    return {
      ok: true,
      data: { status: OfferStatus.WITHDRAWN },
      deliveries: chatMessageDeliveries(context.conversation, [message]),
    };
  } catch (error) {
    if (error instanceof ChatAbort) {
      return fail(error.userMessage);
    }

    throw error;
  }
}
