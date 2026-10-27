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
 * The identity is black and white, so state cannot lean on colour. Each variant carries a glyph
 * instead, and the four read the same way on every screen:
 *
 * - `default`, filled: settled in the user's favour - paid, live, rented out.
 * - `secondary`, open ring: waiting on someone - the owner, the renter, a payment check.
 * - `outline`, dash: closed and needs nothing - completed, cancelled, expired.
 * - `destructive`, cross: went wrong - declined, failed, rejected.
 *
 * The label stays the source of meaning; the glyph is decorative and hidden from assistive tech,
 * so it helps a sighted user scan a list without changing what a screen reader announces.
 */
function StatusBadge({ label, variant, className }: StatusBadgeProps) {
  return (
    <Badge variant={variant} className={cn("pl-2", className)}>
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
        variant === "default" && "bg-primary-foreground size-1.5 rounded-full",
        variant === "secondary" &&
          "border-foreground size-2 rounded-full border-[1.5px]",
        variant === "outline" && "h-[1.5px] w-2 rounded-full bg-current"
      )}
    />
  );
}

export { StatusBadge };
