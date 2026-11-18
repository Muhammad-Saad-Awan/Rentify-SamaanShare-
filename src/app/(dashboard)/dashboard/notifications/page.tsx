import { BellIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  MarkAllNotificationsReadButton,
  NotificationFeed,
} from "@/components/notifications/notification-feed";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { notificationHref } from "@/lib/notifications/messages";
import { getNotifications } from "@/lib/queries/notifications";
import { parsePageParam } from "@/lib/utils/pagination";
import { formatRelativeTime, karachiDay } from "@/lib/utils/date";

import type { NotificationFeedItem } from "@/components/notifications/notification-feed";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Your SamaanShare activity notifications.",
};

interface NotificationsPageProps {
  searchParams: Promise<{ page?: string | string[] }>;
}

/**
 * The full notification feed.
 *
 * Read notifications stay in the list. A notification is the record of something that happened
 * to a booking - who was told what, and when - so hiding the ones already seen would leave the
 * user no way to look back at it. Unread rows are distinguished instead.
 */
export default async function NotificationsPage({
  searchParams,
}: NotificationsPageProps) {
  const { page: rawPage } = await searchParams;

  return (
    <Suspense
      key={String(rawPage ?? 1)}
      fallback={<DashboardPageSkeleton cards={4} />}
    >
      <Notifications rawPage={rawPage} />
    </Suspense>
  );
}

/**
 * The day heading a notification is listed under, by Karachi calendar day.
 *
 * Coarser than the chat's day separators on purpose: a feed of twenty rows with a heading per day
 * would be mostly headings. Each row keeps its own time, so nothing is lost.
 */
function groupLabel(date: Date, now: Date): string {
  const daysAgo = Math.round(
    (Date.parse(`${karachiDay(now)}T00:00:00Z`) -
      Date.parse(`${karachiDay(date)}T00:00:00Z`)) /
      86_400_000
  );

  if (daysAgo <= 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  if (daysAgo < 7) return "Earlier this week";

  return "Older";
}

interface NotificationsProps {
  rawPage: string | string[] | undefined;
}

async function Notifications({ rawPage }: NotificationsProps) {
  const user = await requireUser();

  const { items, total, page, totalPages, unreadCount } =
    await getNotifications({
      userId: user.id,
      page: parsePageParam(rawPage),
    });

  // One instant for every row, so the labels cannot contradict the ordering.
  const now = new Date();

  const feedItems: NotificationFeedItem[] = items.map((item) => ({
    id: item.id,
    type: item.type,
    group: groupLabel(item.createdAt, now),
    title: item.title,
    body: item.body,
    timeAgo: formatRelativeTime(item.createdAt, now),
    href: notificationHref(item.entityType, item.entityId),
    isUnread: item.readAt === null,
  }));

  return (
    <>
      <PageHeader
        title="Notifications"
        description={
          total === 0
            ? "Updates about your listings and bookings will appear here."
            : unreadCount > 0
              ? `${unreadCount} unread of ${total}.`
              : `${total === 1 ? "1 notification" : `${total} notifications`}.`
        }
        // Only when there is something to clear: an empty actions slot still takes a row on a phone.
        {...(unreadCount > 0
          ? {
              actions: (
                <MarkAllNotificationsReadButton unreadCount={unreadCount} />
              ),
            }
          : {})}
      />

      {feedItems.length > 0 && <NotificationFeed items={feedItems} />}

      {feedItems.length === 0 &&
        (total === 0 ? (
          <EmptyState
            icon={BellIcon}
            title="No notifications yet"
            description="When someone requests one of your items, or an owner responds to your request, you will hear about it here."
            action={
              <>
                <Button size="sm" render={<Link href="/listings" />}>
                  Browse listings
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/settings" />}
                >
                  Notification settings
                </Button>
              </>
            }
          />
        ) : (
          <EmptyState
            icon={BellIcon}
            title="No notifications on this page"
            description={`There ${totalPages === 1 ? "is only 1 page" : `are only ${totalPages} pages`} of notifications.`}
            action={
              <Button
                variant="outline"
                size="sm"
                render={<Link href="/dashboard/notifications" />}
              >
                Back to first page
              </Button>
            }
          />
        ))}

      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(target) =>
          target > 1
            ? `/dashboard/notifications?page=${target}`
            : "/dashboard/notifications"
        }
      />
    </>
  );
}
