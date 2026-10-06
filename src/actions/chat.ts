"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  EMAIL_CONFIRMATION_REQUIRED_ERROR,
  needsEmailConfirmation,
} from "@/lib/auth/email-gate";
import { getActiveAdmin, getActiveUser } from "@/lib/auth/session";
import {
  listAdminGrounds,
  readConversationAsAdmin,
} from "@/lib/chat/admin-read";
import {
  CONVERSATION_BURST_LIMIT,
  CONVERSATION_NOT_FOUND_ERROR,
  MESSAGE_RATE_LIMIT,
  OFFER_RATE_LIMIT,
  START_CONVERSATION_RATE_LIMIT,
} from "@/lib/chat/rules";
import * as chat from "@/lib/chat/write";
import { checkRateLimit } from "@/lib/rate-limit";
import { getMessagesPage } from "@/lib/queries/chat";
import { publishChatAfterCommit } from "@/lib/realtime/publish";
import { todayInKarachi } from "@/lib/utils/date";
import {
  adminViewConversationSchema,
  markReadSchema,
  proposeOfferSchema,
  respondToOfferSchema,
  sendMessageSchema,
  startConversationSchema,
  withdrawOfferSchema,
} from "@/lib/validations/chat";
import { listingIdSchema } from "@/lib/validations/listing";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { AdminViewGround } from "@/lib/chat/admin-access";
import type { ChatWriteResult } from "@/lib/chat/write";
import type { OfferStatus } from "@/generated/prisma/enums";
import type { MessagePage, OfferView } from "@/lib/queries/chat";
import type { PublishableMessage } from "@/lib/realtime/channels";
import type { ActionResult } from "@/types";

/**
 * Chat: conversations, messages and offers.
 *
 * Every action returns an `ActionResult` and none redirects - they are invoked from a composer, a
 * button or a scroll, and the caller has to be able to roll back an optimistic message and say why.
 * Each verifies the caller against the database with `getActiveUser`, so a suspended account
 * cannot send even with a live cookie.
 *
 * THIN BY DESIGN. Parse, session, rate limit, call `@/lib/chat/write`, publish after commit. The
 * rules and the transactions live there, where `verify:chat` can reach them without a session.
 *
 * RATE LIMITS ARE CHECKED AFTER VALIDATION AND BEFORE ANY DATABASE WORK, so a flood is turned away
 * cheaply. They are per-instance - see `checkRateLimit`.
 */

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

const TOO_FAST_ERROR =
  "You are sending messages too quickly. Please wait a moment.";

/** Mark-read and paging fire on scroll and focus, so they get a generous budget of their own. */
const READ_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

/** Offer answers per user per hour. Separate from proposals, which have their own key. */
const RESPOND_RATE_LIMIT = { limit: 30, windowMs: 3_600_000 };

/** Administrator reads per hour. Each one writes an audit row. */
const ADMIN_READ_RATE_LIMIT = { limit: 60, windowMs: 3_600_000 };

