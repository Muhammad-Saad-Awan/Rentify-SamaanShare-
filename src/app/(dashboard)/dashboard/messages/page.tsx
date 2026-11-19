import {
  HandshakeIcon,
  MessagesSquareIcon,
  ShieldCheckIcon,
} from "lucide-react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Messages",
  description: "Your conversations with owners and renters on SamaanShare.",
};

/**
 * The right-hand pane before a conversation is chosen. On a phone the list fills the screen and
 * this is not shown - see `MessagesShell`.
 */
export default function MessagesPage() {
  return (
    <div className="bg-background flex flex-1 flex-col items-center justify-center gap-6 px-8 py-12 text-center">
      {/* The mint icon disc the empty list and the empty thread use too, so they match. */}
      <span
        className="bg-brand-soft text-brand ring-brand-soft/50 flex size-16 items-center justify-center rounded-full ring-8"
        aria-hidden="true"
      >
        <MessagesSquareIcon className="size-7" strokeWidth={1.75} />
      </span>
      <div className="flex max-w-sm flex-col gap-2">
        <h2 className="font-heading text-xl font-bold tracking-[-0.025em]">
          Your messages
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Choose a conversation to read it. Ask about an item, arrange pickup,
          get help during a rental, or sort out the return.
        </p>
      </div>
      <ul className="bg-card shadow-soft flex max-w-sm flex-col gap-3.5 rounded-2xl border p-4 text-left text-sm">
        <li className="flex gap-3">
          <HandshakeIcon
            className="text-brand mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span className="text-muted-foreground">
            Agree a price with{" "}
            <span className="text-foreground font-medium">Make an offer</span>.
            Only accepted offers change what a rental costs.
          </span>
        </li>
        <li className="flex gap-3">
          <ShieldCheckIcon
            className="text-brand mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span className="text-muted-foreground">
            Keep payments on SamaanShare, and never share your CNIC or passwords
            in chat.
          </span>
        </li>
      </ul>
    </div>
  );
}
