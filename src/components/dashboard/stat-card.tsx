import Link from "next/link";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  /**
   * Pre-formatted display string, not a number.
   *
   * The caller formats, because the correct formatting differs per metric - counts are plain,
   * money goes through `formatPKR`. Passing a `number` here would push that decision into the
   * wrong component.
   */
  value: string;
  icon: LucideIcon;
  /** Secondary line beneath the value, e.g. what the number is measured over. */
  hint?: string;
  /**
   * Makes the whole tile a link to the screen the number summarises.
   *
   * One `<Link>` around the content rather than a button inside it, so there is a single tab stop
   * and nothing interactive nested in anything else.
   */
  href?: string;
  /**
   * `attention` when the number is a task waiting on this person - a request to answer. Amber edge
   * and icon, never amber text: `#D97706` is under 4.5:1, so the hint uses the warning-soft ink.
   */
  tone?: "default" | "attention";
}

/**
 * Single metric tile for the dashboard overviews.
 *
 * Presentation only - it never fetches. Values arrive as props from a Server Component that does
 * the querying, already formatted.
 */
function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  href,
  tone = "default",
}: StatCardProps) {
  const attention = tone === "attention";

  const body = (
    <div className="flex h-full flex-col gap-3 p-(--card-spacing)">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm font-medium">
          {label}
        </span>
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            attention
              ? "bg-warning-soft text-warning-soft-foreground"
              : "bg-muted text-foreground"
          )}
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="font-heading text-3xl font-bold tracking-[-0.025em] tabular-nums">
          {value}
        </span>
        {hint && (
          <span
            className={cn(
              "text-xs leading-relaxed",
              attention
                ? "text-warning-soft-foreground font-medium"
                : "text-muted-foreground"
            )}
          >
            {hint}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <Card
      className={cn(
        "h-full py-0",
        attention && "border-warning/60",
        href &&
          "focus-within:ring-ring focus-within:ring-offset-background hover:border-foreground/25 transition-colors focus-within:ring-2 focus-within:ring-offset-2"
      )}
    >
      {/* The tile's own text is the link's name - label, value and hint, read in order. */}
      {href ? (
        <Link href={href} className="flex h-full flex-col outline-none">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}

export { StatCard };
