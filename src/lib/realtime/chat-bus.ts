import type { ChatMessageEvent, ChatReadEvent } from "@/lib/realtime/channels";

/**
 * In-page hand-off from the one socket to whatever chat UI is mounted. Browser-side.
 *
 * WHY A BUS AND NOT A SECOND SUBSCRIPTION. The dashboard layout opens exactly one Pusher connection
 * per tab, and the free tier counts connections, not messages. An open thread subscribing again
 * would double that. Instead `RealtimeNotifications` forwards chat events here and the thread
 * listens.
 *
 * `activeConversation` lets the subscriber tell whether a message is already on screen, so it does
 * not raise a toast for a conversation the person is reading.
 *
 * Module state, deliberately: there is one socket per tab, so there is one bus per tab. Nothing
 * here survives a reload, and nothing needs to - the database is the record.
 */

export type ChatBusEvent =
  | { type: "message"; data: ChatMessageEvent }
  | { type: "read"; data: ChatReadEvent };

type Listener = (event: ChatBusEvent) => void;

const listeners = new Set<Listener>();

let activeConversation: string | null = null;

/** Registers a listener; returns the function that removes it. */
export function subscribeChat(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function emitChat(event: ChatBusEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

/**
 * Marks a conversation as the one on screen, or none.
 *
 * Returns a cleanup that clears it only if it is still this one, so a fast navigation from one
 * thread to another cannot have the old thread's unmount wipe the new thread's claim.
 */
export function setActiveConversation(conversationId: string): () => void {
  activeConversation = conversationId;

  return () => {
    if (activeConversation === conversationId) {
      activeConversation = null;
    }
  };
}

export function isActiveConversation(conversationId: string): boolean {
  return activeConversation === conversationId;
}
