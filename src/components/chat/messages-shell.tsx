"use client";

import { useSelectedLayoutSegment } from "next/navigation";

import { cn } from "@/lib/utils/cn";

import type { ReactNode } from "react";

interface MessagesShellProps {
  list: ReactNode;
  children: ReactNode;
}

/**
 * The two-pane messenger: conversations on the left, the open thread on the right.
 *
 * On a phone there is room for one pane, so the URL decides which: the inbox at `/dashboard/messages`,
 * the thread at `/dashboard/messages/[id]`. Both panes stay mounted on a desktop, so moving between
 * threads keeps the list's search and scroll position.
 *
 * Sized to the viewport rather than to its content: the message log and the list scroll inside it,
 * which keeps the composer in view however long a thread gets.
 */
function MessagesShell({ list, children }: MessagesShellProps) {
  const threadOpen = useSelectedLayoutSegment() !== null;

  return (
    <div className="bg-card -mx-4 -my-6 flex h-[calc(100svh-3.5rem)] min-h-[30rem] overflow-hidden lg:mx-0 lg:my-0 lg:h-[calc(100svh-6.5rem)] lg:rounded-xl lg:border lg:shadow-xs">
      <aside
        className={cn(
          "min-h-0 w-full flex-col lg:flex lg:w-80 lg:shrink-0 lg:border-r xl:w-96",
          threadOpen ? "hidden" : "flex"
        )}
        aria-label="Conversations"
      >
        {list}
      </aside>

      <section
        className={cn(
          "min-h-0 min-w-0 flex-1 flex-col lg:flex",
          threadOpen ? "flex" : "hidden"
        )}
      >
        {children}
      </section>
    </div>
  );
}

export { MessagesShell };
