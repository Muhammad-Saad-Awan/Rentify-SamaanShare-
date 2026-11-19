"use client";

import { CheckCheckIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useId, useTransition } from "react";
import { toast } from "sonner";

import { markNotificationsRead } from "@/actions/notifications";
import { NotificationIcon } from "@/components/notifications/notification-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

import type { NotificationType } from "@/generated/prisma/enums";

/**
 * One row of the feed, with its time, target and group already resolved on the server.
 *
 * Same shape as the header panel's item deliberately, but declared separately: the two surfaces
 * have no reason to move together, and sharing a type between a dropdown preview and a paginated
 * page would couple them the first time either needs a field the other does not.
 */
export interface NotificationFeedItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  timeAgo: string;
  href: string | null;
  isUnread: boolean;
  /**
   * The heading this row is listed under - "Today", "Yesterday", "Earlier". Computed on the server
   * against one instant, for the same hydration reason as `timeAgo`.
   */
  group: string;
}

interface NotificationFeedProps {
  items: NotificationFeedItem[];
}

/**
 * The paginated notification list, in day groups.
 *
 * A Client Component for the read action only - the rows themselves are server-rendered data
 * passed straight through. Items arrive newest first, so grouping consecutive rows by their label
 * keeps the server's order exactly.
 */
function NotificationFeed({ items }: NotificationFeedProps) {
  const [, startTransition] = useTransition();

  function markOne(id: string, isUnread: boolean) {
    if (!isUnread) {
      return;
    }

    startTransition(async () => {
      await markNotificationsRead({ notificationId: id });
    });
  }

  const groups: { label: string; items: NotificationFeedItem[] }[] = [];

  for (const item of items) {
    const last = groups.at(-1);

    if (last && last.label === item.group) {
      last.items.push(item);
    } else {
      groups.push({ label: item.group, items: [item] });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <FeedGroup
          key={group.label}
          label={group.label}
          items={group.items}
          onFollow={markOne}
        />
      ))}
    </div>
  );
}

function FeedGroup({
  label,
  items,
  onFollow,
}: {
  label: string;
  items: NotificationFeedItem[];
  onFollow: (id: string, isUnread: boolean) => void;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2
        id={headingId}
        className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
      >
        {label}
      </h2>

      {/*
        One inbox rather than a stack of cards: a column of separate boxes makes every notification
        look equally important. Unread rows are told apart three ways - a navy rule on the leading
        edge with a dot, a bold title, and "Unread" for screen readers - so none of it rests on
        colour.
      */}
      <ul className="bg-card divide-y overflow-hidden rounded-2xl border">
        {items.map((item) => {
          const content = (
            <>
              <NotificationIcon type={item.type} />

              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex w-full items-start justify-between gap-3">
                  <span
                    className={cn(
                      "text-sm leading-snug",
                      item.isUnread
                        ? "text-foreground font-semibold"
                        : "text-foreground font-medium"
                    )}
                  >
                    {item.isUnread && <span className="sr-only">Unread: </span>}
                    {item.title}
                  </span>

                  <span className="flex shrink-0 items-center gap-2 pt-0.5">
                    <span className="text-muted-foreground text-xs whitespace-nowrap">
                      {item.timeAgo}
                    </span>
                    {item.isUnread && (
                      <span
                        className="bg-primary size-2 rounded-full"
                        aria-hidden="true"
                      />
                    )}
                  </span>
                </span>

                {item.body && (
                  <span className="text-muted-foreground max-w-[65ch] text-sm leading-relaxed">
                    {item.body}
                  </span>
                )}
              </span>
            </>
          );

          const rowClass = cn(
            "relative flex items-start gap-3 px-4 py-4 sm:gap-4 sm:px-5",
            item.isUnread &&
              "bg-muted/40 before:bg-primary before:absolute before:inset-y-0 before:left-0 before:w-0.5"
          );

          return (
            <li key={item.id}>
              {/* A link when there is somewhere to go, plain text when there is not - rather
                  than a link to nowhere, which reads as broken on click. */}
              {item.href ? (
                <Link
                  href={item.href}
                  onClick={() => onFollow(item.id, item.isUnread)}
                  className={cn(
                    rowClass,
                    "hover:bg-muted focus-visible:ring-ring transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
                  )}
                >
                  {content}
                </Link>
              ) : (
                <div className={rowClass}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface MarkAllNotificationsReadButtonProps {
  unreadCount: number;
}

/**
 * "Mark all read", for the page header.
 *
 * Clears every unread notification the user has, not just this page. That is the useful meaning:
 * someone on page three wanting to clear a badge does not want to visit each page to do it. The
 * action scopes by session `userId`, so the pagination never enters into it.
 */
function MarkAllNotificationsReadButton({
  unreadCount,
}: MarkAllNotificationsReadButtonProps) {
  const [isPending, startTransition] = useTransition();

  if (unreadCount === 0) {
    return null;
  }

  function markAll() {
    startTransition(async () => {
      const result = await markNotificationsRead();

      if (!result.success) {
        toast.error(result.error);

        return;
      }

      toast.success("All notifications marked as read.");
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
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
  );
}

export { MarkAllNotificationsReadButton, NotificationFeed };
