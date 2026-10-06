"use client";

import {
  HandshakeIcon,
  ImageIcon,
  SearchIcon,
  MessagesSquareIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";
import { useMemo, useState } from "react";

import { MemberAvatar } from "@/components/chat/member-avatar";
import { Input } from "@/components/ui/input";
import { MessageKind } from "@/generated/prisma/enums";
import { conversationHref } from "@/lib/chat/routes";
import { cn } from "@/lib/utils/cn";
import { formatDayLabel, formatTime, karachiDay } from "@/lib/utils/date";
import { getDisplayName } from "@/lib/utils/user";

import type { ConversationSummary } from "@/lib/queries/chat";

type Filter = "all" | "unread" | "renting" | "lending";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "renting", label: "Renting" },
  { value: "lending", label: "Lending" },
];

interface ConversationListProps {
  conversations: ConversationSummary[];
}

/**
 * The inbox column: search, filters, and one row per conversation.
 *
 * Client-side filtering over what the server sent - the whole inbox is one small query, and a
 * search box that waits on a round trip per keystroke feels broken. The data itself is always the
 * server's: the layout re-renders on every realtime refresh, and this receives the new list.
 *
 * The open conversation is read from the URL segment, so the highlight follows navigation without
 * the layout having to re-render.
 */
function ConversationList({ conversations }: ConversationListProps) {
  const activeId = useSelectedLayoutSegment();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const unreadCount = conversations.filter((item) => item.unread > 0).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return conversations.filter((item) => {
      if (filter === "unread" && item.unread === 0) return false;
      if (filter === "renting" && item.role !== "renter") return false;
      if (filter === "lending" && item.role !== "owner") return false;

      if (!needle) return true;

      return (
        getDisplayName({ name: item.counterparty.name })
          .toLowerCase()
          .includes(needle) || item.listing.title.toLowerCase().includes(needle)
      );
    });
  }, [conversations, filter, query]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="font-heading text-lg font-semibold">Messages</h1>
          {unreadCount > 0 && (
            <span className="text-muted-foreground text-xs">
              {unreadCount} unread
            </span>
          )}
        </div>

        <div className="relative">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people or items"
            aria-label="Search conversations"
            className="pl-8"
          />
        </div>

        <div
          role="group"
          aria-label="Show"
          className="flex gap-1.5 overflow-x-auto"
        >
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
              className={cn(
                "focus-visible:ring-ring shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2",
                filter === item.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {item.label}
              {item.value === "unread" &&
                unreadCount > 0 &&
                ` (${unreadCount})`}
            </button>
          ))}
        </div>
      </div>

      {conversations.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <span className="bg-muted flex size-12 items-center justify-center rounded-full">
            <MessagesSquareIcon
              className="text-muted-foreground size-6"
              aria-hidden="true"
            />
          </span>
          <p className="text-sm font-medium">No conversations yet</p>
          <p className="text-muted-foreground max-w-60 text-xs leading-relaxed">
            Ask an owner about any item from its listing page. Questions about
            your own listings land here too.
          </p>
          <Link
            href="/listings"
            className="text-primary text-sm font-medium underline-offset-4 hover:underline"
          >
            Browse listings
          </Link>
        </div>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground px-4 py-8 text-center text-sm">
          No conversations match.
        </p>
      ) : (
        <ul
          className="min-h-0 flex-1 overflow-y-auto"
          aria-label="Conversations"
        >
          {visible.map((conversation) => (
            <li key={conversation.id}>
              <ConversationRow
                conversation={conversation}
                isActive={conversation.id === activeId}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function preview(conversation: ConversationSummary): string {
  const last = conversation.lastMessage;

  if (!last) return "";

  const fromThem = last.senderId === conversation.counterparty.id;

  if (last.kind === MessageKind.OFFER) {
    return fromThem ? "Sent you an offer" : "You sent an offer";
  }

  const body = (last.body ?? "").replace(/\s+/g, " ");

  return last.kind === MessageKind.TEXT && !fromThem ? `You: ${body}` : body;
}

/** "04:35 pm" today, "Yesterday", a weekday, or a date - the way messaging apps label a row. */
function rowTime(date: Date): string {
  return karachiDay(date) === karachiDay(new Date())
    ? formatTime(date)
    : formatDayLabel(date);
}

function ConversationRow({
  conversation,
  isActive,
}: {
  conversation: ConversationSummary;
  isActive: boolean;
}) {
  const name = getDisplayName({ name: conversation.counterparty.name });
  const unread = conversation.unread > 0;
  const isOffer = conversation.lastMessage?.kind === MessageKind.OFFER;

  return (
    <Link
      href={conversationHref(conversation.id)}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "focus-visible:ring-ring relative flex items-center gap-3 border-b px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset",
        isActive ? "bg-muted" : "hover:bg-muted/60"
      )}
    >
      {isActive && (
        <span
          className="bg-primary absolute inset-y-2 left-0 w-1 rounded-r-full"
          aria-hidden="true"
        />
      )}

      {/* The item, with the person over its corner: in a marketplace inbox the thing is how people
          remember the thread. */}
      <span className="relative shrink-0">
        <span className="bg-muted relative flex size-12 items-center justify-center overflow-hidden rounded-lg">
          {conversation.listing.imageUrl ? (
            <Image
              src={conversation.listing.imageUrl}
              alt=""
              fill
              sizes="48px"
              className="object-cover"
            />
          ) : (
            <ImageIcon
              className="text-muted-foreground size-5"
              aria-hidden="true"
            />
          )}
        </span>
        <MemberAvatar
          name={conversation.counterparty.name}
          image={conversation.counterparty.image}
          className="ring-background absolute -right-1.5 -bottom-1.5 size-6 rounded-full ring-2"
        />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm",
              unread ? "font-semibold" : "font-medium"
            )}
          >
            {name}
          </span>
          <span
            className={cn(
              "shrink-0 text-[11px]",
              unread ? "text-foreground font-medium" : "text-muted-foreground"
            )}
          >
            {conversation.lastMessage
              ? rowTime(conversation.lastMessage.createdAt)
              : ""}
          </span>
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {conversation.role === "renter" ? "Renting" : "Your listing"} ·{" "}
          {conversation.listing.title}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "flex min-w-0 items-center gap-1 truncate text-xs",
              unread ? "text-foreground font-medium" : "text-muted-foreground"
            )}
          >
            {isOffer && (
              <HandshakeIcon className="size-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{preview(conversation)}</span>
          </span>
          {unread && (
            <span className="bg-primary text-primary-foreground flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums">
              {conversation.unread}
              <span className="sr-only"> unread</span>
            </span>
          )}
        </span>
      </span>
    </Link>
  );
}

export { ConversationList };