function firstIssue(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

/**
 * Turns a write result into an action result and schedules its deliveries.
 *
 * Publishing only on success is not a special case: a refusal has no deliveries.
 */
function settle<T>(result: ChatWriteResult<T>): ActionResult<T> {
  if (!result.ok) {
    return { success: false, error: result.error };
  }

  publishChatAfterCommit(result.deliveries);

  return { success: true, data: result.data };
}

/** Runs a write, logging and hiding anything unexpected. */
async function run<T>(
  label: string,
  write: () => Promise<ChatWriteResult<T>>
): Promise<ActionResult<T>> {
  try {
    return settle(await write());
  } catch (error) {
    console.error(`${label} failed`, error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * Opens the renter's conversation about a listing, creating it on first contact.
 *
 * First contact is the only path by which a stranger reaches an owner, so it alone carries the
 * email gate and the hourly limit. Reopening an existing thread carries neither.
 */
export async function startConversation(
  input: unknown
): Promise<ActionResult<{ conversationId: string }>> {
  const parsed = startConversationSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: "That listing is not available." };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  return run("startConversation", async () => {
    const result = await chat.startConversation({
      userId: user.id,
      listingId: parsed.data.listingId,
      beforeCreate: async () => {
        if (await needsEmailConfirmation(user.id)) {
          return { allowed: false, reason: EMAIL_CONFIRMATION_REQUIRED_ERROR };
        }

        const rate = checkRateLimit(
          `chat-start:${user.id}`,
          START_CONVERSATION_RATE_LIMIT
        );

        return rate.allowed
          ? { allowed: true }
          : {
              allowed: false,
              reason:
                "You have started a lot of conversations recently. Please try again later.",
            };
      },
    });

    return result.ok
      ? { ...result, data: { conversationId: result.data.conversationId } }
      : result;
  });
}

const openBookingConversationSchema = z.object({ bookingId: listingIdSchema });

/**
 * Opens the conversation for a booking, from either side. The owner's way in, and the way into a
 * booking made before chat existed. No gate or first-contact limit: the two people already have a
 * booking between them.
 */
export async function openBookingConversation(
  input: unknown
): Promise<ActionResult<{ conversationId: string }>> {
  const parsed = openBookingConversationSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: "That booking was not found." };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  if (!checkRateLimit(`chat-open:${user.id}`, READ_RATE_LIMIT).allowed) {
    return { success: false, error: "Please wait a moment and try again." };
  }

  return run("openBookingConversation", () =>
    chat.openBookingConversation({
      userId: user.id,
      bookingId: parsed.data.bookingId,
    })
  );
}

/** Sends a text message. Idempotent on `clientId` - see `sendMessage` in the write layer. */
export async function sendMessage(
  input: unknown
): Promise<ActionResult<{ message: PublishableMessage }>> {
  const parsed = sendMessageSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: firstIssue(parsed.error, "Please check your message."),
    };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const { conversationId, body, clientId } = parsed.data;

  // Both limits are counted on every attempt, so neither can be dodged by tripping the other.
  const perUser = checkRateLimit(`chat-send:${user.id}`, MESSAGE_RATE_LIMIT);
  const perThread = checkRateLimit(
    `chat-send:${user.id}:${conversationId}`,
    CONVERSATION_BURST_LIMIT
  );

  if (!perUser.allowed || !perThread.allowed) {
    return { success: false, error: TOO_FAST_ERROR };
  }

  return run("sendMessage", () =>
    chat.sendMessage({ userId: user.id, conversationId, body, clientId })
  );
}

/** Marks a conversation read up to now. */
export async function markConversationRead(
  input: unknown
): Promise<ActionResult<{ readAt: Date | null }>> {
  const parsed = markReadSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: CONVERSATION_NOT_FOUND_ERROR };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  if (!checkRateLimit(`chat-read:${user.id}`, READ_RATE_LIMIT).allowed) {
    // Nothing is lost by skipping a read receipt; the next one catches up.
    return { success: true, data: { readAt: null } };
  }

  return run("markConversationRead", () =>
    chat.markConversationRead({
      userId: user.id,
      conversationId: parsed.data.conversationId,
    })
  );
}

const loadOlderSchema = z.object({
  conversationId: listingIdSchema,
  beforeId: listingIdSchema,
});

/** The page of messages before `beforeId`, for scrolling back through a thread. */
export async function loadOlderMessages(
  input: unknown
): Promise<ActionResult<MessagePage>> {
  const parsed = loadOlderSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: CONVERSATION_NOT_FOUND_ERROR };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  if (!checkRateLimit(`chat-page:${user.id}`, READ_RATE_LIMIT).allowed) {
    return { success: false, error: "Please wait a moment and try again." };
  }

  try {
    const context = await chat.loadForParticipant(
      parsed.data.conversationId,
      user.id
    );

    if (!context) {
      return { success: false, error: CONVERSATION_NOT_FOUND_ERROR };
    }

    return {
      success: true,
      data: await getMessagesPage(
        parsed.data.conversationId,
        parsed.data.beforeId
      ),
    };
  } catch (error) {
    console.error("loadOlderMessages failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * Proposes rental terms - before a booking, or against one whose terms can still change.
 *
 * This is the ONLY way a negotiated price is recorded. Free text in a message never is.
 */
export async function proposeOffer(
  input: unknown
): Promise<ActionResult<{ offerId: string }>> {
  const parsed = proposeOfferSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: firstIssue(parsed.error, "Please check the offer."),
    };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(
    `chat-offer:${user.id}:${parsed.data.conversationId}`,
    OFFER_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error:
        "You have made a lot of offers here recently. Please try again later.",
    };
  }

  return run("proposeOffer", () =>
    chat.proposeOffer({
      userId: user.id,
      input: parsed.data,
      today: todayInKarachi(),
    })
  );
}

