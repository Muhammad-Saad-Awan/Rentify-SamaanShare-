import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { isConversationParticipant } from "@/lib/queries/chat";

import type { ReactNode } from "react";

interface ConversationLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * The participant check, in a layout so it runs before the first byte is sent.
 *
 * In the page, a Suspense fallback could flush a 200 first and the `notFound()` would become a soft
 * 404 - and here a soft 404 would also tell a stranger probing ids nothing different from success.
 * This is the third route in this codebase that pattern has bitten; see AGENTS.md.
 *
 * Nothing above this segment may add a `loading.tsx`.
 */
export default async function ConversationLayout({
  children,
  params,
}: ConversationLayoutProps) {
  const user = await requireUser();
  const { id } = await params;

  if (!(await isConversationParticipant(id, user.id))) {
    // Identical for "no such conversation" and "not yours".
    notFound();
  }

  return children;
}
