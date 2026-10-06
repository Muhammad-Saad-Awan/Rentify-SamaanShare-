"use client";

import { Loader2Icon, SendHorizontalIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import {
  loadOlderMessages,
  markConversationRead,
  sendMessage,
} from "@/actions/chat";
import { MessageItem } from "@/components/chat/message-item";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MESSAGE_BODY_MAX } from "@/lib/chat/rules";
import { setActiveConversation, subscribeChat } from "@/lib/realtime/chat-bus";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { OfferContext } from "@/components/chat/offer-card";
import type { MessageKind } from "@/generated/prisma/enums";
import type { ChatMessageView, OfferView } from "@/lib/queries/chat";

/**
 * One conversation: the message log, the composer, and the read state.
 *
 * WHERE EACH PIECE OF STATE COMES FROM.
 *   - Messages: the server's newest page, then realtime events, then older pages on request. All
 *     merged by id, so a message that arrives both ways - an event and the refresh it triggers -
 *     is shown once.
 *   - Offers and bookings: props only. They come from the server render, and the subscriber's
 *     refresh after any chat event re-renders them. Nothing here is computed from an event's text.
 *   - The sender's own unsent messages: kept apart as `pending` until the server's copy arrives,
 *     matched by `clientId`, so an optimistic message never duplicates the real one.
 *
 * READ STATE. The thread is marked read when it opens, when it becomes visible again, and when a
 * message arrives while it is on screen. A hidden tab does not mark read - a message nobody has
 * looked at must stay unread.
 */

interface ChatThreadProps {
  conversationId: string;
  viewerId: string;
  counterpartyName: string;
  /** False once the other member is suspended or deleted. The composer is then closed. */
  canWrite: boolean;
  initialMessages: ChatMessageView[];
  initialHasOlder: boolean;
  /** This viewer's own read cursor, so opening an already-read thread writes nothing. */
  lastReadAt: Date | null;
  /** The other party's read cursor, for "Seen". */
  counterpartyLastReadAt: Date | null;
  offers: OfferView[];
  offerContext: OfferContext;
}

interface PendingMessage {
  clientId: string;
  body: string;
  status: "sending" | "failed";
}

/** Older pages are fetched one at a time; past this many on screen, stop offering more. */
const MAX_LOADED_MESSAGES = 600;

/** The least time between two read marks. A burst of messages becomes one write. */
const MARK_READ_INTERVAL_MS = 2000;

/** When the newest message not written by this viewer was sent, or `null` if there is none. */
function newestIncoming(
  messages: readonly ChatMessageView[],
  viewerId: string
): Date | null {
  let newest: Date | null = null;

  for (const message of messages) {
    if (
      message.senderId !== viewerId &&
      (!newest || message.createdAt > newest)
    ) {
      newest = message.createdAt;
    }
  }

  return newest;
}

function byTime(a: ChatMessageView, b: ChatMessageView): number {
  return (
    a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
  );
}

function merge(
  current: Map<string, ChatMessageView>,
  incoming: readonly ChatMessageView[]
): Map<string, ChatMessageView> {
  const next = new Map(current);

  for (const message of incoming) {
    next.set(message.id, message);
  }

  return next;
}

