"use client";

import {
  ArrowDownIcon,
  CircleAlertIcon,
  HandshakeIcon,
  Loader2Icon,
  LockIcon,
  MessageCircleIcon,
  RotateCwIcon,
  SendHorizontalIcon,
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
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The log and the jump button share a frame, so the button sits just above the composer
          whatever height the composer has grown to. */}
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
          className="bg-background focus-visible:ring-ring min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-4 pb-6 outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-5"
        >
          {hasOlder && ordered.length < MAX_LOADED_MESSAGES && (
            <div className="mb-2 flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="bg-card rounded-full"
                onClick={loadOlder}
                aria-busy={isLoadingOlder}
              >
                {isLoadingOlder && <Loader2Icon className="animate-spin" />}
                Load earlier messages
              </Button>
            </div>
          )}

          {ordered.length === 0 && visiblePending.length === 0 && (
            <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-14 text-center">
              {/* The mint icon disc shared with the inbox's empty states. */}
              <span
                className="bg-brand-soft text-brand ring-brand-soft/50 mb-1 flex size-14 items-center justify-center rounded-full ring-8"
                aria-hidden="true"
              >
                <MessageCircleIcon className="size-6" strokeWidth={1.75} />
              </span>
              <p className="font-heading text-lg font-bold tracking-tight">
                Start the conversation
              </p>
              <p className="text-muted-foreground text-sm leading-relaxed">
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
                  // A floating pill on hairlines: the day is a landmark, not a heading, so it stays
                  // quieter than any message.
                  <div
                    className="my-5 flex items-center gap-3"
                    role="presentation"
                  >
                    <span className="bg-border h-px flex-1" />
                    <span className="text-muted-foreground bg-card rounded-full border px-3 py-1 text-xs font-medium shadow-xs">
                      {formatDayLabel(message.createdAt)}
                    </span>
                    <span className="bg-border h-px flex-1" />
                  </div>
                )}
                {message.id === firstUnreadId && (
                  <div
                    data-unread-divider
                    className="my-4 flex items-center gap-3"
                  >
                    {/* Emerald hairlines and a mint pill (brand-soft-foreground on brand-soft, 6.78:1): new is good
                        news, and the words carry it without the colour. */}
                    <span className="bg-brand/40 h-px flex-1" />
                    <span className="bg-brand-soft text-brand-soft-foreground border-brand/30 rounded-full border px-3 py-1 text-xs font-semibold">
                      New messages
                    </span>
                    <span className="bg-brand/40 h-px flex-1" />
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

          {/* The viewer's own unsent messages. The same bubble as a delivered one, so nothing jumps
            when the server's copy replaces it. Full-strength emerald in both states: a lighter
            emerald would drop white text to 3.75:1, so "Sending…" below says it instead. A failed
            one gains an alert mark and a retry - fading it would make the one thing the reader
            must act on the hardest to read. */}
          {visiblePending.map((item) => (
            <div
              key={item.clientId}
              className="mt-3 flex flex-col items-end gap-1"
            >
              <div className="flex max-w-[85%] items-end gap-1.5 sm:max-w-[70%]">
                {item.status === "failed" && (
                  <CircleAlertIcon
                    className="text-destructive mb-2 size-4 shrink-0"
                    aria-hidden="true"
                  />
                )}
                <p className="bg-brand text-brand-foreground min-w-0 rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap">
                  {item.body}
                </p>
              </div>
              {item.status === "sending" ? (
                <span className="text-muted-foreground flex items-center gap-1 pr-1 text-xs">
                  <Loader2Icon
                    className="size-3 animate-spin"
                    aria-hidden="true"
                  />
                  Sending…
                </span>
              ) : (
                <span className="text-destructive flex items-center gap-2 pr-1 text-xs font-medium">
                  Not sent.
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    className="bg-card text-foreground"
                    onClick={() => retry(item)}
                  >
                    <RotateCwIcon aria-hidden="true" />
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
            variant="outline"
            className="bg-card shadow-soft absolute right-4 bottom-4 z-10 rounded-full"
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
      </div>

      {/* The composer. Outside the scrolling log, so it stays put however long the thread is, and
          padded clear of the home indicator on phones that have one. */}
      <div className="bg-background px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
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
                className="text-foreground bg-card hover:bg-brand-soft hover:text-brand-soft-foreground hover:border-brand/40 focus-visible:ring-ring flex h-8 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2"
              >
                {text}
              </button>
            ))}
          </div>
        )}

        {/* One raised bar holding the offer button, the field and the send button, so the composer
            reads as a single control floating over the log. `border-input`, not `border`: the
            bar's outline is the field's only edge, and a control boundary needs 3:1 against the
            page (`--input` on the page, 3.38:1). The focus treatment matches `Input`. */}
        <form
          className="bg-card border-input shadow-soft hover:border-foreground/40 focus-within:border-ring focus-within:ring-ring/20 has-disabled:bg-muted has-disabled:hover:border-input flex items-end gap-1.5 rounded-2xl border p-1.5 transition-[border-color,box-shadow] focus-within:ring-3"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          {offerForm && canWrite && (
            <Button
              type="button"
              variant="secondary"
              className="h-10 shrink-0 rounded-xl max-sm:w-10 max-sm:px-0"
              onClick={() => setOfferOpen(true)}
              aria-label="Make an offer"
            >
              <HandshakeIcon />
              <span className="hidden sm:inline">Make an offer</span>
            </Button>
          )}

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
              canWrite ? `Message ${counterparty.name}` : "Conversation closed"
            }
            disabled={!canWrite}
            aria-describedby={hintId}
            // 16px below `md`, as `Input` does: smaller makes iOS zoom the page on focus. The
            // bar draws the focus ring, so the field itself needs no outline.
            className="placeholder:text-muted-foreground max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-base leading-6 outline-none disabled:cursor-not-allowed md:text-sm"
          />

          {/* Emerald, the default button: sending is the action this screen exists for. */}
          <Button
            type="submit"
            size="icon"
            className="size-10 shrink-0 rounded-xl"
            disabled={!canWrite || draft.trim().length === 0}
            aria-label="Send message"
          >
            <SendHorizontalIcon />
          </Button>
        </form>

        <p
          id={hintId}
          className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs"
        >
          {canWrite ? (
            <>
              {/* Visual on wider screens only - a phone needs the room for the messages, and
                  "Rent safely" in the details above says it too. Screen readers still hear it
                  with the composer, through `aria-describedby`. */}
              <LockIcon
                className="size-3 shrink-0 max-sm:hidden"
                aria-hidden="true"
              />
              <span>
                <span className="max-sm:sr-only">
                  Only an accepted offer changes the price. Keep payments on
                  SamaanShare.
                </span>
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
