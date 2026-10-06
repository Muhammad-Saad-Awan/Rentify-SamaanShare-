"use client";

import { Loader2Icon, MessageCircleIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { startConversation } from "@/actions/chat";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CALLBACK_URL_PARAM, LOGIN_ROUTE } from "@/config/routes";
import { conversationHref } from "@/lib/chat/routes";
import { UNAUTHENTICATED_ERROR } from "@/types";

interface MessageOwnerButtonProps {
  listingId: string;
  /** The owner's name, for "Ask Ayesha". */
  ownerName: string;
  isAuthenticated: boolean;
}

/** The questions renters most often start with. Tapping one opens the thread with it ready to send. */
const QUICK_QUESTIONS = [
  "Is it available on my dates?",
  "What's included?",
  "Where is pickup?",
  "What condition is it in?",
];

/**
 * First contact with an owner, from a listing: a card with one-tap questions and a plain button.
 *
 * A question is not sent on tap - it opens the conversation with the question in the composer, so
 * the renter can add their dates or send it as it is. Sending something on the renter's behalf from
 * a single tap would put words in their mouth.
 *
 * Signed out, every control is a link to sign in that returns here. The action applies the email
 * gate and the first-contact limit; this only reports what it says. Not rendered for the owner.
 */
function MessageOwnerButton({
  listingId,
  ownerName,
  isAuthenticated,
}: MessageOwnerButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [busyWith, setBusyWith] = useState<string | null>(null);

  const firstName = ownerName.split(/\s+/)[0] || "the owner";
  const loginHref = `${LOGIN_ROUTE}?${CALLBACK_URL_PARAM}=${encodeURIComponent(pathname)}`;

  function open(question?: string) {
    setBusyWith(question ?? "button");

    startTransition(async () => {
      const result = await startConversation({ listingId });

      if (result.success) {
        const href = conversationHref(result.data.conversationId);

        router.push(
          question ? `${href}?draft=${encodeURIComponent(question)}` : href
        );

        return;
      }

      setBusyWith(null);
      toast.error(
        result.error === UNAUTHENTICATED_ERROR
          ? "Your session has expired. Sign in again to message the owner."
          : result.error
      );
    });
  }

  return (
    <Card className="gap-3 py-4">
      <div className="flex flex-col gap-1 px-(--card-spacing)">
        <p className="flex items-center gap-2 text-sm font-medium">
          <MessageCircleIcon className="size-4" aria-hidden="true" />
          Questions? Ask {firstName}
        </p>
        <p className="text-muted-foreground text-xs">
          Most owners reply within a few hours. You can agree a price in chat
          with an offer.
        </p>
      </div>

      <div
        className="flex flex-wrap gap-2 px-(--card-spacing)"
        role="group"
        aria-label="Quick questions"
      >
        {QUICK_QUESTIONS.map((question) =>
          isAuthenticated ? (
            <button
              key={question}
              type="button"
              onClick={() => open(question)}
              disabled={isPending}
              className="hover:bg-muted focus-visible:ring-ring rounded-full border px-3 py-1.5 text-xs transition-colors outline-none focus-visible:ring-2 disabled:opacity-60"
            >
              {busyWith === question && (
                <Loader2Icon
                  className="mr-1 inline size-3 animate-spin"
                  aria-hidden="true"
                />
              )}
              {question}
            </button>
          ) : (
            <Link
              key={question}
              href={loginHref}
              className="hover:bg-muted focus-visible:ring-ring rounded-full border px-3 py-1.5 text-xs transition-colors outline-none focus-visible:ring-2"
            >
              {question}
            </Link>
          )
        )}
      </div>

      <div className="px-(--card-spacing)">
        {isAuthenticated ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => open()}
            aria-busy={busyWith === "button"}
            disabled={isPending}
          >
            <MessageCircleIcon />
            Message the owner
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            render={<Link href={loginHref} />}
          >
            <MessageCircleIcon />
            Sign in to message the owner
          </Button>
        )}
      </div>
    </Card>
  );
}

export { MessageOwnerButton };
