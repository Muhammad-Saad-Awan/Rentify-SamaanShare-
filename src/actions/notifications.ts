"use server";

import { revalidatePath } from "next/cache";

import { getActiveUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { markNotificationsReadSchema } from "@/lib/validations/notification";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * Marking notifications read.
 *
 * The only write a user performs on their own notifications - they are created by the booking
 * actions and never edited or deleted, because a notification is the record of a status change
 * and letting either party remove it would remove the only trace they were told.
 */

/** Generous: clicking through a backlog of notifications is normal. */
const READ_RATE_LIMIT = { limit: 240, windowMs: 60 * 60 * 1000 };

/**
 * Marks one notification read, or every unread one when no id is given.
 *
 * AUTHORIZATION IS IN THE `WHERE`. `userId` comes from the session and is part of the update
 * predicate, so another user's notification id simply matches zero rows - there is no
 * comparison afterwards that could be forgotten, and no way to tell from the outside whether an
 * id exists. The result is reported as success either way for the same reason.
 *
 * Idempotent: `readAt: null` in the predicate means re-marking an already-read notification
 * writes nothing, so a double click does not move the timestamp.
 */
export async function markNotificationsRead(
  input?: unknown
): Promise<ActionResult<{ updated: number }>> {
  const parsed = markNotificationsReadSchema.safeParse(input ?? {});

  if (!parsed.success) {
    return { success: false, error: "That notification was not found." };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`notifications-read:${user.id}`, READ_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  const { notificationId } = parsed.data;

  try {
    const result = await prisma.notification.updateMany({
      where: {
        userId: user.id,
        readAt: null,
        ...(notificationId ? { id: notificationId } : {}),
      },
      data: { readAt: new Date() },
    });

    // The badge lives in the dashboard header, which every dashboard route renders, so the
    // whole group has to be refreshed rather than one page.
    revalidatePath("/dashboard", "layout");

    return { success: true, data: { updated: result.count } };
  } catch (error) {
    console.error("markNotificationsRead failed", error);

    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}
