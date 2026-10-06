import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/session";
import { getAdminConversationHeader } from "@/lib/queries/chat";

import type { ReactNode } from "react";

interface AdminConversationLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * Existence check before the first byte, so an unknown id is a real 404 - see AGENTS.md.
 *
 * Reads only who and what the conversation is about, never a message. Messages are returned by the
 * logged action once a ground and a reason have been given.
 */
export default async function AdminConversationLayout({
  children,
  params,
}: AdminConversationLayoutProps) {
  await requireAdmin();
  const { id } = await params;

  if (!(await getAdminConversationHeader(id))) {
    notFound();
  }

  return children;
}
