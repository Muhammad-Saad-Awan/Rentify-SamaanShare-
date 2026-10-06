import { MessagesSquareIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { UNREAD_BADGE_CAP } from "@/config/notifications";
import { MESSAGES_ROUTE } from "@/lib/chat/routes";

interface UnreadProps {
  /** Unread messages across every conversation, counted once by the dashboard layout. */
  unread: number;
}

function capped(unread: number): string {
  return unread > UNREAD_BADGE_CAP ? `${UNREAD_BADGE_CAP}+` : `${unread}`;
}

/**
 * The header's way into the inbox, with the unread count.
 *
 * Beside the bell, and separate from it on purpose: messages do not write `Notification` rows, so a
 * conversation never inflates the notification badge, and a busy thread is one badge rather than one
 * notification per line.
 *
 * THE COUNT IS A PROP, counted once in the dashboard layout and shared with the sidebar badge. Both
 * used to fetch their own inside a Suspense boundary, and an async Server Component suspended inside
 * the shell made the Base UI ids of everything rendered after it differ between server and client - a
 * hydration mismatch on every dashboard page. A plain number has nothing to suspend.
 *
 * A plain `Link` with button styles rather than the Base UI `Button`, for the same reason: a link needs
 * neither generated ids nor button behaviour.
 */
function MessagesButton({ unread }: UnreadProps) {
  return (
    <Link
      href={MESSAGES_ROUTE}
      className={buttonVariants({
        variant: "ghost",
        size: "icon-sm",
        className: "relative",
      })}
    >
      <MessagesSquareIcon />
      {unread > 0 && (
        <Badge
          variant="destructive"
          className="pointer-events-none absolute -top-0.5 -right-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none tabular-nums"
        >
          {capped(unread)}
        </Badge>
      )}
      <span className="sr-only">
        {unread > 0 ? `Messages, ${unread} unread` : "Messages"}
      </span>
    </Link>
  );
}

/**
 * The unread count beside "Messages" in the sidebar. Nothing when there is nothing unread - an
 * empty badge would teach people to ignore it.
 */
function UnreadMessagesBadge({ unread }: UnreadProps) {
  if (unread === 0) {
    return null;
  }

  return (
    <span className="bg-primary text-primary-foreground ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums">
      {capped(unread)}
      <span className="sr-only"> unread</span>
    </span>
  );
}

export { MessagesButton, UnreadMessagesBadge };
