import { CheckCheckIcon, CheckIcon, InfoIcon } from "lucide-react";

import { MemberAvatar } from "@/components/chat/member-avatar";
import { OfferCard } from "@/components/chat/offer-card";
import { MessageKind } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils/cn";
import { formatTime } from "@/lib/utils/date";

import type { OfferContext } from "@/components/chat/offer-card";
import type { ChatMessageView, OfferView } from "@/lib/queries/chat";

interface MessageItemProps {
  message: ChatMessageView;
  viewerId: string;
  counterparty: { name: string; image: string | null };
  /** The offer an OFFER message announces, once the server render has it. */
  offer: OfferView | null;
  offerContext: OfferContext;
  /** Position in a run of messages from one sender, which shapes the corners and spacing. */
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  /** Whether the other side has read this message - only meaningful on the viewer's own. */
  isSeen: boolean;
}

/**
 * One entry in the log.
 *
 * Text is rendered as text - React escapes it, and `whitespace-pre-wrap` keeps the sender's line
 * breaks without any markup. SYSTEM lines are the platform speaking, set apart from both people. An
 * OFFER message is drawn as its offer card, from the Offer row, never from the message.
 *
 * A run of messages from one person reads as one block: the time, the receipt and the other
 * person's avatar appear once, at its end.
 */
function MessageItem({
  message,
  viewerId,
  counterparty,
  offer,
  offerContext,
  isFirstInGroup,
  isLastInGroup,
  isSeen,
}: MessageItemProps) {
  const time = formatTime(message.createdAt);

  if (message.kind === MessageKind.SYSTEM) {
    return (
      <div className="my-2 flex justify-center px-2">
        <p className="bg-muted/80 text-muted-foreground flex max-w-md items-start gap-2 rounded-xl px-3 py-2 text-xs leading-relaxed">
          <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {message.body}
            <span className="sr-only">, {time}</span>
          </span>
        </p>
      </div>
    );
  }

  const isOwn = message.senderId === viewerId;
  const sender = isOwn ? "You" : counterparty.name;

  const meta = isLastInGroup && (
    <span
      className={cn(
        "text-muted-foreground flex items-center gap-1 text-[11px]",
        isOwn ? "justify-end pr-1" : "pl-1"
      )}
    >
      {time}
      {isOwn &&
        (isSeen ? (
          <>
            <CheckCheckIcon
              className="size-3.5 text-sky-600 dark:text-sky-400"
              aria-hidden="true"
            />
            <span className="sr-only">Seen</span>
          </>
        ) : (
          <>
            <CheckIcon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Sent</span>
          </>
        ))}
    </span>
  );

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isOwn ? "justify-end" : "justify-start",
        isFirstInGroup ? "mt-3" : "mt-0.5"
      )}
    >
      {/* The other person's face once per run, so a long exchange is easy to scan. */}
      {!isOwn && (
        <span className="w-7 shrink-0" aria-hidden="true">
          {isLastInGroup && (
            <MemberAvatar
              name={counterparty.name}
              image={counterparty.image}
              className="size-7 rounded-full"
            />
          )}
        </span>
      )}

      <div
        className={cn(
          "flex max-w-[85%] flex-col gap-1 sm:max-w-[70%]",
          isOwn ? "items-end" : "items-start"
        )}
      >
        {message.kind === MessageKind.OFFER ? (
          <OfferCard
            offer={offer}
            viewerId={viewerId}
            proposerName={isOwn ? "You" : counterparty.name}
            context={offerContext}
          />
        ) : (
          <p
            className={cn(
              "rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap shadow-xs",
              isOwn
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground",
              // The tail: the corner nearest the sender squares off on the last bubble of a run.
              isOwn && isLastInGroup && "rounded-br-md",
              !isOwn && isLastInGroup && "rounded-bl-md"
            )}
          >
            <span className="sr-only">{sender}: </span>
            {message.body}
          </p>
        )}
        {meta}
      </div>
    </div>
  );
}

export { MessageItem };