/**
 * Accepts or declines an offer addressed to the caller.
 *
 * Accepting an offer made against a booking renegotiates that booking in the same transaction, so
 * the booking screens are refreshed too.
 */
export async function respondToOffer(
  input: unknown
): Promise<ActionResult<{ status: OfferStatus }>> {
  const parsed = respondToOfferSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: "That offer was not found." };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  if (!checkRateLimit(`chat-respond:${user.id}`, RESPOND_RATE_LIMIT).allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  const result = await run("respondToOffer", () =>
    chat.respondToOffer({
      userId: user.id,
      offerId: parsed.data.offerId,
      response: parsed.data.response,
      today: todayInKarachi(),
    })
  );

  if (!result.success) {
    return result;
  }

  if (result.data.bookingId) {
    revalidateBookingTerms();
  }

  return { success: true, data: { status: result.data.status } };
}

/** Withdraws the caller's own open offer. */
export async function withdrawOffer(
  input: unknown
): Promise<ActionResult<{ status: OfferStatus }>> {
  const parsed = withdrawOfferSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: "That offer was not found." };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  if (!checkRateLimit(`chat-respond:${user.id}`, RESPOND_RATE_LIMIT).allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  return run("withdrawOffer", () =>
    chat.withdrawOffer({ userId: user.id, offerId: parsed.data.offerId })
  );
}

const adminGroundsSchema = z.object({ conversationId: listingIdSchema });

/**
 * The grounds an administrator could cite for reading a conversation. Reads no messages, so it is
 * not logged; choosing one and reading is.
 */
export async function listConversationGrounds(
  input: unknown
): Promise<ActionResult<{ grounds: AdminViewGround[] }>> {
  const parsed = adminGroundsSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: CONVERSATION_NOT_FOUND_ERROR };
  }

  const admin = await getActiveAdmin();

  if (!admin) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  try {
    const grounds = await listAdminGrounds(parsed.data.conversationId);

    return grounds
      ? { success: true, data: { grounds } }
      : { success: false, error: CONVERSATION_NOT_FOUND_ERROR };
  } catch (error) {
    console.error("listConversationGrounds failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

const adminReadSchema = adminViewConversationSchema.extend({
  beforeId: listingIdSchema.optional(),
});

/**
 * An administrator reading a conversation, read-only, on a stated ground.
 *
 * `getActiveAdmin` re-reads the role from the database, so a demoted administrator's cookie does
 * not open anyone's messages. Every call - every page - writes a VIEW_CONVERSATION audit row before
 * returning anything.
 */
export async function readConversationAsAdministrator(input: unknown): Promise<
  ActionResult<{
    page: MessagePage;
    offers: OfferView[];
    ground: AdminViewGround;
  }>
> {
  const parsed = adminReadSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: firstIssue(
        parsed.error,
        "Please choose a ground and give a reason."
      ),
    };
  }

  const admin = await getActiveAdmin();

  if (!admin) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  if (
    !checkRateLimit(`chat-admin-read:${admin.id}`, ADMIN_READ_RATE_LIMIT)
      .allowed
  ) {
    return {
      success: false,
      error: "Too many reads just now. Please try again shortly.",
    };
  }

  try {
    const result = await readConversationAsAdmin({
      adminId: admin.id,
      conversationId: parsed.data.conversationId,
      ground: parsed.data.ground,
      reason: parsed.data.reason,
      beforeId: parsed.data.beforeId,
    });

    return result.ok
      ? {
          success: true,
          data: {
            page: result.page,
            offers: result.offers,
            ground: result.ground,
          },
        }
      : { success: false, error: result.error };
  } catch (error) {
    console.error("readConversationAsAdministrator failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * Refreshes the screens that show a booking's rent and deposit, after an offer renegotiated one.
 * Messages themselves need no revalidation: the open thread renders from realtime events.
 */
function revalidateBookingTerms(): void {
  for (const path of ["/dashboard/requests", "/dashboard/bookings"]) {
    revalidatePath(path, "page");
  }

  revalidatePath("/dashboard", "layout");
}
