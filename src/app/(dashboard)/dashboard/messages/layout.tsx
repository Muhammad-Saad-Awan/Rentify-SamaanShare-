import { ConversationList } from "@/components/chat/conversation-list";
import { MessagesShell } from "@/components/chat/messages-shell";
import { requireUser } from "@/lib/auth/session";
import { listConversations } from "@/lib/queries/chat";

import type { ReactNode } from "react";

interface MessagesLayoutProps {
  children: ReactNode;
}

/** How many conversations the list holds. Far more than anyone keeps active at once. */
const INBOX_SIZE = 100;

/**
 * The messenger frame: the conversation list beside whichever thread is open.
 *
 * NO `<Suspense>` AND NO `loading.tsx` HERE, deliberately. Either would let the shell flush with a
 * 200 before `[id]/layout.tsx` has decided whether the viewer may see the thread, turning its 404
 * into a soft one - see AGENTS.md. The list is one indexed query plus one aggregate, cheap enough to
 * render before the first byte.
 *
 * Re-runs on every `router.refresh()`, which the realtime subscriber triggers when a message
 * arrives, so the order, previews and unread counts are always the database's.
 */
export default async function MessagesLayout({
  children,
}: MessagesLayoutProps) {
  const user = await requireUser();
  const conversations = await listConversations(user.id, { take: INBOX_SIZE });

  return (
    <MessagesShell list={<ConversationList conversations={conversations} />}>
      {children}
    </MessagesShell>
  );
}
