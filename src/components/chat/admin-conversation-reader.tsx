"use client";

import { EyeIcon, Loader2Icon, ShieldAlertIcon } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { readConversationAsAdministrator } from "@/actions/chat";
import { OfferCard } from "@/components/chat/offer-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageKind } from "@/generated/prisma/enums";
import {
  ADMIN_VIEW_REASON_MAX,
  ADMIN_VIEW_REASON_MIN,
} from "@/lib/validations/chat";
import { formatDateTime } from "@/lib/utils/date";

import type { AdminViewGround } from "@/lib/chat/admin-access";
import type { ChatMessageView, OfferView } from "@/lib/queries/chat";

interface Party {
  id: string;
  name: string;
}

interface AdminConversationReaderProps {
  conversationId: string;
  listingId: string;
  renter: Party;
  owner: Party;
  /** Grounds as labelled by the page, which knows the claim and report details. */
  grounds: (AdminViewGround & { label: string })[];
}

/**
 * An administrator reading a conversation: choose the ground, say why, then read. Read-only.
 *
 * Nothing is fetched until the administrator submits, and every fetch - including each "earlier
 * messages" page - is a separate logged read with the same ground and reason. The page above says
 * so before they start.
 */
function AdminConversationReader({
  conversationId,
  listingId,
  renter,
  owner,
  grounds,
}: AdminConversationReaderProps) {
  const reasonId = useId();
  const [isPending, startTransition] = useTransition();

  const [groundKey, setGroundKey] = useState(
    grounds[0] ? `${grounds[0].kind}:${grounds[0].id}` : ""
  );
  const [reason, setReason] = useState("");
  const [messages, setMessages] = useState<ChatMessageView[] | null>(null);
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [hasOlder, setHasOlder] = useState(false);

  const ground = grounds.find(
    (item) => `${item.kind}:${item.id}` === groundKey
  );
  const names = new Map([
    [renter.id, `${renter.name} (renter)`],
    [owner.id, `${owner.name} (owner)`],
  ]);

  function read(beforeId?: string) {
    if (!ground) {
      return;
    }

    startTransition(async () => {
      const result = await readConversationAsAdministrator({
        conversationId,
        ground: { kind: ground.kind, id: ground.id },
        reason,
        ...(beforeId ? { beforeId } : {}),
      });

      if (!result.success) {
        toast.error(result.error);

        return;
      }

      setMessages((current) =>
        beforeId
          ? [...result.data.page.messages, ...(current ?? [])]
          : result.data.page.messages
      );
      setOffers(result.data.offers);
      setHasOlder(result.data.page.hasOlder);
    });
  }

  if (grounds.length === 0) {
    return (
      <p className="text-muted-foreground flex items-start gap-2 text-sm">
        <ShieldAlertIcon
          className="mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        There is no deposit claim, disputed handover or report between these two
        members, so this conversation cannot be read.
      </p>
    );
  }

  if (messages === null) {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          read();
        }}
      >
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-medium">
            I am looking into
          </legend>
          {grounds.map((item) => {
            const key = `${item.kind}:${item.id}`;

            return (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-2 text-sm"
              >
                <input
                  type="radio"
                  name="ground"
                  value={key}
                  checked={groundKey === key}
                  onChange={() => setGroundKey(key)}
                  className="accent-primary mt-1 size-3.5 shrink-0"
                />
                {item.label}
              </label>
            );
          })}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={reasonId} className="text-xs font-medium">
            Why you need to read it
          </label>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={ADMIN_VIEW_REASON_MIN}
            maxLength={ADMIN_VIEW_REASON_MAX}
            rows={2}
            required
          />
        </div>

        <Button
          type="submit"
          size="sm"
          className="self-start"
          disabled={isPending || reason.trim().length < ADMIN_VIEW_REASON_MIN}
          aria-busy={isPending}
        >
          {isPending ? <Loader2Icon className="animate-spin" /> : <EyeIcon />}
          Read conversation
        </Button>
      </form>
    );
  }

  const offersById = new Map(offers.map((offer) => [offer.id, offer]));

  return (
    <div className="flex flex-col gap-3">
      {hasOlder && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-center"
          onClick={() => read(messages[0]?.id)}
          disabled={isPending}
        >
          Load earlier messages (logged)
        </Button>
      )}

      <ol className="flex flex-col gap-3" aria-label="Conversation, read-only">
        {messages.length === 0 && (
          <li className="text-muted-foreground text-sm">No messages.</li>
        )}
        {messages.map((message) => (
          <li key={message.id} className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">
              {message.senderId
                ? (names.get(message.senderId) ?? "Former member")
                : "SamaanShare"}{" "}
              · {formatDateTime(message.createdAt)}
            </span>
            {message.kind === MessageKind.OFFER ? (
              <OfferCard
                offer={
                  message.offerId
                    ? (offersById.get(message.offerId) ?? null)
                    : null
                }
                // An id no member has, so no answer, withdraw or booking button can render.
                viewerId=""
                proposerName={
                  message.senderId
                    ? (names.get(message.senderId) ?? "Member")
                    : "Member"
                }
                context={{
                  listingId,
                  viewerIsRenter: false,
                  today: "9999-12-31",
                }}
              />
            ) : (
              <p className="bg-muted rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap">
                {message.body}
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export { AdminConversationReader };
