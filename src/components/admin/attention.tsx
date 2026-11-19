import { ClockIcon, TriangleAlertIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface AwaitingBadgeProps {
  /** Short and specific - "Awaiting decision", "To check", "Past the 48h window". */
  label: string;
  /** Clock for "waiting on you"; the triangle for "this is late". */
  icon?: LucideIcon;
  className?: string;
}

/**
 * An item that is waiting on an administrator, or has gone past a deadline.
 *
 * WARNING, NOT DESTRUCTIVE AND NOT THE NEUTRAL RING. The admin screens used red for "two reports
 * are waiting" and for "this request is overdue", which taught the eye that red meant "your turn" -
 * and left nothing to say "this went wrong". `StatusBadge`'s open ring means "waiting on someone",
 * but on a member's screen that someone is another member; here it is the reader, and that is the
 * warning concept in this palette (amber surface, navy-brown text, glyph alongside). Amber is never
 * the text colour: `#D97706` is 3.19:1 on white.
 */
function AwaitingBadge({
  label,
  icon: Icon = ClockIcon,
  className,
}: AwaitingBadgeProps) {
  return (
    <Badge variant="warning" className={cn("pl-2", className)}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}

interface AttentionNoteProps {
  children: ReactNode;
  /**
   * `warning` for evidence a decision should weigh or a consequence to know about; `destructive` for
   * money or a record that is actually wrong. Neither is decoration - pick the one that is true.
   */
  tone?: "warning" | "destructive";
  icon?: LucideIcon;
  className?: string;
}

/**
 * An inline callout inside an admin card - the contradiction on a claim, a live rental on a listing
 * about to be removed, a card payment Stripe took that nothing applied.
 *
 * A soft surface with an icon rather than coloured text alone: red or amber 12px text was carrying
 * these on its own, and the colour was the only thing separating a warning from the grey lines
 * around it.
 */
function AttentionNote({
  children,
  tone = "warning",
  icon: Icon = TriangleAlertIcon,
  className,
}: AttentionNoteProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed",
        tone === "warning"
          ? "border-warning/40 bg-warning-soft text-warning-soft-foreground"
          : "border-destructive/30 bg-destructive/8 text-destructive",
        className
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export { AttentionNote, AwaitingBadge };
