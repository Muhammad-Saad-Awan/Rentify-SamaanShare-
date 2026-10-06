import { MessagesSquareIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { MESSAGES_ROUTE } from "@/lib/chat/routes";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conversation not found",
};

/**
 * Shown for a conversation that does not exist or is not the viewer's.
 *
 * In the `messages` segment, not inside `[id]`: the participant check runs in `[id]/layout.tsx`,
 * and a `notFound()` thrown from a layout bubbles past that layout's own segment - see AGENTS.md.
 * One message for both cases, so the route cannot be used to learn whether an id is real.
 */
export default function ConversationNotFound() {
  return (
    <EmptyState
      icon={MessagesSquareIcon}
      title="Conversation not found"
      description="This conversation does not exist, or you are not part of it."
      action={
        <Button size="sm" render={<Link href={MESSAGES_ROUTE} />}>
          Back to messages
        </Button>
      }
    />
  );
}
