import {
  NOTIFICATION_PREVIEW_COUNT,
  NOTIFICATIONS_PAGE_SIZE,
  UNREAD_BADGE_CAP,
} from "@/config/notifications";
import { prisma } from "@/lib/prisma";

import type { NotificationType } from "@/generated/prisma/enums";
import type { PaginatedResult } from "@/types";

/**
 * Read-only notification queries.
 *
 * Every one is scoped by a `userId` taken from the session, never from a parameter a client
 * controls, so there is no identifier for someone else's notifications to tamper with - the
 * same rule the booking queries follow.
 *
 * Nothing here sweeps expired bookings. The two dashboards do that because their lists would
 * otherwise offer actions that fail; a notification is a record of something that already
 * happened, and rewriting history on read would be wrong.
 */

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  entityType: true,
  entityId: true,
  readAt: true,
  createdAt: true,
} as const;

/**
 * Unread count for the header badge.
 *
 * Bounded by `take`, so the query reads at most eleven rows however far behind the user is -
 * `UNREAD_BADGE_CAP + 1` is enough to know whether to render "9+". Served by the
 * `[userId, readAt]` index.
 */
export async function getUnreadNotificationCount(
  userId: string
): Promise<number> {
  const rows = await prisma.notification.findMany({
    where: { userId, readAt: null },
    take: UNREAD_BADGE_CAP + 1,
    select: { id: true },
  });

  return rows.length;
}

/** The newest few notifications, for the header dropdown. */
export async function getRecentNotifications(
  userId: string,
  limit: number = NOTIFICATION_PREVIEW_COUNT
): Promise<NotificationItem[]> {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: notificationSelect,
  });
}

interface NotificationPageOptions {
  userId: string;
  page?: number;
  pageSize?: number;
}

/**
 * The paginated feed.
 *
 * Newest first and read alongside unread: a notification the user has already seen is still the
 * record of what happened to their booking, so hiding it would make the page useless as history.
 * The unread ones are distinguished visually instead.
 */
export async function getNotifications({
  userId,
  page = 1,
  pageSize = NOTIFICATIONS_PAGE_SIZE,
}: NotificationPageOptions): Promise<
  PaginatedResult<NotificationItem> & { unreadCount: number }
> {
  const currentPage = Math.max(1, Math.trunc(page));
  const where = { userId };

  // Concurrent reads rather than a transaction - see the note in `getActiveListings`.
  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: notificationSelect,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return {
    items,
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    unreadCount,
  };
}
