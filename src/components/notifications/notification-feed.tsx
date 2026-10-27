"use client";

import { CheckCheckIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { markNotificationsRead } from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/**
 * One row of the feed, with its time and target already resolved on the server.
 *
 * Same shape as the header panel's item deliberately, but declared separately: the two surfaces
 * have no reason to move together, and sharing a type between a dropdown preview and a paginated
 * page would couple them the first time either needs a field the other does not.
 */
export interface NotificationFeedItem {
  id: string;
  title: string;
  body: string | null;
  timeAgo: string;
  href: string | null;
  isUnread: boolean;
}

interface NotificationFeedProps {
  items: NotificationFeedItem[];
  unreadCount: number;
}

/**
 * The paginated notification list.
 *
 * A Client Component for the read actions only - the rows themselves are server-rendered data
 * passed straight through.
 *
 * "Mark all read" clears every unread notification the user has, not just this page. That is the
 * useful meaning: someone on page three wanting to clear a badge does not want to visit each page
 * to do it. The action scopes by session `userId`, so the pagination never enters into it.
 */
function NotificationFeed({ items, unreadCount }: NotificationFeedProps) {
  const [isPending, startTransition] = useTransition();

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

  function markOne(id: string, isUnread: boolean) {
    if (!isUnread) {
      return;
    }

    startTransition(async () => {
      await markNotificationsRead({ notificationId: id });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {unreadCount > 0 && (
        <div className="flex justify-end">
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
        </div>
      )}

      {/*
        One inbox rather than a stack of cards: a column of separate boxes makes every notification
        look equally important. Unread rows carry a black rule on the leading edge and a bold title,
        so the eye finds them without colour.
      */}
      <ul className="bg-card divide-y overflow-hidden rounded-xl border">
        {items.map((item) => {
          const content = (
            <>
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  item.isUnread ? "bg-primary" : "bg-transparent"
                )}
                {...(item.isUnread
                  ? { role: "img", "aria-label": "Unread" }
                  : { "aria-hidden": true })}
              />

              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span
                    className={cn(
                      "text-sm leading-snug",
                      item.isUnread
                        ? "text-foreground font-semibold"
                        : "text-foreground/80 font-medium"
                    )}
                  >
                    {item.title}
                  </span>

                  <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
                    {item.timeAgo}
                  </span>
                </span>

                {item.body && (
                  <span className="text-muted-foreground text-sm leading-relaxed">
                    {item.body}
                  </span>
                )}
              </span>
            </>
          );

          const rowClass = cn(
            "relative flex items-start gap-3 px-5 py-4",
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
                  onClick={() => markOne(item.id, item.isUnread)}
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
    </div>
  );
}

export { NotificationFeed };
