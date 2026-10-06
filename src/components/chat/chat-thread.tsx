"use client";

import {
  ArrowDownIcon,
  HandshakeIcon,
  Loader2Icon,
  LockIcon,
  SendHorizontalIcon,
  SparklesIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Fragment,
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
import { OfferSheet } from "@/components/chat/offer-form";
import { Button } from "@/components/ui/button";
import { MessageKind } from "@/generated/prisma/enums";
import { MESSAGE_BODY_MAX } from "@/lib/chat/rules";
import { setActiveConversation, subscribeChat } from "@/lib/realtime/chat-bus";
import { cn } from "@/lib/utils/cn";
import { formatDayLabel, karachiDay } from "@/lib/utils/date";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { OfferFormProps } from "@/components/chat/offer-form";
import type { OfferContext } from "@/components/chat/offer-card";
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
  counterparty: { name: string; image: string | null };
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
  /** Everything the offer sheet needs. `null` when no offer can be made here. */
  offerForm: OfferFormProps | null;
  /** Suggested openers for the composer, chosen by the server for this stage of the rental. */
  quickReplies: string[];
  /** A question carried over from the listing page, placed in the composer to edit or send. */
  initialDraft?: string | undefined;
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

/** Messages from one sender this close together read as one run. */
const GROUP_WINDOW_MS = 5 * 60_000;

/** How tall the composer may grow before it scrolls. */
const COMPOSER_MAX_PX = 160;

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

/** Whether two adjacent messages belong to one visual run. SYSTEM lines always stand alone. */
function sameRun(
  a: ChatMessageView | undefined,
  b: ChatMessageView | undefined
): boolean {
  return (
    !!a &&
    !!b &&
    a.kind !== MessageKind.SYSTEM &&
    b.kind !== MessageKind.SYSTEM &&
    a.senderId === b.senderId &&
    Math.abs(b.createdAt.getTime() - a.createdAt.getTime()) < GROUP_WINDOW_MS &&
    karachiDay(a.createdAt) === karachiDay(b.createdAt)
  );
}

function ChatThread({
  conversationId,
  viewerId,
  counterparty,
  canWrite,
  initialMessages,
  initialHasOlder,
  lastReadAt,
  counterpartyLastReadAt,
  offers,
  offerContext,
  offerForm,
  quickReplies,
  initialDraft,
}: ChatThreadProps) {
  const router = useRouter();
  const composerId = useId();
  const hintId = useId();

  const [messages, setMessages] = useState(() =>
    merge(new Map(), initialMessages)
  );
  const [hasOlder, setHasOlder] = useState(initialHasOlder);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [seenAt, setSeenAt] = useState(counterpartyLastReadAt);
  const [offerOpen, setOfferOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [missed, setMissed] = useState(0);
  const [isLoadingOlder, startLoadingOlder] = useTransition();

  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const lastMarkedAt = useRef(0);
  const deferredMark = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** This viewer's read cursor, as far as this tab knows. */
  const readCursor = useRef<Date | null>(lastReadAt);
  /** The newest message not written by this viewer. Nothing to mark read until it passes the cursor. */
  const newestIncomingAt = useRef<Date | null>(
    newestIncoming(initialMessages, viewerId)
  );

  /**
   * Where "New messages" goes: the first unread message when the thread was opened. Fixed for the
   * life of the page, so marking the thread read does not make the divider jump or vanish while the
   * person is still reading below it.
   */
  const [firstUnreadId] = useState(() => {
    const first = [...initialMessages]
      .sort(byTime)
      .find(
        (message) =>
          message.senderId !== viewerId &&
          (!lastReadAt || message.createdAt > lastReadAt)
      );

    return first?.id ?? null;
  });

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
      // The header badge, the sidebar badge and the list are Server Components.
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

        if (!stickToBottom.current) {
          setMissed((count) => count + 1);
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

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const log = logRef.current;

    if (log) {
      log.scrollTo({ top: log.scrollHeight, behavior });
    }
  }, []);

  // Open at the first unread message if there is one, else at the bottom.
  useEffect(() => {
    const divider = firstUnreadId
      ? logRef.current?.querySelector("[data-unread-divider]")
      : null;

    if (divider instanceof HTMLElement && logRef.current) {
      logRef.current.scrollTop = Math.max(0, divider.offsetTop - 80);
    } else {
      scrollToBottom();
    }
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow new messages, unless the reader has scrolled up to read history.
  useEffect(() => {
    if (stickToBottom.current) {
      scrollToBottom();
    }
  }, [ordered.length, visiblePending.length, scrollToBottom]);

  // A question carried over from a listing: ready to edit, with the cursor at its end.
  useEffect(() => {
    if (!initialDraft) {
      return;
    }

    const composer = composerRef.current;

    composer?.focus();
    composer?.setSelectionRange(initialDraft.length, initialDraft.length);

    // Drop `?draft=` so a refresh does not put it back after it has been sent.
    const url = new URL(window.location.href);

    url.searchParams.delete("draft");
    window.history.replaceState(window.history.state, "", url);
  }, [initialDraft]);

  // Grow the composer with its content, up to a limit.
  useEffect(() => {
    const composer = composerRef.current;

    if (composer) {
      composer.style.height = "auto";
      composer.style.height = `${Math.min(composer.scrollHeight, COMPOSER_MAX_PX)}px`;
    }
  }, [draft]);

  function onScroll() {
    const log = logRef.current;

    if (!log) {
      return;
    }

    const bottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;

    stickToBottom.current = bottom;
    setAtBottom(bottom);

    if (bottom) {
      setMissed(0);
    }
  }

  const offersById = useMemo(
    () => new Map(offers.map((offer) => [offer.id, offer])),
    [offers]
  );

  /** Whether the other side has read a message of the viewer's. */
  const isSeen = (message: ChatMessageView) =>
    seenAt !== null && message.createdAt <= seenAt;

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
    composerRef.current?.focus();
  }

  /** Retries with the SAME clientId, so a send that actually landed is not written twice. */
  function retry(item: PendingMessage) {
    const again = { ...item, status: "sending" as const };

    setPending((current) =>
      current.map((entry) => (entry.clientId === item.clientId ? again : entry))
    );
    void deliver(again);
  }

  function applyQuickReply(text: string) {
    setDraft(text);
    composerRef.current?.focus();
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

  const remaining = MESSAGE_BODY_MAX - draft.length;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={logRef}
        onScroll={onScroll}
        role="log"
        aria-label={`Conversation with ${counterparty.name}`}
        aria-live="polite"
        aria-relevant="additions"
        // Focusable so keyboard users can scroll the history.
        tabIndex={0}
        className="bg-muted/20 focus-visible:ring-ring min-h-0 flex-1 overflow-y-auto px-3 pt-4 pb-6 outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-5"
      >
        {hasOlder && ordered.length < MAX_LOADED_MESSAGES && (
          <div className="mb-2 flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={loadOlder}
              aria-busy={isLoadingOlder}
            >
              {isLoadingOlder && <Loader2Icon className="animate-spin" />}
              Load earlier messages
            </Button>
          </div>
        )}

        {ordered.length === 0 && visiblePending.length === 0 && (
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-10 text-center">
            <span className="bg-background flex size-12 items-center justify-center rounded-full border shadow-xs">
              <SparklesIcon
                className="text-muted-foreground size-5"
                aria-hidden="true"
              />
            </span>
            <p className="text-sm font-medium">Start the conversation</p>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Ask about the item&apos;s condition, what&apos;s included, or
              where to pick it up. When you agree on a price, send it as an
              offer.
            </p>
          </div>
        )}

        {ordered.map((message, index) => {
          const previous = ordered[index - 1];
          const next = ordered[index + 1];
          const newDay =
            !previous ||
            karachiDay(previous.createdAt) !== karachiDay(message.createdAt);

          return (
            <Fragment key={message.id}>
              {newDay && (
                <div
                  className="my-4 flex items-center gap-3"
                  role="presentation"
                >
                  <span className="bg-border h-px flex-1" />
                  <span className="text-muted-foreground bg-background rounded-full border px-3 py-0.5 text-[11px] font-medium">
                    {formatDayLabel(message.createdAt)}
                  </span>
                  <span className="bg-border h-px flex-1" />
                </div>
              )}
              {message.id === firstUnreadId && (
                <div
                  data-unread-divider
                  className="my-3 flex items-center gap-3"
                >
                  <span className="h-px flex-1 bg-sky-500/60" />
                  <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">
                    New messages
                  </span>
                  <span className="h-px flex-1 bg-sky-500/60" />
                </div>
              )}
              <MessageItem
                message={message}
                viewerId={viewerId}
                counterparty={counterparty}
                offer={
                  message.offerId
                    ? (offersById.get(message.offerId) ?? null)
                    : null
                }
                offerContext={offerContext}
                isFirstInGroup={newDay || !sameRun(previous, message)}
                isLastInGroup={!sameRun(message, next)}
                isSeen={isSeen(message)}
              />
            </Fragment>
          );
        })}

        {visiblePending.map((item) => (
          <div
            key={item.clientId}
            className="mt-3 flex flex-col items-end gap-1"
          >
            <p
              className={cn(
                "bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap sm:max-w-[70%]",
                item.status === "sending" ? "opacity-70" : "opacity-50"
              )}
            >
              {item.body}
            </p>
            {item.status === "sending" ? (
              <span className="text-muted-foreground pr-1 text-[11px]">
                Sending…
              </span>
            ) : (
              <span className="text-destructive flex items-center gap-2 pr-1 text-xs">
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

      {!atBottom && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="absolute right-4 bottom-36 z-10 rounded-full shadow-md"
          onClick={() => {
            stickToBottom.current = true;
            setMissed(0);
            scrollToBottom("smooth");
          }}
        >
          <ArrowDownIcon />
          {missed > 0
            ? `${missed} new message${missed === 1 ? "" : "s"}`
            : "Latest"}
        </Button>
      )}

      <div className="bg-background border-t px-3 pt-2.5 pb-3 sm:px-4">
        {canWrite && draft.length === 0 && quickReplies.length > 0 && (
          <div
            className="mb-2.5 flex gap-2 overflow-x-auto pb-0.5"
            role="group"
            aria-label="Suggested messages"
          >
            {quickReplies.map((text) => (
              <button
                key={text}
                type="button"
                onClick={() => applyQuickReply(text)}
                className="text-foreground hover:bg-muted focus-visible:ring-ring shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors outline-none focus-visible:ring-2"
              >
                {text}
              </button>
            ))}
          </div>
        )}

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          {offerForm && canWrite && (
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0 rounded-full"
              onClick={() => setOfferOpen(true)}
              aria-label="Make an offer"
            >
              <HandshakeIcon />
              <span className="hidden sm:inline">Make an offer</span>
            </Button>
          )}

          <div className="bg-muted/50 focus-within:ring-ring flex min-h-11 flex-1 items-end rounded-3xl border px-4 py-2.5 focus-within:ring-2">
            <label htmlFor={composerId} className="sr-only">
              Message {counterparty.name}
            </label>
            <textarea
              ref={composerRef}
              id={composerId}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              maxLength={MESSAGE_BODY_MAX}
              rows={1}
              placeholder={
                canWrite
                  ? `Message ${counterparty.name}`
                  : "Conversation closed"
              }
              disabled={!canWrite}
              aria-describedby={hintId}
              className="placeholder:text-muted-foreground max-h-40 w-full resize-none bg-transparent text-sm leading-6 outline-none disabled:cursor-not-allowed"
            />
          </div>

          <Button
            type="submit"
            size="icon"
            className="size-11 shrink-0 rounded-full"
            disabled={!canWrite || draft.trim().length === 0}
            aria-label="Send message"
          >
            <SendHorizontalIcon />
          </Button>
        </form>

        <p
          id={hintId}
          className="text-muted-foreground mt-2 flex items-center gap-1.5 text-[11px]"
        >
          {canWrite ? (
            <>
              <LockIcon className="size-3 shrink-0" aria-hidden="true" />
              <span>
                Only an accepted offer changes the price. Keep payments on
                SamaanShare.
                {remaining < 200 && ` ${remaining} characters left.`}
              </span>
            </>
          ) : (
            <span>
              This member&apos;s account is no longer active, so the
              conversation is closed. You can still read it.
            </span>
          )}
        </p>
      </div>

      {offerForm && (
        <OfferSheet
          {...offerForm}
          open={offerOpen}
          onOpenChange={setOfferOpen}
        />
      )}
    </div>
  );
}

export { ChatThread };
