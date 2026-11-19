import Link from "next/link";

import { cn } from "@/lib/utils/cn";

interface QueueTab {
  /** Stable identity of the view - the enum value or slug the page parses. */
  key: string;
  label: string;
  href: string;
}

interface QueueTabsProps {
  /** Names the `<nav>` landmark - "Report status", "Settlement view". */
  label: string;
  tabs: readonly QueueTab[];
  activeKey: string;
  className?: string;
}

/**
 * The status views of one admin queue, as a segmented control of links.
 *
 * LINKS, NOT CLIENT STATE, for the reason every queue gives: a view is a URL, so it can be handed to
 * a colleague and survives the back button. This component only owns the look, so the five queues
 * stop drawing the same row of buttons five slightly different ways.
 *
 * A SEGMENTED CONTROL RATHER THAN A ROW OF BUTTONS. The views are mutually exclusive, and a row of
 * navy and outline buttons reads as a set of actions - which, on a screen full of real actions that
 * suspend accounts and move money, is the wrong thing to suggest. The active segment takes the mint
 * "selected" surface the sidebar and filter chips use, plus a heavier weight; `aria-current`
 * carries the state for assistive tech.
 *
 * Scrolls sideways when it does not fit rather than wrapping: a wrapped segmented control stops
 * looking like one, and at 360px the payment queue's six views would otherwise take three lines.
 */
function QueueTabs({ label, tabs, activeKey, className }: QueueTabsProps) {
  return (
    <nav aria-label={label} className={cn("-mx-1 min-w-0 px-1", className)}>
      <div className="overflow-x-auto pb-0.5">
        <ul className="bg-card inline-flex min-w-max gap-0.5 rounded-xl border p-1">
          {tabs.map((tab) => {
            const isActive = tab.key === activeKey;

            return (
              <li key={tab.key}>
                <Link
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "focus-visible:ring-ring flex h-8 items-center rounded-lg px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2",
                    isActive
                      ? "bg-brand-soft text-brand-soft-foreground font-semibold"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

export { QueueTabs };
export type { QueueTab };
