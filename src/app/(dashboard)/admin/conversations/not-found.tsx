import { MessagesSquareIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conversation not found",
  robots: { index: false, follow: false },
};

/**
 * Shown for an id that matches no conversation. Here rather than in `[id]`, because the existence
 * check runs in `[id]/layout.tsx` and a layout's `notFound()` bubbles past its own segment.
 */
export default function AdminConversationNotFound() {
  return (
    <EmptyState
      icon={MessagesSquareIcon}
      title="No such conversation"
      description="That id does not match any conversation. Conversations are never deleted, so this is a mistyped id rather than a removed record."
      action={
        <Button size="sm" render={<Link href="/admin/bookings" />}>
          Back to bookings
        </Button>
      }
    />
  );
}
