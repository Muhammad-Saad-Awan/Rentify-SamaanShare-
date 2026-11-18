import { cn } from "@/lib/utils/cn";

import type { ReactNode } from "react";

interface FactGridProps {
  children: ReactNode;
  /** Columns from `sm` up. Two suits a detail summary; four suits a short identity row. */
  columns?: 2 | 3 | 4;
  className?: string;
}

const COLUMNS = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
} as const;

/**
 * A record's facts as a label-over-value grid.
 *
 * Replaces the "Label: value" run-on lines the admin detail screens used, which were all 12px grey -
 * the owner's email, the deposit and the booking id carried the same weight as the labels naming
 * them, so finding one fact meant reading every line. Here the label is quiet and the value is
 * foreground text at body size, which is what makes a column of them scannable.
 *
 * A real `<dl>`, so each value is announced with its label.
 */
function FactGrid({ children, columns = 2, className }: FactGridProps) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-3 text-sm",
        COLUMNS[columns],
        className
      )}
    >
      {children}
    </dl>
  );
}

interface FactProps {
  label: string;
  children: ReactNode;
  /** Money: heading face and tabular figures, so amounts in a column line up. */
  money?: boolean;
  /** Identifiers read character by character against another screen - references, ids, CNICs. */
  mono?: boolean;
  className?: string;
}

/** One labelled value inside a `FactGrid`. */
function Fact({ label, children, money, mono, className }: FactProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          "min-w-0 break-words",
          money && "font-heading font-semibold tabular-nums",
          mono && "font-mono text-[0.8125rem] break-all"
        )}
      >
        {children}
      </dd>
    </div>
  );
}

export { Fact, FactGrid };
