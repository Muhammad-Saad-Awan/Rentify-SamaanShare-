import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  /**
   * Pre-formatted display string, not a number.
   *
   * The caller formats, because the correct formatting differs per metric -
   * counts are plain, money needs PKR via the `formatPKR` helper still to be
   * written in Phase 0's utilities. Passing a `number` here would push that
   * decision into the wrong component.
   */
  value: string;
  icon: LucideIcon;
  /** Secondary line beneath the value, e.g. what the number is measured over. */
  hint?: string;
}

/**
 * Single metric tile for the dashboard overview.
 *
 * Presentation only - it never fetches. Phase 2.1 passes placeholder values;
 * when the real counts land they arrive as props from a Server Component that
 * does the querying, so this component does not change.
 */
function StatCard({ label, value, icon: Icon, hint }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="text-muted-foreground text-sm font-normal">
          {label}
        </CardTitle>
        <Icon
          className="text-muted-foreground size-4 shrink-0"
          aria-hidden="true"
        />
      </CardHeader>

      <CardContent className="flex flex-col gap-0.5">
        <span className="font-heading text-2xl font-semibold tracking-tight">
          {value}
        </span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </CardContent>
    </Card>
  );
}

export { StatCard };
