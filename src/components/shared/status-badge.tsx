import { XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

import type { BadgeVariant } from "@/lib/bookings/status-badge";

interface StatusBadgeProps {
  label: string;
  variant: BadgeVariant;
  className?: string;
}

/**
 * A lifecycle state - booking, payment, listing - with a mark that encodes it.
 *
 * Colour reinforces state but never carries it alone. Each variant carries a glyph, and the four
 * read the same way on every screen:
 *
 * - `default`, filled: settled in the user's favour - paid, live, rented out. Drawn in emerald on
 *   its soft wash: the one state where colour has a job, because "this went well" is exactly what
 *   emerald means in this palette.
 * - `secondary`, open ring: waiting on someone - the owner, the renter, a payment check.
 * - `outline`, dash: closed and needs nothing - completed, cancelled, expired.
 * - `destructive`, cross: went wrong - declined, failed, rejected.
 *
 * The label stays the source of meaning; the glyph is decorative and hidden from assistive tech,
 * so it helps a sighted user scan a list without changing what a screen reader announces.
 */
function StatusBadge({ label, variant, className }: StatusBadgeProps) {
  return (
    <Badge
      // The mapping keeps its four semantic names; only the look of `default` changes here, so
      // every mapper and its tests stay as they are.
      variant={variant === "default" ? "success" : variant}
      className={cn("pl-2", className)}
    >
      <StatusMark variant={variant} />
      {label}
    </Badge>
  );
}

function StatusMark({ variant }: { variant: BadgeVariant }) {
  if (variant === "destructive") {
    return <XIcon aria-hidden="true" strokeWidth={3} />;
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block shrink-0",
        // Emerald, not white: a white dot on the success wash is 1.05:1 and disappears.
        variant === "default" && "bg-success size-1.5 rounded-full",
        variant === "secondary" &&
          "border-foreground size-2 rounded-full border-[1.5px]",
        variant === "outline" && "h-[1.5px] w-2 rounded-full bg-current"
      )}
    />
  );
}

export { StatusBadge };
