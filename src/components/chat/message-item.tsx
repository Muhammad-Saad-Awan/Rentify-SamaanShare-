import { OfferCard } from "@/components/chat/offer-card";
import { MessageKind } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/date";

import type { OfferContext } from "@/components/chat/offer-card";
import type { ChatMessageView, OfferView } from "@/lib/queries/chat";

interface MessageItemProps {
  message: ChatMessageView;
  viewerId: string;
  counterpartyName: string;
  /** The offer an OFFER message announces, once the server render has it. */
  offer: OfferView | null;
  offerContext: OfferContext;
  /** Whether to show "Seen" under this message - the newest of the viewer's the other side read. */
  seen: boolean;
}

/**
 * One entry in the log.
 *
 * Text is rendered as text - React escapes it, and `whitespace-pre-wrap` keeps the sender's line
 * breaks without any markup. SYSTEM lines are the platform speaking and are set apart from both
 * people. An OFFER message is drawn as its offer card, from the Offer row, never from the message.
 */
function MessageItem({
  message,
  viewerId,
  counterpartyName,
  offer,
  offerContext,
  seen,
}: MessageItemProps) {
  const time = formatDateTime(message.createdAt);

  if (message.kind === MessageKind.SYSTEM) {
    return (
      <div className="flex justify-center">
        <p className="bg-muted text-muted-foreground max-w-[90%] rounded-lg px-3 py-1.5 text-center text-xs leading-relaxed">
          {message.body}
          <span className="sr-only">, {time}</span>
        </p>
      </div>
    );
  }

  const isOwn = message.senderId === viewerId;

  if (message.kind === MessageKind.OFFER) {
    return (
      <div
        className={cn(
          "flex flex-col gap-1",
          isOwn ? "items-end" : "items-start"
        )}
      >
        <OfferCard
          offer={offer}
          viewerId={viewerId}
          proposerName={isOwn ? "You" : counterpartyName}
          context={offerContext}
        />
        <span className="text-muted-foreground text-xs">
          {time}
          {seen && " · Seen"}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col gap-1", isOwn ? "items-end" : "items-start")}
    >
      <p
        className={cn(
          "max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap sm:max-w-[70%]",
          isOwn
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        )}
      >
        <span className="sr-only">{isOwn ? "You" : counterpartyName}: </span>
        {message.body}
      </p>
      <span className="text-muted-foreground text-xs">
        {time}
        {seen && " · Seen"}
      </span>
    </div>
  );
}

export { MessageItem };
