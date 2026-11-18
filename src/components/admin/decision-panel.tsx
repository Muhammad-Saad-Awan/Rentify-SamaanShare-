import { cn } from "@/lib/utils/cn";

import type { ReactNode } from "react";

interface DecisionPanelProps {
  /** What is being decided, as the administrator would say it - "Decide this claim". */
  title: string;
  /**
   * What the decision does once recorded - who is told, what money moves, whether it can be undone.
   * Shown beneath the controls, beside the button that commits it.
   */
  consequence?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * The open decision form inside an admin queue card.
 *
 * The queues had each grown their own grey box for this, at three paddings and two radii. One
 * shell means the place a decision is made looks the same on every queue, and the consequence line
 * always sits in the same spot - directly under the button that causes it - rather than wherever
 * that card's author put it.
 *
 * Works from a Client Component (the cards that own the form state) as well as a Server one; it has
 * no state of its own. The title is a `<p>`, not a heading: these sit inside list items under the
 * page's `h1`, and an `h3` there would skip a level.
 */
function DecisionPanel({
  title,
  consequence,
  children,
  className,
}: DecisionPanelProps) {
  return (
    <div
      className={cn(
        "bg-muted/50 flex flex-col gap-3 rounded-lg border p-4",
        className
      )}
    >
      <p className="font-heading text-sm font-semibold tracking-tight">
        {title}
      </p>
      {children}
      {consequence && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {consequence}
        </p>
      )}
    </div>
  );
}

export { DecisionPanel };
