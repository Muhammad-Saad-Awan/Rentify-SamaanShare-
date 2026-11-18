"use client";

import { BellIcon, CheckCheckIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useId, useTransition } from "react";
import { toast } from "sonner";

import { markNotificationsRead } from "@/actions/notifications";
import { NotificationIcon } from "@/components/notifications/notification-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UNREAD_BADGE_CAP } from "@/config/notifications";
import { cn } from "@/lib/utils/cn";

import type { NotificationType } from "@/generated/prisma/enums";

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
  /** Picks the row's icon tile - the same one the inbox page shows for this event. */
  type: NotificationType;
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
  const headingId = useId();

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
        {/* Navy like every other unread count in the app - the sidebar's, the inbox's. Red would
            say something went wrong, and an unread notification is usually good news. */}
        {unreadCount > 0 && (
          <Badge className="ring-background pointer-events-none absolute -top-0.5 -right-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none tabular-nums ring-2">
            {badge}
          </Badge>
        )}
        <span className="sr-only">
          {unreadCount > 0 ? `Notifications, ${badge} unread` : "Notifications"}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[24rem] max-w-[calc(100vw-2rem)] p-1.5"
        aria-labelledby={headingId}
      >
        <div className="flex items-center justify-between gap-2 pr-1">
          {/*
            A PLAIN HEADING, NOT `DropdownMenuLabel`. That component is Base UI's
            `Menu.GroupLabel`, which reads `MenuGroupContext` and THROWS when there is no
            `Menu.Group` around it - and it throws as the popup mounts, so the page rendered
            fine and only opening this panel failed. The bell lives in the dashboard layout,
            outside `(dashboard)/error.tsx`, so the throw reached `global-error.tsx`: the whole
            app replaced by "SamaanShare could not load" on a click of the bell.

            Wrapping it in a `Menu.Group` would silence it and be wrong. This is the panel's
            title, not the label of a set of menu items - there is no group here, and a group
            whose only child is its own label announces an empty collection. So it is a `<p>`,
            matching the header block in `user-menu.tsx`, and the popup is pointed at it with
            `aria-labelledby` so the name is not lost with the primitive.
          */}
          <p
            id={headingId}
            className="font-heading flex items-baseline gap-2 px-1.5 py-1.5 text-sm font-semibold"
          >
            Notifications
            {unreadCount > 0 && (
              <span className="text-muted-foreground font-sans text-xs font-normal">
                {badge} unread
              </span>
            )}
          </p>

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
          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
            <span
              className="bg-muted text-foreground flex size-10 items-center justify-center rounded-xl border"
              aria-hidden="true"
            >
              <BellIcon className="size-4" strokeWidth={1.75} />
            </span>
            <p className="text-muted-foreground max-w-64 text-sm leading-relaxed">
              No notifications yet. Updates about your bookings, payments and
              messages appear here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => (
              <li key={item.id}>
                <DropdownMenuItem
                  className={cn(
                    "items-start gap-3 px-2.5 py-2.5 whitespace-normal",
                    item.isUnread && "bg-muted/70"
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
                  <NotificationIcon type={item.type} className="size-8" />

                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex w-full items-start gap-2">
                      <span
                        className={cn(
                          "flex-1 text-[0.8125rem] leading-snug",
                          item.isUnread ? "font-semibold" : "font-medium"
                        )}
                      >
                        {/* Text, not an `aria-label` on the dot: a label on a plain span is not
                            reliably announced, and the dot alone would be colour carrying meaning. */}
                        {item.isUnread && (
                          <span className="sr-only">Unread: </span>
                        )}
                        {item.title}
                      </span>
                      {item.isUnread && (
                        <span
                          className="bg-primary mt-1.5 size-2 shrink-0 rounded-full"
                          aria-hidden="true"
                        />
                      )}
                    </span>

                    {item.body && (
                      <span className="text-muted-foreground line-clamp-2 text-xs leading-relaxed">
                        {item.body}
                      </span>
                    )}

                    <span className="text-muted-foreground text-xs">
                      {item.timeAgo}
                    </span>
                  </span>
                </DropdownMenuItem>
              </li>
            ))}
          </ul>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="justify-center font-medium"
          render={<Link href="/dashboard/notifications" />}
        >
          View all notifications
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { NotificationPanel };
