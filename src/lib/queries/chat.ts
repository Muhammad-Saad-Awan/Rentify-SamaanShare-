import { Prisma } from "@/generated/prisma/client";
import { ReportType } from "@/generated/prisma/enums";
import { bookingTermsAmendable, effectiveOfferStatus } from "@/lib/chat/offers";
import {
  isActiveAccount,
  lastReadAtFor,
  MESSAGE_PAGE_SIZE,
  participantRole,
} from "@/lib/chat/rules";
import { prisma } from "@/lib/prisma";

import type {
  BookingStatus,
  MessageKind,
  OfferStatus,
} from "@/generated/prisma/enums";
import type { ParticipantRole } from "@/lib/chat/rules";

/**
 * Chat reads.
 *
 * EVERY PARTICIPANT READ HAS THE USER IN ITS WHERE CLAUSE. A conversation that is not the caller's is
 * simply not found, so no caller has to remember to check afterwards. The one read without that
 * filter is `getMessagesPage`, which takes a conversation id the caller has already authorized - a
 * participant via `loadForParticipant`, an administrator via a logged ground.
 */

export interface ChatMessageView {
  id: string;
  senderId: string | null;
  kind: MessageKind;
  body: string | null;
  offerId: string | null;
  clientId: string | null;
  createdAt: Date;
}

const messageViewSelect = {
  id: true,
  senderId: true,
  kind: true,
  body: true,
  offerId: true,
  clientId: true,
  createdAt: true,
} as const satisfies Prisma.MessageSelect;

export interface MessagePage {
  /** Oldest first, ready to render top to bottom. */
  messages: ChatMessageView[];
  /** Whether there are older messages before the first one here. */
  hasOlder: boolean;
}

/**
 * One page of a thread, newest messages last, ending just before `beforeId` if given.
 *
 * Keyed on (createdAt, id) through Prisma's cursor, so two messages written in the same millisecond
 * neither repeat nor go missing between pages. A `beforeId` from another conversation finds nothing
 * and yields an empty page rather than another thread's messages.
 */
export async function getMessagesPage(
  conversationId: string,
  beforeId?: string
): Promise<MessagePage> {
  if (beforeId) {
    const anchor = await prisma.message.findFirst({
      where: { id: beforeId, conversationId },
      select: { id: true },
    });

    if (!anchor) {
      return { messages: [], hasOlder: false };
    }
  }

  const rows = await prisma.message.findMany({
    where: { conversationId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MESSAGE_PAGE_SIZE + 1,
    ...(beforeId ? { cursor: { id: beforeId }, skip: 1 } : {}),
    select: messageViewSelect,
  });

  const hasOlder = rows.length > MESSAGE_PAGE_SIZE;

  return {
    messages: rows.slice(0, MESSAGE_PAGE_SIZE).reverse(),
    hasOlder,
  };
}

/**
 * Unread message counts per conversation for one user. Conversations with none are absent.
 *
 * One aggregate query rather than a count per conversation. The cursor column depends on which side
 * the user is on, so it is chosen per row in SQL; NULL cursors compare as "never read". SYSTEM
 * messages have no sender and count - see `unreadMessagesWhere`, which this must agree with.
 */
export async function getUnreadCounts(
  userId: string
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ id: string; unread: bigint }[]>`
    SELECT c."id", COUNT(m."id") AS "unread"
      FROM "conversations" c
      JOIN "messages" m ON m."conversationId" = c."id"
     WHERE (c."renterId" = ${userId} OR c."ownerId" = ${userId})
       AND (m."senderId" IS NULL OR m."senderId" <> ${userId})
       AND m."createdAt" > COALESCE(
             CASE WHEN c."renterId" = ${userId} THEN c."renterLastReadAt" ELSE c."ownerLastReadAt" END,
             '-infinity'::timestamp)
     GROUP BY c."id"`;

  return new Map(rows.map((row) => [row.id, Number(row.unread)]));
}

/** Total unread messages across every conversation, for the sidebar badge. */
export async function getUnreadTotal(userId: string): Promise<number> {
  let total = 0;

  for (const count of (await getUnreadCounts(userId)).values()) {
    total += count;
  }

  return total;
}

export interface ConversationSummary {
  id: string;
  role: ParticipantRole;
  listing: { id: string; title: string };
  counterparty: { id: string; name: string | null; image: string | null };
  lastMessageAt: Date;
  lastMessage: {
    kind: MessageKind;
    body: string | null;
    senderId: string | null;
  } | null;
  unread: number;
}

const counterpartySelect = {
  id: true,
  name: true,
  image: true,
  avatarUrl: true,
  status: true,
  deletedAt: true,
} as const;

