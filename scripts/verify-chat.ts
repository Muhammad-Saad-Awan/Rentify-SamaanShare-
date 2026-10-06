// Chat and offers, verified against a real database.
//
// The unit tests cover the pure rules. This covers what they cannot: that the money invariants are
// enforced by the DATABASE, so a write that skips the rules is refused anyway. Every trigger and
// CHECK constraint in migration 20261006120000_chat_and_offers is exercised here, along with the
// cleanup order that teardown code depends on.
//
// Creates its own throwaway rows and deletes them.

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  AdminActionType,
  BookingStatus,
  ClaimReason,
  MessageKind,
  OfferStatus,
  PaymentMethod,
  PaymentStatus,
  ReportReason,
  ReportStatus,
  ReportType,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/enums";
import {
  listAdminGrounds,
  readConversationAsAdmin,
} from "../src/lib/chat/admin-read";
import {
  bookingTermsFromOffer,
  OFFER_NOT_FOUND_ERROR,
  offerExpiresAt,
  TERMS_LOCKED_ERROR,
} from "../src/lib/chat/offers";
import {
  CONVERSATION_CLOSED_ERROR,
  CONVERSATION_NOT_FOUND_ERROR,
  MESSAGE_PAGE_SIZE,
} from "../src/lib/chat/rules";
import { postBookingThreadLine } from "../src/lib/chat/booking-events";
import * as chat from "../src/lib/chat/write";
import {
  getConversationForParticipant,
  getMessagesPage,
  getUnreadCounts,
  listConversations,
} from "../src/lib/queries/chat";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}`, detail ?? "");
  }
}

/**
 * Runs a write that must be refused, and reports whether the database refused it for the expected
 * reason. A write refused for some other reason - a typo in the fixture - is a failure, not a pass.
 */
async function refused(
  label: string,
  write: () => Promise<unknown>,
  expected: string
) {
  try {
    await write();
    check(label, false, "the write succeeded");
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);

    check(label, message.includes(expected), message.slice(0, 300));
  }
}

async function allowed(label: string, write: () => Promise<unknown>) {
  try {
    await write();
    check(label, true);
  } catch (error) {
    check(label, false, String(error).slice(0, 300));
  }
}

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

async function main() {
  const stamp = Date.now();
  const now = new Date();
  const sub = await prisma.subcategory.findFirstOrThrow({
    select: { id: true, categoryId: true },
  });

  const [owner, renter, other] = await Promise.all(
    ["owner", "renter", "other"].map((role) =>
      prisma.user.create({
        data: {
          email: `chat-${role}-${stamp}@example.test`,
          name: `Chat ${role}`,
        },
        select: { id: true },
      })
    )
  );

  const listing = await prisma.listing.create({
    data: {
      ownerId: owner!.id,
      categoryId: sub.categoryId,
      subcategoryId: sub.id,
      title: "Chat Verify Tent",
      description: "Throwaway listing for chat verification.",
      condition: "GOOD",
      pricePerDay: 2000,
      securityDeposit: 20_000,
      city: "karachi",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  const conversation = await prisma.conversation.create({
    data: { listingId: listing.id, renterId: renter!.id, ownerId: owner!.id },
    select: { id: true },
  });
  const otherConversation = await prisma.conversation.create({
    data: { listingId: listing.id, renterId: other!.id, ownerId: owner!.id },
    select: { id: true },
  });

  const terms = {
    startDate: day("2027-11-10"),
    endDate: day("2027-11-12"),
    totalPrice: 4500,
    securityDeposit: 5000,
  };

  function newOffer(
    overrides: Partial<{
      conversationId: string;
      bookingId: string;
      proposedById: string;
      recipientId: string;
      totalPrice: number;
      securityDeposit: number;
      status: OfferStatus;
    }> = {}
  ) {
    return prisma.offer.create({
      data: {
        conversationId: conversation.id,
        proposedById: renter!.id,
        recipientId: owner!.id,
        ...terms,
        expiresAt: offerExpiresAt(now),
        ...overrides,
      },
    });
  }

  function accept(offerId: string) {
    return prisma.offer.update({
      where: { id: offerId },
      data: { status: OfferStatus.ACCEPTED, respondedAt: new Date() },
    });
  }

  // ------------------------------------------------------------ shape checks
  console.log("\n=== shape constraints ===");

  await refused(
    "a member cannot open a conversation with themselves",
    () =>
      prisma.conversation.create({
        data: {
          listingId: listing.id,
          renterId: owner!.id,
          ownerId: owner!.id,
        },
      }),
    "conversations_renter_not_owner_check"
  );
  await refused(
    "a second conversation for the same listing and renter is refused",
    () =>
      prisma.conversation.create({
        data: {
          listingId: listing.id,
          renterId: renter!.id,
          ownerId: owner!.id,
        },
      }),
    "Unique constraint"
  );
  await refused(
    "a TEXT message must have a non-blank body",
    () =>
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: renter!.id,
          kind: MessageKind.TEXT,
          body: "   ",
        },
      }),
    "messages_kind_shape_check"
  );
  await refused(
    "a SYSTEM message has no sender",
    () =>
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: renter!.id,
          kind: MessageKind.SYSTEM,
          body: "Booking approved",
        },
      }),
    "messages_kind_shape_check"
  );

  const clientId = crypto.randomUUID();

  await allowed("a TEXT message with a body is written", () =>
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: renter!.id,
        body: "Is the tent waterproof?",
        clientId,
      },
    })
  );
  await refused(
    "a retried send with the same clientId cannot write a second copy",
    () =>
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId: renter!.id,
          body: "Is the tent waterproof?",
          clientId,
        },
      }),
    "Unique constraint"
  );
  await refused(
    "an offer cannot be addressed to its own proposer",
    () => newOffer({ recipientId: renter!.id }),
    "offers_terms_check"
  );
  await refused(
    "an offer cannot have a zero rent",
    () => newOffer({ totalPrice: 0 }),
    "offers_terms_check"
  );

  // --------------------------------------------------------- offer immutability
  console.log("\n=== an offer's terms are a permanent snapshot ===");

  await refused(
    "an offer cannot be created already accepted",
    () => newOffer({ status: OfferStatus.ACCEPTED }),
    "TERMS_LOCKED"
  );

  const preBooking = await newOffer();

  await refused(
    "the terms of a PENDING offer cannot be edited",
    () =>
      prisma.offer.update({
        where: { id: preBooking.id },
        data: { totalPrice: 1 },
      }),
    "TERMS_LOCKED"
  );
  await refused(
    "an offer cannot leave PENDING without recording when",
    () =>
      prisma.offer.update({
        where: { id: preBooking.id },
        data: { status: OfferStatus.ACCEPTED },
      }),
    "offers_responded_check"
  );
  await allowed("the recipient's acceptance is recorded", () =>
    accept(preBooking.id)
  );
  await refused(
    "an accepted offer cannot be declined afterwards",
    () =>
      prisma.offer.update({
        where: { id: preBooking.id },
        data: { status: OfferStatus.DECLINED },
      }),
    "TERMS_LOCKED"
  );
  await refused(
    "an accepted offer's deposit cannot be edited",
    () =>
      prisma.offer.update({
        where: { id: preBooking.id },
        data: { securityDeposit: 0 },
      }),
    "TERMS_LOCKED"
  );

  // ------------------------------------------------- booking carries its offer
  console.log("\n=== a booking carries exactly the terms it names ===");

  const bookingBase = {
    listingId: listing.id,
    renterId: renter!.id,
    ownerId: owner!.id,
    conversationId: conversation.id,
    status: BookingStatus.PENDING,
  };

  await refused(
    "a booking cannot name an offer and carry different rent",
    () =>
      prisma.booking.create({
        data: {
          ...bookingBase,
          ...bookingTermsFromOffer(preBooking),
          totalPrice: preBooking.totalPrice + 1,
        },
      }),
    "TERMS_LOCKED"
  );
  await refused(
    "another renter cannot book with this conversation's offer",
    () =>
      prisma.booking.create({
        data: {
          ...bookingBase,
          renterId: other!.id,
          conversationId: otherConversation.id,
          ...bookingTermsFromOffer(preBooking),
        },
      }),
    "TERMS_LOCKED"
  );

  const pendingOffer = await newOffer({ totalPrice: 3000 });

  await refused(
    "a booking cannot name an offer that was never accepted",
    () =>
      prisma.booking.create({
        data: { ...bookingBase, ...bookingTermsFromOffer(pendingOffer) },
      }),
    "TERMS_LOCKED"
  );

  const booking = await prisma.booking.create({
    data: { ...bookingBase, ...bookingTermsFromOffer(preBooking) },
    select: { id: true, totalPrice: true },
  });

  check(
    "a booking made from an accepted offer carries its rent",
    booking.totalPrice === preBooking.totalPrice
  );

  await refused(
    "one accepted offer cannot be used for a second booking",
    () =>
      prisma.booking.create({
        data: {
          ...bookingBase,
          ...bookingTermsFromOffer(preBooking),
        },
      }),
    "Unique constraint"
  );

  // ------------------------------------------------- later listing edits
  console.log("\n=== a listing edit does not reach agreed terms ===");

  await prisma.listing.update({
    where: { id: listing.id },
    data: { pricePerDay: 9000, securityDeposit: 90_000 },
  });

  const afterEdit = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    select: { totalPrice: true, securityDeposit: true },
  });
  const offerAfterEdit = await prisma.offer.findUniqueOrThrow({
    where: { id: preBooking.id },
    select: { totalPrice: true, securityDeposit: true },
  });

  check(
    "the booking keeps the agreed rent and deposit",
    afterEdit.totalPrice === terms.totalPrice &&
      afterEdit.securityDeposit === terms.securityDeposit,
    afterEdit
  );
  check(
    "the offer keeps the agreed rent and deposit",
    offerAfterEdit.totalPrice === terms.totalPrice &&
      offerAfterEdit.securityDeposit === terms.securityDeposit,
    offerAfterEdit
  );

  // -------------------------------------------------- renegotiation
  console.log("\n=== terms move only through a newly accepted offer ===");

  await refused(
    "a booking's rent cannot be edited directly",
    () =>
      prisma.booking.update({
        where: { id: booking.id },
        data: { totalPrice: 100 },
      }),
    "TERMS_LOCKED"
  );

  const amendment = await newOffer({
    bookingId: booking.id,
    proposedById: owner!.id,
    recipientId: renter!.id,
    totalPrice: 4000,
    securityDeposit: 4000,
  });

  await refused(
    "a booking cannot adopt a counter-offer before it is accepted",
    () =>
      prisma.booking.update({
        where: { id: booking.id },
        data: bookingTermsFromOffer(amendment),
      }),
    "TERMS_LOCKED"
  );

  await accept(amendment.id);

  await allowed("an accepted counter-offer renegotiates the booking", () =>
    prisma.booking.update({
      where: { id: booking.id },
      data: bookingTermsFromOffer(amendment),
    })
  );
  await refused(
    "a booking cannot drop back to listing-rate terms",
    () =>
      prisma.booking.update({
        where: { id: booking.id },
        data: { agreedOfferId: null },
      }),
    "TERMS_LOCKED"
  );
  await refused(
    "an accepted offer carried by a booking cannot be deleted",
    () => prisma.offer.delete({ where: { id: amendment.id } }),
    "TERMS_LOCKED"
  );

  // ------------------------------------------------------ payment lock
  console.log("\n=== terms are final once a payment exists ===");

  const payment = await prisma.payment.create({
    data: {
      method: PaymentMethod.BANK_TRANSFER,
      status: PaymentStatus.PENDING_VERIFICATION,
      amount: amendment.totalPrice,
      securityDeposit: amendment.securityDeposit,
    },
    select: { id: true },
  });

  await allowed("the payment row is attached at PAYMENT_PENDING", () =>
    prisma.booking.update({
      where: { id: booking.id },
      data: { paymentId: payment.id, status: BookingStatus.PAYMENT_PENDING },
    })
  );

  const late = await newOffer({
    bookingId: booking.id,
    proposedById: owner!.id,
    recipientId: renter!.id,
    totalPrice: 1000,
    securityDeposit: 0,
  });

  await accept(late.id);

  await refused(
    "an accepted offer cannot change a booking that has a payment",
    () =>
      prisma.booking.update({
        where: { id: booking.id },
        data: bookingTermsFromOffer(late),
      }),
    "TERMS_LOCKED"
  );
  await refused(
    "a booking cannot be moved to a different payment",
    () =>
      prisma.booking.update({
        where: { id: booking.id },
        data: { paymentId: null },
      }),
    "TERMS_LOCKED"
  );
  await allowed("the payment can still be verified", () =>
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.COMPLETED, confirmedAt: new Date() },
    })
  );
  await refused(
    "a verified payment's amount cannot be changed",
    () =>
      prisma.payment.update({
        where: { id: payment.id },
        data: { amount: 1 },
      }),
    "TERMS_LOCKED"
  );
  await allowed("the booking's lifecycle still moves", () =>
    prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.ACTIVE, startedAt: new Date() },
    })
  );

  // ---------------------------------------------------------------- cleanup
  console.log("\n=== cleanup, in the order teardown code uses ===");

  const conversationIds = [conversation.id, otherConversation.id];

  await allowed(
    "messages, then the booking (cascading its offers)",
    async () => {
      await prisma.message.deleteMany({
        where: { conversationId: { in: conversationIds } },
      });
      await prisma.booking.deleteMany({ where: { listingId: listing.id } });
    }
  );
  await allowed(
    "then the remaining offers, conversations, payment, listing and users",
    async () => {
      await prisma.offer.deleteMany({
        where: { conversationId: { in: conversationIds } },
      });
      await prisma.conversation.deleteMany({
        where: { id: { in: conversationIds } },
      });
      await prisma.payment.deleteMany({ where: { id: payment.id } });
      await prisma.listing.deleteMany({ where: { id: listing.id } });
      await prisma.user.deleteMany({
        where: { id: { in: [owner!.id, renter!.id, other!.id] } },
      });
    }
  );

  await verifyWriteLayer();

  console.log(
    failures === 0
      ? "\nALL CHAT CHECKS PASSED\n"
      : `\n${failures} CHECK(S) FAILED\n`
  );

  process.exitCode = failures === 0 ? 0 : 1;
}

/**
 * The write layer the actions call, driven directly - everything but the session, rate limits and
 * publishing, which are the actions' own few lines.
 */
async function verifyWriteLayer() {
  const stamp = Date.now();
  const today = "2026-10-06";
  const sub = await prisma.subcategory.findFirstOrThrow({
    select: { id: true, categoryId: true },
  });

  const [owner, renter, stranger, admin] = await Promise.all(
    ["owner", "renter", "stranger", "admin"].map((role) =>
      prisma.user.create({
        data: {
          email: `chatw-${role}-${stamp}@example.test`,
          name: `ChatW ${role}`,
          ...(role === "admin" ? { role: UserRole.ADMIN } : {}),
        },
        select: { id: true },
      })
    )
  ).then((users) => users.map((user) => user!.id));

  const listing = await prisma.listing.create({
    data: {
      ownerId: owner!,
      categoryId: sub.categoryId,
      subcategoryId: sub.id,
      title: "ChatW Verify Drill",
      description: "Throwaway listing for chat write verification.",
      condition: "GOOD",
      pricePerDay: 2000,
      securityDeposit: 20_000,
      city: "karachi",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  const allow = async () => ({ allowed: true as const });

  // ------------------------------------------------------------- conversations
  console.log("\n=== write layer: opening a conversation ===");

  const own = await chat.startConversation({
    userId: owner!,
    listingId: listing.id,
    beforeCreate: allow,
  });

  check("an owner cannot open a conversation about their own listing", !own.ok);

  let gateCalls = 0;
  const gated = async () => {
    gateCalls += 1;

    return { allowed: true as const };
  };

  const opened = await chat.startConversation({
    userId: renter!,
    listingId: listing.id,
    beforeCreate: gated,
  });
  const reopened = await chat.startConversation({
    userId: renter!,
    listingId: listing.id,
    beforeCreate: gated,
  });

  check(
    "a renter opens a conversation, and reopening returns the same one",
    opened.ok &&
      reopened.ok &&
      opened.data.created &&
      !reopened.data.created &&
      opened.data.conversationId === reopened.data.conversationId
  );
  check("the first-contact gate runs only for first contact", gateCalls === 1);

  const refusedGate = await chat.startConversation({
    userId: stranger!,
    listingId: listing.id,
    beforeCreate: async () => ({ allowed: false, reason: "gated" }),
  });

  check(
    "a refused gate creates nothing",
    !refusedGate.ok &&
      (await prisma.conversation.count({ where: { renterId: stranger! } })) ===
        0
  );

  if (!opened.ok) {
    throw new Error("Cannot continue without a conversation.");
  }

  const conversationId = opened.data.conversationId;

  check(
    "an opened conversation with no messages stays out of the owner's inbox",
    !(await listConversations(owner!)).some((c) => c.id === conversationId)
  );

  // ------------------------------------------------------------------ messages
  console.log("\n=== write layer: messages ===");

  const intruder = await chat.sendMessage({
    userId: stranger!,
    conversationId,
    body: "hello",
  });

  check(
    "a stranger is told the conversation does not exist",
    !intruder.ok && intruder.error === CONVERSATION_NOT_FOUND_ERROR
  );

  const clientId = crypto.randomUUID();
  const first = await chat.sendMessage({
    userId: renter!,
    conversationId,
    body: "Does it come with bits?",
    clientId,
  });
  const retry = await chat.sendMessage({
    userId: renter!,
    conversationId,
    body: "Does it come with bits?",
    clientId,
  });

  check(
    "a message is delivered to both participants",
    first.ok &&
      first.deliveries.length === 2 &&
      new Set(first.deliveries.map((d) => d.userId)).size === 2
  );
  check(
    "a retried send returns the first copy and publishes nothing",
    first.ok &&
      retry.ok &&
      retry.data.message.id === first.data.message.id &&
      retry.deliveries.length === 0
  );

  const raceId = crypto.randomUUID();
  const raced = await Promise.all(
    [1, 2].map(() =>
      chat.sendMessage({
        userId: renter!,
        conversationId,
        body: "Racing",
        clientId: raceId,
      })
    )
  );

  check(
    "two concurrent sends of one message write it once",
    raced.every((r) => r.ok) &&
      (await prisma.message.count({ where: { clientId: raceId } })) === 1
  );

  // -------------------------------------------------------------------- unread
  console.log("\n=== write layer: unread and read cursors ===");

  const inbox = await listConversations(owner!);

  check(
    "once written to, it appears in the owner's inbox with its unread count",
    inbox.find((c) => c.id === conversationId)?.unread === 2,
    inbox
  );
  check(
    "the owner has two unread messages; the sender has none",
    (await getUnreadCounts(owner!)).get(conversationId) === 2 &&
      !(await getUnreadCounts(renter!)).has(conversationId)
  );

  const read = await chat.markConversationRead({
    userId: owner!,
    conversationId,
  });

  check(
    "marking read clears the count and tells both sides",
    read.ok &&
      read.deliveries.length === 2 &&
      !(await getUnreadCounts(owner!)).has(conversationId)
  );

  const backwards = await chat.markConversationRead({
    userId: owner!,
    conversationId,
    now: new Date(Date.now() - 3_600_000),
  });

  check(
    "a stale tab cannot move a read cursor backwards",
    backwards.ok &&
      backwards.data.readAt === null &&
      backwards.deliveries.length === 0
  );

  // ------------------------------------------------------------------ offers
  console.log("\n=== write layer: offers ===");

  const offerTerms = {
    conversationId,
    startDate: "2027-03-10",
    endDate: "2027-03-12",
    totalPrice: 5000,
    securityDeposit: 10_000,
  };

  const a = await chat.proposeOffer({
    userId: renter!,
    input: offerTerms,
    today,
  });
  const b = await chat.proposeOffer({
    userId: renter!,
    input: { ...offerTerms, totalPrice: 5500 },
    today,
  });

  check("a renter can propose terms", a.ok && b.ok);

  if (!a.ok || !b.ok) {
    throw new Error("Cannot continue without offers.");
  }

  const statusOf = async (id: string) =>
    (
      await prisma.offer.findUniqueOrThrow({
        where: { id },
        select: { status: true },
      })
    ).status;

  check(
    "a counter-offer supersedes the open one",
    (await statusOf(a.data.offerId)) === OfferStatus.SUPERSEDED &&
      (await statusOf(b.data.offerId)) === OfferStatus.PENDING
  );

  await Promise.all(
    [6000, 6500].map((totalPrice) =>
      chat.proposeOffer({
        userId: owner!,
        input: { ...offerTerms, totalPrice },
        today,
      })
    )
  );

  check(
    "two concurrent proposals leave exactly one open offer",
    (await prisma.offer.count({
      where: { conversationId, status: OfferStatus.PENDING },
    })) === 1
  );

  const counter = await chat.proposeOffer({
    userId: owner!,
    input: offerTerms,
    today,
  });

  if (!counter.ok) {
    throw new Error("Cannot continue without a counter-offer.");
  }

  const ownAccept = await chat.respondToOffer({
    userId: owner!,
    offerId: counter.data.offerId,
    response: "accept",
    today,
  });
  const strangerAccept = await chat.respondToOffer({
    userId: stranger!,
    offerId: counter.data.offerId,
    response: "accept",
    today,
  });
  const ownerWithdrawsOthers = await chat.withdrawOffer({
    userId: renter!,
    offerId: counter.data.offerId,
  });

  check("a proposer cannot accept their own offer", !ownAccept.ok);
  check(
    "a stranger cannot see the offer",
    !strangerAccept.ok && strangerAccept.error === OFFER_NOT_FOUND_ERROR
  );
  check("only the proposer can withdraw", !ownerWithdrawsOthers.ok);

  const accepted = await Promise.all(
    [1, 2].map(() =>
      chat.respondToOffer({
        userId: renter!,
        offerId: counter.data.offerId,
        response: "accept",
        today,
      })
    )
  );

  check(
    "two concurrent acceptances: one succeeds, one is refused",
    accepted.filter((r) => r.ok).length === 1
  );
  check(
    "the acceptance is a SYSTEM line in the thread, unread for the other side",
    (await prisma.message.count({
      where: {
        conversationId,
        kind: MessageKind.SYSTEM,
        offerId: counter.data.offerId,
      },
    })) === 1 && ((await getUnreadCounts(owner!)).get(conversationId) ?? 0) > 0
  );

  // ------------------------------------------------- booking from the offer
  console.log("\n=== write layer: renegotiating a booking ===");

  const agreed = await prisma.offer.findUniqueOrThrow({
    where: { id: counter.data.offerId },
  });

  // What `createBookingRequest` writes; the action itself needs a session.
  const booking = await prisma.booking.create({
    data: {
      listingId: listing.id,
      renterId: renter!,
      ownerId: owner!,
      conversationId,
      status: BookingStatus.PENDING,
      ...bookingTermsFromOffer(agreed),
    },
    select: { id: true },
  });

  const wrongDates = await chat.proposeOffer({
    userId: owner!,
    input: { ...offerTerms, bookingId: booking.id, endDate: "2027-03-13" },
    today,
  });

  check("an offer on a booking must keep its dates", !wrongDates.ok);

  const cheaper = await chat.proposeOffer({
    userId: owner!,
    input: { ...offerTerms, bookingId: booking.id, totalPrice: 4000 },
    today,
  });

  if (!cheaper.ok) {
    throw new Error("Cannot continue without a booking offer.");
  }

  const renegotiated = await chat.respondToOffer({
    userId: renter!,
    offerId: cheaper.data.offerId,
    response: "accept",
    today,
  });

  const afterRenegotiation = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    select: { totalPrice: true, agreedOfferId: true },
  });

  check(
    "accepting a booking offer renegotiates the booking in the same step",
    renegotiated.ok &&
      afterRenegotiation.totalPrice === 4000 &&
      afterRenegotiation.agreedOfferId === cheaper.data.offerId
  );

  // ---------------------------------------------------------- payment race
  console.log("\n=== write layer: payment ends renegotiation ===");

  const late = await chat.proposeOffer({
    userId: owner!,
    input: { ...offerTerms, bookingId: booking.id, totalPrice: 3000 },
    today,
  });

  const stale = await prisma.payment.create({
    data: {
      method: PaymentMethod.BANK_TRANSFER,
      amount: 9999,
      securityDeposit: 10_000,
    },
    select: { id: true },
  });

  await refused(
    "a payment that does not match the booking's terms cannot be attached",
    () =>
      prisma.booking.update({
        where: { id: booking.id },
        data: { paymentId: stale.id },
      }),
    "TERMS_LOCKED"
  );

  const payment = await prisma.payment.create({
    data: {
      method: PaymentMethod.BANK_TRANSFER,
      amount: 4000,
      securityDeposit: 10_000,
    },
    select: { id: true },
  });

  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: BookingStatus.PAYMENT_PENDING, paymentId: payment.id },
  });

  const lateAccept = late.ok
    ? await chat.respondToOffer({
        userId: renter!,
        offerId: late.data.offerId,
        response: "accept",
        today,
      })
    : null;

  check(
    "an offer accepted after payment began is refused and rolled back",
    late.ok &&
      lateAccept !== null &&
      !lateAccept.ok &&
      lateAccept.error === TERMS_LOCKED_ERROR &&
      (await statusOf(late.data.offerId)) === OfferStatus.PENDING &&
      (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }))
        .totalPrice === 4000
  );

  const afterPayment = await chat.proposeOffer({
    userId: owner!,
    input: { ...offerTerms, bookingId: booking.id, totalPrice: 2000 },
    today,
  });

  check(
    "no new offer can be made on a booking with a payment",
    !afterPayment.ok
  );

  const detail = await getConversationForParticipant(conversationId, owner!);

  check(
    "the thread view reports the booking's terms as final",
    detail?.bookings.find((b) => b.id === booking.id)?.termsAmendable === false
  );
  check(
    "the thread view is not available to a stranger",
    (await getConversationForParticipant(conversationId, stranger!)) === null
  );

  // ------------------------------------------------------------ pagination
  console.log("\n=== write layer: paging a thread ===");

  const existing = await prisma.message.count({ where: { conversationId } });

  for (let index = 0; index < MESSAGE_PAGE_SIZE + 5 - existing; index += 1) {
    await prisma.message.create({
      data: { conversationId, senderId: owner!, body: `filler ${index}` },
    });
  }

  const total = await prisma.message.count({ where: { conversationId } });
  const newest = await getMessagesPage(conversationId);
  const older = await getMessagesPage(conversationId, newest.messages[0]!.id);
  const ids = new Set([...newest.messages, ...older.messages].map((m) => m.id));

  check(
    "two pages cover the thread exactly, without overlap",
    newest.messages.length === MESSAGE_PAGE_SIZE &&
      newest.hasOlder &&
      !older.hasOlder &&
      ids.size === total,
    { total, first: newest.messages.length, second: older.messages.length }
  );

  // ------------------------------------------------------------ admin read
  console.log("\n=== write layer: administrator access ===");

  const dismissed = await prisma.report.create({
    data: {
      reporterId: renter!,
      type: ReportType.USER,
      targetId: owner!,
      reason: ReportReason.HARASSMENT,
      status: ReportStatus.DISMISSED,
    },
    select: { id: true },
  });

  check(
    "with no claim, dispute or live report there are no grounds",
    (await listAdminGrounds(conversationId))?.length === 0
  );

  const noGround = await readConversationAsAdmin({
    adminId: admin!,
    conversationId,
    ground: { kind: "report", id: dismissed.id },
    reason: "Checking the dismissed report again.",
  });

  check(
    "a read without grounds is refused and leaves no audit row",
    !noGround.ok &&
      (await prisma.adminAction.count({ where: { conversationId } })) === 0
  );

  const claim = await prisma.damageClaim.create({
    data: {
      bookingId: booking.id,
      claimantId: owner!,
      respondentId: renter!,
      reason: ClaimReason.DAMAGED,
      description: "Chuck is cracked.",
      amountClaimed: 5000,
    },
    select: { id: true },
  });

  const adminRead = await readConversationAsAdmin({
    adminId: admin!,
    conversationId,
    ground: { kind: "claim", id: claim.id },
    reason: "Reviewing the damage claim on this rental.",
  });
  const audit = await prisma.adminAction.findMany({
    where: { conversationId },
    select: { type: true, subjectId: true, actorId: true, newValue: true },
  });

  check(
    "a claim is a ground, and reading it writes one audit row about the respondent",
    adminRead.ok &&
      adminRead.page.messages.length > 0 &&
      audit.length === 1 &&
      audit[0]!.type === AdminActionType.VIEW_CONVERSATION &&
      audit[0]!.subjectId === renter &&
      audit[0]!.actorId === admin &&
      audit[0]!.newValue === `claim:${claim.id}`,
    audit
  );

  // ------------------------------------------------------ booking event lines
  console.log("\n=== write layer: booking events in the thread ===");

  await chat.markConversationRead({ userId: owner!, conversationId });
  await chat.markConversationRead({ userId: renter!, conversationId });

  await prisma.$transaction((tx) =>
    postBookingThreadLine(tx, {
      bookingId: booking.id,
      event: { event: "picked-up" },
      actorId: owner!,
    })
  );

  const line = await prisma.message.findFirst({
    where: { conversationId, kind: MessageKind.SYSTEM },
    orderBy: { createdAt: "desc" },
    select: { body: true },
  });

  check(
    "a booking event writes a SYSTEM line naming the booking",
    line?.body?.includes("the item was collected") === true,
    line
  );
  check(
    "it is unread for the other side, not for the member who caused it",
    (await getUnreadCounts(renter!)).get(conversationId) === 1 &&
      !(await getUnreadCounts(owner!)).has(conversationId)
  );

  // A booking made before chat existed: no link, but the pair's conversation is still found.
  await prisma.booking.update({
    where: { id: booking.id },
    data: { conversationId: null },
  });
  await prisma.$transaction((tx) =>
    postBookingThreadLine(tx, {
      bookingId: booking.id,
      event: { event: "returned" },
      actorId: null,
    })
  );

  check(
    "an unlinked booking's line still reaches the pair's conversation",
    (await prisma.message.count({
      where: { conversationId, body: { contains: "was returned" } },
    })) === 1
  );

  // ------------------------------------------------------------ closed thread
  console.log("\n=== write layer: a closed thread ===");

  await prisma.user.update({
    where: { id: owner! },
    data: { status: UserStatus.SUSPENDED },
  });

  const toSuspended = await chat.sendMessage({
    userId: renter!,
    conversationId,
    body: "Are you there?",
  });

  check(
    "nobody can write to a suspended member",
    !toSuspended.ok && toSuspended.error === CONVERSATION_CLOSED_ERROR
  );
  check(
    "but the renter can still read the thread",
    (await getConversationForParticipant(conversationId, renter!)) !== null
  );

  // ---------------------------------------------------------------- cleanup
  console.log("\n=== write layer: cleanup ===");

  await allowed("all write-layer rows are removed", async () => {
    await prisma.damageClaim.deleteMany({ where: { id: claim.id } });
    await prisma.report.deleteMany({ where: { id: dismissed.id } });
    await prisma.adminAction.deleteMany({ where: { conversationId } });
    await prisma.message.deleteMany({ where: { conversationId } });
    await prisma.booking.deleteMany({ where: { listingId: listing.id } });
    await prisma.offer.deleteMany({ where: { conversationId } });
    await prisma.conversation.deleteMany({ where: { id: conversationId } });
    await prisma.payment.deleteMany({
      where: { id: { in: [payment.id, stale.id] } },
    });
    await prisma.listing.deleteMany({ where: { id: listing.id } });
    await prisma.user.deleteMany({
      where: { id: { in: [owner!, renter!, stranger!, admin!] } },
    });
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
