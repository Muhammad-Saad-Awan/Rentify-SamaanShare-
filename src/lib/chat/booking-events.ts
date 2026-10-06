import { MessageKind } from "@/generated/prisma/enums";
import { bookingEventText } from "@/lib/chat/messages";
import { emitBookingNotifications } from "@/lib/notifications/create";
import { paymentMethodLabel } from "@/lib/notifications/messages";

import type { Prisma } from "@/generated/prisma/client";
import type { ThreadBookingEvent } from "@/lib/chat/messages";
import type { CreatedNotification } from "@/lib/notifications/create";
import type { BookingNotificationInput } from "@/lib/notifications/messages";

/**
 * Booking events, told in the conversation as well as in notifications.
 *
 * WHY THE THREAD HEARS ABOUT THEM. Chat covers the whole rental - before booking, during, after
 * return - and a thread that shows "can you do Tuesday?" but not "booking approved" reads as if the
 * two people had stopped talking. The SYSTEM line puts the official step where the conversation is.
 *
 * WRITTEN IN THE SAME TRANSACTION as the transition and its notifications, so a rolled-back
 * transition leaves no line behind. NOT PUBLISHED on its own: the notifications that ride along go
 * to both participants, and the refresh they trigger re-renders the open thread with this line in
 * it. One event, one refresh.
 *
 * SEPARATE FROM `notifications/create.ts` on purpose - that module stays unaware of chat, the same
 * way it stays unaware of realtime delivery.
 */

type ThreadWriter = Pick<
  Prisma.TransactionClient,
  "booking" | "conversation" | "message"
>;

/**
 * Writes one SYSTEM line into a booking's conversation.
 *
 * The conversation is the booking's link, or - for a booking made before chat existed - the one
 * between its renter and owner about its listing. With neither, nothing is written: a conversation
 * is not created just to hold a system line nobody asked to talk about.
 *
 * `actorId` is whoever caused the event. Their read cursor moves past the line, so nobody gets an
 * unread badge for their own click. `null` for the platform - an expiry sweep, an administrator.
 */
export async function postBookingThreadLine(
  tx: ThreadWriter,
  {
    bookingId,
    event,
    actorId,
  }: { bookingId: string; event: ThreadBookingEvent; actorId: string | null }
): Promise<void> {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    select: {
      startDate: true,
      endDate: true,
      listingId: true,
      renterId: true,
      ownerId: true,
      conversationId: true,
    },
  });

  if (!booking) {
    return;
  }

  const conversationId =
    booking.conversationId ??
    (
      await tx.conversation.findUnique({
        where: {
          listingId_renterId: {
            listingId: booking.listingId,
            renterId: booking.renterId,
          },
        },
        select: { id: true },
      })
    )?.id;

  if (!conversationId) {
    return;
  }

  const message = await tx.message.create({
    data: {
      conversationId,
      kind: MessageKind.SYSTEM,
      body: bookingEventText(event, booking),
    },
    select: { createdAt: true },
  });

  const cursor =
    actorId === booking.renterId
      ? { renterLastReadAt: message.createdAt }
      : actorId === booking.ownerId
        ? { ownerLastReadAt: message.createdAt }
        : {};

  await tx.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: message.createdAt, ...cursor },
    select: { id: true },
  });
}

/** The thread's version of a notification event, or `null` for events the thread does not show. */
function threadEventFor(
  input: BookingNotificationInput
): ThreadBookingEvent | null {
  switch (input.event) {
    case "approved":
    case "picked-up":
    case "returned":
    case "instructions-updated":
      return { event: input.event };
    case "declined":
      return { event: "declined", reason: input.reason ?? null };
    case "cancelled":
      return { event: "cancelled", by: input.by, reason: input.reason ?? null };
    case "payment-selected":
      return {
        event: "payment-selected",
        methodLabel: paymentMethodLabel(input.method),
      };
    // Listed rather than left to a default, so a new event has to be decided on here.
    case "requested": // writes its own line, with its terms - see `createBookingRequest`
    /**
     * The expiry sweep batches its writes in one array transaction and cannot tell which rows it
     * actually moved when two sweeps race, so a line here could be written twice. It does not go
     * through this function anyway; the booking card shows the expiry.
     */
    case "expired":
    case "review-reminder":
    case "reviews-published":
      return null;
  }
}

/**
 * `emitBookingNotifications`, plus the line in the thread. What the booking actions call.
 *
 * Returns the notifications exactly as before, so `publishAfterCommit` is unchanged at every site.
 */
export async function emitBookingEvent(
  tx: Prisma.TransactionClient,
  input: BookingNotificationInput,
  { actorId }: { actorId: string | null }
): Promise<CreatedNotification[]> {
  const notifications = await emitBookingNotifications(tx, input);
  const event = threadEventFor(input);

  if (event) {
    await postBookingThreadLine(tx, {
      bookingId: input.bookingId,
      event,
      actorId,
    });
  }

  return notifications;
}