/**
 * The inbox, most recently active first.
 *
 * Only conversations with at least one message. A conversation row exists from the moment a renter
 * opens the thread, or from a booking request that then lost the date race - neither of which an
 * owner should see as an empty entry in their inbox.
 */
export async function listConversations(
  userId: string,
  { take = 30, skip = 0 }: { take?: number; skip?: number } = {}
): Promise<ConversationSummary[]> {
  const [rows, unread] = await Promise.all([
    prisma.conversation.findMany({
      where: {
        OR: [{ renterId: userId }, { ownerId: userId }],
        messages: { some: {} },
      },
      orderBy: { lastMessageAt: "desc" },
      take,
      skip,
      select: {
        id: true,
        renterId: true,
        ownerId: true,
        lastMessageAt: true,
        listing: { select: { id: true, title: true } },
        renter: { select: counterpartySelect },
        owner: { select: counterpartySelect },
        messages: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { kind: true, body: true, senderId: true },
        },
      },
    }),
    getUnreadCounts(userId),
  ]);

  return rows.flatMap((row) => {
    const role = participantRole(row, userId);

    if (!role) {
      return [];
    }

    const other = role === "renter" ? row.owner : row.renter;

    return [
      {
        id: row.id,
        role,
        listing: row.listing,
        counterparty: {
          id: other.id,
          name: other.name,
          image: other.avatarUrl ?? other.image,
        },
        lastMessageAt: row.lastMessageAt,
        lastMessage: row.messages[0] ?? null,
        unread: unread.get(row.id) ?? 0,
      },
    ];
  });
}

export interface OfferView {
  id: string;
  bookingId: string | null;
  proposedById: string;
  recipientId: string;
  startDate: Date;
  endDate: Date;
  totalPrice: number;
  securityDeposit: number;
  /** The effective status - a PENDING offer past its deadline reads EXPIRED. */
  status: OfferStatus;
  expiresAt: Date;
  respondedAt: Date | null;
  createdAt: Date;
  /** The booking carrying these terms, if one does. */
  agreedByBookingId: string | null;
}

export interface ConversationBookingView {
  id: string;
  status: BookingStatus;
  startDate: Date;
  endDate: Date;
  totalPrice: number;
  securityDeposit: number;
  agreedOfferId: string | null;
  /** Whether an offer may still change this booking's rent and deposit. */
  termsAmendable: boolean;
}

export interface ConversationDetail {
  id: string;
  role: ParticipantRole;
  listing: {
    id: string;
    title: string;
    status: string;
    pricePerDay: number;
    pricePerWeek: number | null;
    pricePerMonth: number | null;
    securityDeposit: number;
  };
  counterparty: {
    id: string;
    name: string | null;
    image: string | null;
    /** False once suspended or deleted. The thread is then read-only. */
    active: boolean;
  };
  /** The counterparty's read cursor, for read receipts. */
  counterpartyLastReadAt: Date | null;
  /** This user's own cursor, so the page can mark the first unread message. */
  lastReadAt: Date | null;
  bookings: ConversationBookingView[];
  /** Every offer in the thread, newest first. A thread rarely has more than a handful. */
  offers: OfferView[];
}

/**
 * A conversation as one of its participants sees it, or `null`.
 *
 * Bookings are found by (listingId, renterId), not by `Booking.conversationId`, so a rental made
 * before chat existed still shows up in the thread about it.
 */
export async function getConversationForParticipant(
  conversationId: string,
  userId: string,
  now: Date = new Date()
): Promise<ConversationDetail | null> {
  const row = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      OR: [{ renterId: userId }, { ownerId: userId }],
    },
    select: {
      id: true,
      listingId: true,
      renterId: true,
      ownerId: true,
      renterLastReadAt: true,
      ownerLastReadAt: true,
      listing: {
        select: {
          id: true,
          title: true,
          status: true,
          pricePerDay: true,
          pricePerWeek: true,
          pricePerMonth: true,
          securityDeposit: true,
        },
      },
      renter: { select: counterpartySelect },
      owner: { select: counterpartySelect },
      offers: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          bookingId: true,
          proposedById: true,
          recipientId: true,
          startDate: true,
          endDate: true,
          totalPrice: true,
          securityDeposit: true,
          status: true,
          expiresAt: true,
          respondedAt: true,
          createdAt: true,
          agreedBy: { select: { id: true } },
        },
      },
    },
  });

  if (!row) {
    return null;
  }

  const role = participantRole(row, userId);

  if (!role) {
    return null;
  }

  const bookings = await prisma.booking.findMany({
    where: { listingId: row.listingId, renterId: row.renterId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      startDate: true,
      endDate: true,
      totalPrice: true,
      securityDeposit: true,
      agreedOfferId: true,
      paymentId: true,
    },
  });

  const other = role === "renter" ? row.owner : row.renter;

  return {
    id: row.id,
    role,
    listing: row.listing,
    counterparty: {
      id: other.id,
      name: other.name,
      image: other.avatarUrl ?? other.image,
      active: isActiveAccount(other),
    },
    counterpartyLastReadAt: lastReadAtFor(
      row,
      role === "renter" ? "owner" : "renter"
    ),
    lastReadAt: lastReadAtFor(row, role),
    bookings: bookings.map(({ paymentId, ...booking }) => ({
      ...booking,
      termsAmendable: bookingTermsAmendable({
        status: booking.status,
        paymentId,
      }),
    })),
    offers: row.offers.map(({ agreedBy, ...offer }) => ({
      ...offer,
      status: effectiveOfferStatus(offer, now),
      agreedByBookingId: agreedBy?.id ?? null,
    })),
  };
}

