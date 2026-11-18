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
    // The negative margins cancel the dashboard layout's padding (`px-4 py-8`, `lg:py-10`) and the
    // heights subtract its `h-16` header, so the frame fills the viewport exactly: on a phone it is
    // edge to edge under the header, on a desktop it keeps 1.5rem of page above and below. If those
    // layout values change, these must follow or the composer slides below the fold.
    <div className="bg-card -mx-4 -my-8 flex h-[calc(100svh-4rem)] min-h-[30rem] overflow-hidden lg:mx-0 lg:-my-4 lg:h-[calc(100svh-7rem)] lg:rounded-xl lg:border">
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
