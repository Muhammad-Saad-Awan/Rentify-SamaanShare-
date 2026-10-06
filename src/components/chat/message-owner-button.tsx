"use client";

import { MessageCircleIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { startConversation } from "@/actions/chat";
import { Button } from "@/components/ui/button";
import { CALLBACK_URL_PARAM, LOGIN_ROUTE } from "@/config/routes";
import { conversationHref } from "@/lib/chat/routes";
import { UNAUTHENTICATED_ERROR } from "@/types";

interface MessageOwnerButtonProps {
  listingId: string;
  isAuthenticated: boolean;
}

/**
 * First contact with an owner, from a listing.
 *
 * Signed out, it is a link to sign in that returns here. Signed in, it opens - or reopens - the
 * conversation and goes to it. The action applies the email gate and the first-contact limit; this
 * only reports what it says. The page does not render it for the listing's own owner.
 */
function MessageOwnerButton({
  listingId,
  isAuthenticated,
}: MessageOwnerButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  if (!isAuthenticated) {
    return (
      <Button
        variant="outline"
        className="w-full"
        render={
          <Link
            href={`${LOGIN_ROUTE}?${CALLBACK_URL_PARAM}=${encodeURIComponent(pathname)}`}
          />
        }
      >
        <MessageCircleIcon />
        Sign in to message the owner
      </Button>
    );
  }

  function open() {
    startTransition(async () => {
      const result = await startConversation({ listingId });

      if (result.success) {
        router.push(conversationHref(result.data.conversationId));

        return;
      }

      toast.error(
        result.error === UNAUTHENTICATED_ERROR
          ? "Your session has expired. Sign in again to message the owner."
          : result.error
      );
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={open}
      aria-busy={isPending}
      disabled={isPending}
    >
      <MessageCircleIcon />
      Message the owner
    </Button>
  );
}

export { MessageOwnerButton };