/**
 * Everything `adminConversationGrounds` needs about one conversation, or `null` if it does not exist.
 *
 * No participant filter - this is the administrator path, and it returns grounds, not messages.
 */
export async function getAdminGroundInputs(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, listingId: true, renterId: true, ownerId: true },
  });

  if (!conversation) {
    return null;
  }

  const rental = {
    listingId: conversation.listingId,
    renterId: conversation.renterId,
  };

  const [claims, handovers, reports] = await Promise.all([
    prisma.damageClaim.findMany({
      where: { booking: rental },
      select: { id: true, status: true, respondentId: true },
    }),
    prisma.handoverRecord.findMany({
      where: { booking: rental },
      select: { id: true, confirmation: true, recordedById: true },
    }),
    prisma.report.findMany({
      where: {
        type: ReportType.USER,
        OR: [
          { reporterId: conversation.renterId, targetId: conversation.ownerId },
          { reporterId: conversation.ownerId, targetId: conversation.renterId },
        ],
      },
      select: {
        id: true,
        type: true,
        status: true,
        reporterId: true,
        targetId: true,
      },
    }),
  ]);

  return { conversation, claims, handovers, reports };
}

/**
 * Whether this user is a participant. The cheap check the thread's layout runs before the first
 * byte, so a stranger's request is a real 404 - see AGENTS.md on `loading.tsx` and status codes.
 */
export async function isConversationParticipant(
  conversationId: string,
  userId: string
): Promise<boolean> {
  const found = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      OR: [{ renterId: userId }, { ownerId: userId }],
    },
    select: { id: true },
  });

  return found !== null;
}

/** The conversation for a rental, if the two people have one. For the admin booking screen. */
export async function findConversationIdForRental(
  listingId: string,
  renterId: string
): Promise<string | null> {
  const found = await prisma.conversation.findUnique({
    where: { listingId_renterId: { listingId, renterId } },
    select: { id: true },
  });

  return found?.id ?? null;
}

export interface AdminConversationHeader {
  id: string;
  listing: { id: string; title: string };
  renter: { id: string; name: string | null; email: string };
  owner: { id: string; name: string | null; email: string };
}

/**
 * Who and what a conversation is about - no messages.
 *
 * Shown to an administrator before they choose a ground, so they know whose conversation they are
 * about to open. Everything here is already visible on the admin booking and member screens.
 */
export async function getAdminConversationHeader(
  conversationId: string
): Promise<AdminConversationHeader | null> {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      listing: { select: { id: true, title: true } },
      renter: { select: { id: true, name: true, email: true } },
      owner: { select: { id: true, name: true, email: true } },
    },
  });
}

/**
 * Every offer in a conversation, newest first, with effective status. For the administrator's read,
 * which is logged by its caller before this runs - see `readConversationAsAdmin`.
 */
export async function getConversationOffers(
  conversationId: string,
  now: Date = new Date()
): Promise<OfferView[]> {
  const rows = await prisma.offer.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      bookingId: true,
      proposedById: true,
      recipientId: true,
      startDate: true,
      endDate: true,
      totalPrice: true,
      securityDeposit: true,
      status: true,
      expiresAt: true,
      respondedAt: true,
      createdAt: true,
      agreedBy: { select: { id: true } },
    },
  });

  return rows.map(({ agreedBy, ...offer }) => ({
    ...offer,
    status: effectiveOfferStatus(offer, now),
    agreedByBookingId: agreedBy?.id ?? null,
  }));
}
