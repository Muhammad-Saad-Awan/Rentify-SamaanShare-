"use client";

import { CheckCheckIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { markNotificationsRead } from "@/actions/notifications";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const content = (
            <>
              <span className="flex w-full items-start gap-2">
                <span className="flex-1 text-sm leading-snug font-medium">
                  {item.title}
                </span>

                {item.isUnread && (
                  <span
                    className="bg-primary mt-1.5 size-2 shrink-0 rounded-full"
                    aria-label="Unread"
                  />
                )}
              </span>

              {item.body && (
                <span className="text-muted-foreground text-xs leading-relaxed">
                  {item.body}
                </span>
              )}

              <span className="text-muted-foreground text-[11px]">
                {item.timeAgo}
              </span>
            </>
          );

          return (
            <li key={item.id}>
              <Card
                className={cn(
                  "transition-colors",
                  item.isUnread && "border-primary/30 bg-accent/30"
                )}
              >
                {/* A link when there is somewhere to go, plain text when there is not - rather
                    than a link to nowhere, which reads as broken on click. */}
                {item.href ? (
                  <Link
                    href={item.href}
                    onClick={() => markOne(item.id, item.isUnread)}
                    className="hover:bg-accent/40 flex flex-col gap-1 rounded-lg px-(--card-spacing) py-1 transition-colors"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex flex-col gap-1 px-(--card-spacing) py-1">
                    {content}
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { NotificationFeed };
