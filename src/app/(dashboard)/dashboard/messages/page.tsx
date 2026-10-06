import { HandshakeIcon, MessagesSquareIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MessageKind } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/session";
import { conversationHref } from "@/lib/chat/routes";
import { listConversations } from "@/lib/queries/chat";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/date";
import { getDisplayName, getInitials } from "@/lib/utils/user";

import type { ConversationSummary } from "@/lib/queries/chat";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Messages",
  description: "Your conversations with owners and renters on SamaanShare.",
};

/** How many conversations the inbox shows. Far more than anyone keeps active at once. */
const INBOX_SIZE = 50;

/**
 * The inbox: every conversation the member is in, most recently active first.
 *
 * The skeleton comes from an in-page `<Suspense>`, not a `loading.tsx`: a route-level loading file
 * here would sit above `[id]` and turn its 404 into a soft one - see AGENTS.md.
 */
export default function MessagesPage() {
  return (
    <>
      <PageHeader
        title="Messages"
        description="Ask about an item, arrange pickup, sort out a problem, and agree terms."
      />

      <Suspense fallback={<DashboardPageSkeleton cards={4} />}>
        <Inbox />
      </Suspense>
    </>
  );
}

async function Inbox() {
  const user = await requireUser();
  const conversations = await listConversations(user.id, { take: INBOX_SIZE });

  if (conversations.length === 0) {
    return (
      <EmptyState
        icon={MessagesSquareIcon}
        title="No conversations yet"
        description="Message an owner from any listing page. Conversations about your own listings and bookings appear here too."
        action={
          <Button size="sm" render={<Link href="/listings" />}>
            Browse listings
          </Button>
        }
      />
    );
  }

  // One instant for every row, so the labels cannot contradict the ordering.
  const now = new Date();

  return (
    <Card className="py-0">
      <ul className="divide-y">
        {conversations.map((conversation) => (
          <InboxRow
            key={conversation.id}
            conversation={conversation}
            now={now}
          />
        ))}
      </ul>
    </Card>
  );
}

function preview(conversation: ConversationSummary): string {
  const last = conversation.lastMessage;

  if (!last) {
    return "";
  }

  if (last.kind === MessageKind.OFFER) {
    return last.senderId === conversation.counterparty.id
      ? "Sent you an offer"
      : "You sent an offer";
  }

  const body = last.body ?? "";

  return last.kind === MessageKind.TEXT &&
    last.senderId !== conversation.counterparty.id
    ? `You: ${body}`
    : body;
}

function InboxRow({
  conversation,
  now,
}: {
  conversation: ConversationSummary;
  now: Date;
}) {
  const name = getDisplayName({ name: conversation.counterparty.name });
  const unread = conversation.unread > 0;
  const isOffer = conversation.lastMessage?.kind === MessageKind.OFFER;

  return (
    <li>
      <Link
        href={conversationHref(conversation.id)}
        className="hover:bg-muted/50 focus-visible:ring-ring flex items-center gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <Avatar className="size-10 shrink-0">
          {conversation.counterparty.image && (
            <AvatarImage src={conversation.counterparty.image} alt="" />
          )}
          <AvatarFallback>
            {getInitials({ name: conversation.counterparty.name })}
          </AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn("truncate text-sm", unread && "font-semibold")}>
              {name}
              <span className="text-muted-foreground font-normal">
                {" "}
                · {conversation.role === "owner" ? "renting" : "owner of"}{" "}
                {conversation.listing.title}
              </span>
            </p>
            <span className="text-muted-foreground shrink-0 text-xs">
              {formatRelativeTime(conversation.lastMessageAt, now)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p
              className={cn(
                "text-muted-foreground flex min-w-0 items-center gap-1 truncate text-sm",
                unread && "text-foreground"
              )}
            >
              {isOffer && (
                <HandshakeIcon
                  className="size-3.5 shrink-0"
                  aria-hidden="true"
                />
              )}
              <span className="truncate">{preview(conversation)}</span>
            </p>
            {unread && (
              <Badge
                variant="destructive"
                className="shrink-0 rounded-full tabular-nums"
              >
                {conversation.unread}
                <span className="sr-only"> unread</span>
              </Badge>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
