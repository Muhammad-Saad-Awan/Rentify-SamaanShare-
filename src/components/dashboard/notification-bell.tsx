import { BellIcon } from "lucide-react";

import { NotificationPanel } from "@/components/dashboard/notification-panel";
import { Button } from "@/components/ui/button";
import { notificationHref } from "@/lib/notifications/messages";
import {
  getRecentNotifications,
  getUnreadNotificationCount,
} from "@/lib/queries/notifications";
import { formatRelativeTime } from "@/lib/utils/date";

import type { NotificationPanelItem } from "@/components/dashboard/notification-panel";

interface NotificationBellProps {
  userId: string;
}

/**
 * The header bell, with its data.
 *
 * A Server Component that hands a Client Component the rows it needs. The alternative - a
 * client-side fetch on mount - would flash an empty panel and an absent badge on every dashboard
 * page load, which is exactly the "reads as broken" problem the placeholder version was avoiding.
 *
 * Rendered inside a `Suspense` boundary by the header, so these two queries never delay the
 * header shell; {@link NotificationBellFallback} holds the space in the meantime.
 *
 * Both timestamps and hrefs are resolved here rather than in the browser: relative time computed
 * client-side against server-rendered HTML is a guaranteed hydration mismatch, and the
 * entityType-to-route mapping is server knowledge with no reason to ship.
 */
async function NotificationBell({ userId }: NotificationBellProps) {
  const [unreadCount, recent] = await Promise.all([
    getUnreadNotificationCount(userId),
    getRecentNotifications(userId),
  ]);

  // One instant for the whole list, so two notifications written seconds apart cannot render in
  // an order that contradicts their labels.
  const now = new Date();

  const items: NotificationPanelItem[] = recent.map((item) => ({
    id: item.id,
    title: item.title,
    body: item.body,
    timeAgo: formatRelativeTime(item.createdAt, now),
    href: notificationHref(item.entityType, item.entityId),
    isUnread: item.readAt === null,
  }));

  return <NotificationPanel items={items} unreadCount={unreadCount} />;
}

/**
 * The bell before its data arrives.
 *
 * Deliberately shows no badge and no count rather than a skeleton pill: a placeholder number
 * would be read as real, and a shimmer where a count belongs draws the eye to nothing. The
 * button is inert, so a click during the gap cannot open an empty panel.
 */
function NotificationBellFallback() {
  return (
    <Button variant="ghost" size="icon-sm" disabled>
      <BellIcon />
      <span className="sr-only">Notifications</span>
    </Button>
  );
}

export { NotificationBell, NotificationBellFallback };
