"use client";

import { BellIcon, CheckCheckIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { markNotificationsRead } from "@/actions/notifications";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UNREAD_BADGE_CAP } from "@/config/notifications";
import { cn } from "@/lib/utils/cn";

/**
 * A notification as the panel needs it.
 *
 * `timeAgo` and `href` arrive pre-computed from the server rather than being derived here. The
 * time because formatting it in the browser against a server-rendered tree is a hydration
 * mismatch by construction, and the href because the mapping from `entityType` to a screen is
 * pure server-side knowledge that has no business being shipped to the client.
 */
export interface NotificationPanelItem {
  id: string;
  title: string;
  body: string | null;
  timeAgo: string;
  href: string | null;
  isUnread: boolean;
}

interface NotificationPanelProps {
  items: NotificationPanelItem[];
  unreadCount: number;
}

/**
 * The header notification dropdown.
 *
 * A Client Component because "Mark all read" is an action with a pending state; the data itself
 * is fetched by the Server Component that renders this.
 *
 * OPENING DOES NOT MARK ANYTHING READ. Tempting, and wrong: the panel shows six of what may be
 * fifty, so opening it would clear a badge for notifications the user never saw. Marking read is
 * an explicit act - either on the item they click or on the button that says so.
 */
function NotificationPanel({ items, unreadCount }: NotificationPanelProps) {
  const [isPending, startTransition] = useTransition();

  const badge =
    unreadCount > UNREAD_BADGE_CAP ? `${UNREAD_BADGE_CAP}+` : `${unreadCount}`;

  function markAll() {
    startTransition(async () => {
      const result = await markNotificationsRead();

      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  /**
   * Marks one read as the user follows it.
   *
   * Not awaited, and the navigation is not blocked on it: the `Link` is doing the useful work
   * and a failed read-stamp is a stale badge, not a lost notification. Firing it inside a
   * transition keeps the revalidation from tearing the page out mid-navigation.
   */
  function markOne(id: string, isUnread: boolean) {
    if (!isUnread) {
      return;
    }

    startTransition(async () => {
      await markNotificationsRead({ notificationId: id });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" className="relative" />}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="pointer-events-none absolute -top-0.5 -right-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none tabular-nums"
          >
            {badge}
          </Badge>
        )}
        <span className="sr-only">
          {unreadCount > 0 ? `Notifications, ${badge} unread` : "Notifications"}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between gap-2 pr-1">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>

          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={markAll}
              disabled={isPending}
              aria-busy={isPending}
            >
              {isPending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <CheckCheckIcon />
              )}
              Mark all read
            </Button>
          )}
        </div>

        <DropdownMenuSeparator />

        {items.length === 0 ? (
          <p className="text-muted-foreground px-1.5 py-6 text-center text-sm">
            No notifications yet.
          </p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id}>
                <DropdownMenuItem
                  className={cn(
                    "flex-col items-start gap-0.5 whitespace-normal",
                    item.isUnread && "bg-accent/40"
                  )}
                  onClick={() => markOne(item.id, item.isUnread)}
                  render={
                    item.href ? (
                      <Link href={item.href} />
                    ) : (
                      <div role="button" />
                    )
                  }
                >
                  <span className="flex w-full items-start gap-2">
                    <span className="flex-1 text-xs leading-snug font-medium">
                      {item.title}
                    </span>
                    {item.isUnread && (
                      <span
                        className="bg-primary mt-1 size-1.5 shrink-0 rounded-full"
                        aria-label="Unread"
                      />
                    )}
                  </span>

                  {item.body && (
                    <span className="text-muted-foreground line-clamp-2 text-xs">
                      {item.body}
                    </span>
                  )}

                  <span className="text-muted-foreground text-[11px]">
                    {item.timeAgo}
                  </span>
                </DropdownMenuItem>
              </li>
            ))}
          </ul>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link href="/dashboard/notifications" />}>
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { NotificationPanel };