function ChatThread({
  conversationId,
  viewerId,
  counterpartyName,
  canWrite,
  initialMessages,
  initialHasOlder,
  lastReadAt,
  counterpartyLastReadAt,
  offers,
  offerContext,
}: ChatThreadProps) {
  const router = useRouter();
  const composerId = useId();
  const closedNoteId = useId();

  const [messages, setMessages] = useState(() =>
    merge(new Map(), initialMessages)
  );
  const [hasOlder, setHasOlder] = useState(initialHasOlder);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [seenAt, setSeenAt] = useState(counterpartyLastReadAt);
  const [isLoadingOlder, startLoadingOlder] = useTransition();

  const logRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastMarkedAt = useRef(0);
  const deferredMark = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** This viewer's read cursor, as far as this tab knows. */
  const readCursor = useRef<Date | null>(lastReadAt);
  /** The newest message not written by this viewer. Nothing to mark read until it passes the cursor. */
  const newestIncomingAt = useRef<Date | null>(
    newestIncoming(initialMessages, viewerId)
  );

  // A refresh brings the server's newest page again. Merge it rather than replace: older pages and
  // realtime arrivals the refresh does not include must survive it.
  useEffect(() => {
    setMessages((current) => merge(current, initialMessages));

    const newest = newestIncoming(initialMessages, viewerId);

    if (
      newest &&
      (!newestIncomingAt.current || newest > newestIncomingAt.current)
    ) {
      newestIncomingAt.current = newest;
    }
  }, [initialMessages, viewerId]);

  useEffect(() => {
    setSeenAt((current) =>
      counterpartyLastReadAt && (!current || counterpartyLastReadAt > current)
        ? counterpartyLastReadAt
        : current
    );
  }, [counterpartyLastReadAt]);

  /**
   * Marks read - only when something from the other side is newer than this viewer's cursor, only
   * while the page is visible, and at most every couple of seconds.
   *
   * A call inside the throttle window is DEFERRED to its end, not dropped: a message arriving a
   * second after the thread opened must still be marked read.
   *
   * Not awaited and not reported: a missed read receipt is a badge that clears on the next mark,
   * never a lost message.
   */
  const markRead = useCallback(() => {
    if (document.visibilityState !== "visible") {
      return;
    }

    if (
      !newestIncomingAt.current ||
      (readCursor.current && newestIncomingAt.current <= readCursor.current)
    ) {
      return;
    }

    const wait = lastMarkedAt.current + MARK_READ_INTERVAL_MS - Date.now();

    if (wait > 0) {
      if (deferredMark.current === null) {
        deferredMark.current = setTimeout(() => {
          deferredMark.current = null;
          markReadRef.current();
        }, wait);
      }

      return;
    }

    lastMarkedAt.current = Date.now();
    readCursor.current = newestIncomingAt.current;

    void markConversationRead({ conversationId }).then((result) => {
      // The header badge is a Server Component.
      if (result.success && result.data.readAt) {
        router.refresh();
      }
    });
  }, [conversationId, router]);

  const markReadRef = useRef(markRead);

  useEffect(() => {
    markReadRef.current = markRead;
  }, [markRead]);

  useEffect(
    () => () => {
      if (deferredMark.current !== null) {
        clearTimeout(deferredMark.current);
      }
    },
    []
  );

  useEffect(() => {
    const release = setActiveConversation(conversationId);

    markRead();

    function onVisible() {
      if (document.visibilityState === "visible") {
        markRead();
      }
    }

    document.addEventListener("visibilitychange", onVisible);

    const unsubscribe = subscribeChat((event) => {
      if (event.data.conversationId !== conversationId) {
        return;
      }

      if (event.type === "read") {
        if (event.data.readerId !== viewerId) {
          const readAt = new Date(event.data.readAt);

          setSeenAt((current) =>
            !current || readAt > current ? readAt : current
          );
        }

        return;
      }

      const data = event.data;
      const message: ChatMessageView = {
        id: data.id,
        senderId: data.senderId,
        kind: data.kind as MessageKind,
        body: data.body,
        offerId: data.offerId,
        clientId: data.clientId,
        createdAt: new Date(data.createdAt),
      };

      setMessages((current) => merge(current, [message]));

      if (message.clientId) {
        setPending((current) =>
          current.filter((item) => item.clientId !== message.clientId)
        );
      }

      if (message.senderId !== viewerId) {
        if (
          !newestIncomingAt.current ||
          message.createdAt > newestIncomingAt.current
        ) {
          newestIncomingAt.current = message.createdAt;
        }

        markRead();
      }
    });

    return () => {
      release();
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [conversationId, viewerId, markRead]);

  const ordered = useMemo(
    () => [...messages.values()].sort(byTime),
    [messages]
  );

  // Hide an optimistic copy as soon as the real message is on screen, whichever way it came.
  const visiblePending = useMemo(() => {
    const delivered = new Set(
      ordered.map((message) => message.clientId).filter(Boolean)
    );

    return pending.filter((item) => !delivered.has(item.clientId));
  }, [ordered, pending]);

  // Follow new messages, unless the reader has scrolled up to read history.
  useEffect(() => {
    const log = logRef.current;

    if (log && stickToBottom.current) {
      log.scrollTop = log.scrollHeight;
    }
  }, [ordered.length, visiblePending.length]);

  function onScroll() {
    const log = logRef.current;

    if (log) {
      stickToBottom.current =
        log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    }
  }

  const offersById = useMemo(
    () => new Map(offers.map((offer) => [offer.id, offer])),
    [offers]
  );

  // "Seen" goes under the newest of the viewer's own messages the other side has read.
  const lastSeenOwnId = useMemo(() => {
    if (!seenAt) {
      return null;
    }

    for (let index = ordered.length - 1; index >= 0; index -= 1) {
      const message = ordered[index]!;

      if (message.senderId === viewerId && message.createdAt <= seenAt) {
        return message.id;
      }
    }

    return null;
  }, [ordered, seenAt, viewerId]);

  function loadOlder() {
    const oldest = ordered[0];

    if (!oldest) {
      return;
    }

    stickToBottom.current = false;

    startLoadingOlder(async () => {
      const result = await loadOlderMessages({
        conversationId,
        beforeId: oldest.id,
      });

      if (!result.success) {
        toast.error(result.error);

        return;
      }

      setMessages((current) => merge(current, result.data.messages));
      setHasOlder(result.data.hasOlder);
    });
  }

  async function deliver(item: PendingMessage) {
    const result = await sendMessage({
      conversationId,
      body: item.body,
      clientId: item.clientId,
    });

    if (result.success) {
      const sent = result.data.message;

      setMessages((current) =>
        merge(current, [{ ...sent, kind: sent.kind as MessageKind }])
      );

      return;
    }

    setPending((current) =>
      current.map((entry) =>
        entry.clientId === item.clientId
          ? { ...entry, status: "failed" }
          : entry
      )
    );

    toast.error(
      result.error === UNAUTHENTICATED_ERROR
        ? "Your session has expired. Sign in again to send messages."
        : result.error
    );
  }

  function send() {
    const body = draft.trim();

    if (!body || !canWrite) {
      return;
    }

    const item: PendingMessage = {
      clientId: crypto.randomUUID(),
      body,
      status: "sending",
    };

    stickToBottom.current = true;
    setDraft("");
    setPending((current) => [...current, item]);
    void deliver(item);
  }

  /** Retries with the SAME clientId, so a send that actually landed is not written twice. */
  function retry(item: PendingMessage) {
    const again = { ...item, status: "sending" as const };

    setPending((current) =>
      current.map((entry) => (entry.clientId === item.clientId ? again : entry))
    );
    void deliver(again);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter is a new line - and never while an IME is composing a character.
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      send();
    }
  }

  return (
    <div className="bg-card flex min-h-[28rem] flex-col rounded-xl border">
      <div
        ref={logRef}
        onScroll={onScroll}
        role="log"
        aria-label={`Conversation with ${counterpartyName}`}
        aria-live="polite"
        aria-relevant="additions"
        // Focusable so keyboard users can scroll the history.
        tabIndex={0}
        className="focus-visible:ring-ring flex max-h-[60vh] min-h-72 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 outline-none focus-visible:ring-2 sm:px-4"
      >
        {hasOlder && ordered.length < MAX_LOADED_MESSAGES && (
          <div className="flex justify-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={loadOlder}
              aria-busy={isLoadingOlder}
            >
              {isLoadingOlder && <Loader2Icon className="animate-spin" />}
              Load earlier messages
            </Button>
          </div>
        )}

        {ordered.length === 0 && visiblePending.length === 0 && (
          <p className="text-muted-foreground m-auto max-w-sm text-center text-sm">
            No messages yet. Ask about the item, agree on pickup, or propose
            terms below.
          </p>
        )}

        {ordered.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            viewerId={viewerId}
            counterpartyName={counterpartyName}
            offer={
              message.offerId ? (offersById.get(message.offerId) ?? null) : null
            }
            offerContext={offerContext}
            seen={message.id === lastSeenOwnId}
          />
        ))}

        {visiblePending.map((item) => (
          <div key={item.clientId} className="flex flex-col items-end gap-1">
            <p className="bg-primary/70 text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm break-words whitespace-pre-wrap sm:max-w-[70%]">
              {item.body}
            </p>
            {item.status === "sending" ? (
              <span className="text-muted-foreground text-xs">Sending…</span>
            ) : (
              <span className="text-destructive flex items-center gap-2 text-xs">
                Not sent.
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto p-0"
                  onClick={() => retry(item)}
                >
                  Retry
                </Button>
              </span>
            )}
          </div>
        ))}
      </div>

      <form
        className="flex flex-col gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <label htmlFor={composerId} className="sr-only">
          Message {counterpartyName}
        </label>
        {!canWrite && (
          <p id={closedNoteId} className="text-muted-foreground text-xs">
            This member&apos;s account is no longer active, so the conversation
            is closed. You can still read it.
          </p>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            id={composerId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MESSAGE_BODY_MAX}
            rows={2}
            placeholder={
              canWrite ? `Message ${counterpartyName}` : "Conversation closed"
            }
            disabled={!canWrite}
            aria-describedby={canWrite ? undefined : closedNoteId}
            className="max-h-40 min-h-11 flex-1 resize-y"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!canWrite || draft.trim().length === 0}
            aria-label="Send message"
          >
            <SendHorizontalIcon />
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Prices agreed here are not binding. Use{" "}
          <span className="font-medium">Propose terms</span> to make an offer
          the other side can accept.
        </p>
      </form>
    </div>
  );
}

export { ChatThread };
