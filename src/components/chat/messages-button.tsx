import { MessagesSquareIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UNREAD_BADGE_CAP } from "@/config/notifications";
import { MESSAGES_ROUTE } from "@/lib/chat/routes";
import { getUnreadTotal } from "@/lib/queries/chat";

interface MessagesButtonProps {
  userId: string;
}

/**
 * The header's way into the inbox, with the unread count.
 *
 * Beside the bell, and separate from it on purpose: messages do not write `Notification` rows, so a
 * conversation never inflates the notification badge, and a busy thread is one badge rather than one
 * notification per line.
 *
 * A Server Component, so the count is always the database's. The realtime subscriber refreshes the
 * route when a message arrives or a thread is read, which re-runs this.
 */
async function MessagesButton({ userId }: MessagesButtonProps) {
  const unread = await getUnreadTotal(userId);
  const badge =
    unread > UNREAD_BADGE_CAP ? `${UNREAD_BADGE_CAP}+` : `${unread}`;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="relative"
      render={<Link href={MESSAGES_ROUTE} />}
    >
      <MessagesSquareIcon />
      {unread > 0 && (
        <Badge
          variant="destructive"
          className="pointer-events-none absolute -top-0.5 -right-0.5 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none tabular-nums"
        >
          {badge}
        </Badge>
      )}
      <span className="sr-only">
        {unread > 0 ? `Messages, ${unread} unread` : "Messages"}
      </span>
    </Button>
  );
}

function MessagesButtonFallback() {
  return (
    <Button variant="ghost" size="icon-sm" disabled>
      <MessagesSquareIcon />
      <span className="sr-only">Messages</span>
    </Button>
  );
}

export { MessagesButton, MessagesButtonFallback };
