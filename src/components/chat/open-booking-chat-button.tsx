"use client";

import { MessageCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { openBookingConversation } from "@/actions/chat";
import { Button } from "@/components/ui/button";
import { conversationHref } from "@/lib/chat/routes";

interface OpenBookingChatButtonProps {
  bookingId: string;
  /** Who is on the other side, for the label: "Message owner" or "Message renter". */
  counterpartRole: "owner" | "renter";
}

/**
 * The way into a booking's conversation, from either side - including an owner, who cannot open a
 * conversation from a listing, and a booking made before chat existed.
 */
function OpenBookingChatButton({
  bookingId,
  counterpartRole,
}: OpenBookingChatButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function open() {
    startTransition(async () => {
      const result = await openBookingConversation({ bookingId });

      if (!result.success) {
        toast.error(result.error);

        return;
      }

      router.push(conversationHref(result.data.conversationId));
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={open}
      aria-busy={isPending}
      disabled={isPending}
    >
      <MessageCircleIcon />
      Message {counterpartRole}
    </Button>
  );
}

export { OpenBookingChatButton };
