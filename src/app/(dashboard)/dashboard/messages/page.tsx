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
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-12 text-center">
      <span className="bg-muted flex size-16 items-center justify-center rounded-2xl">
        <MessagesSquareIcon
          className="text-muted-foreground size-8"
          aria-hidden="true"
        />
      </span>
      <div className="flex max-w-sm flex-col gap-2">
        <h2 className="font-heading text-lg font-semibold">Your messages</h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Choose a conversation to read it. Ask about an item, arrange pickup,
          get help during a rental, or sort out the return.
        </p>
      </div>
      <ul className="text-muted-foreground flex max-w-sm flex-col gap-3 text-left text-sm">
        <li className="flex gap-3">
          <HandshakeIcon
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            Agree a price with{" "}
            <span className="text-foreground font-medium">Make an offer</span>.
            Only accepted offers change what a rental costs.
          </span>
        </li>
        <li className="flex gap-3">
          <ShieldCheckIcon
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            Keep payments on SamaanShare, and never share your CNIC or passwords
            in chat.
          </span>
        </li>
      </ul>
    </div>
  );
}
