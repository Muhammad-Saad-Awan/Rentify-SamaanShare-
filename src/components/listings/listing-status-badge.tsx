import { StatusBadge } from "@/components/shared/status-badge";
import { ListingStatus } from "@/generated/prisma/enums";

import type { BadgeVariant } from "@/lib/bookings/status-badge";

interface ListingStatusBadgeProps {
  status: ListingStatus;
  className?: string;
}

/**
 * A listing's status, in the owner's language.
 *
 * Moved out of `OwnerListingCard` unchanged so the overview's listing summary - a Server
 * Component - shows the same words and glyph as the management screen it links to, rather than a
 * lowercased enum in a plain pill. No `"use client"`: it renders on either side.
 *
 * `DELETED` is included for completeness but never reaches here - the management query filters
 * soft-deleted rows out. A total map means adding an enum variant fails at the type level rather
 * than rendering a raw `REJECTED` to someone.
 */
const PRESENTATION: Record<
  ListingStatus,
  { label: string; variant: BadgeVariant }
> = {
  [ListingStatus.ACTIVE]: { label: "Live", variant: "default" },
  [ListingStatus.PAUSED]: { label: "Paused", variant: "secondary" },
  [ListingStatus.DRAFT]: { label: "Draft", variant: "outline" },
  [ListingStatus.REJECTED]: { label: "Rejected", variant: "destructive" },
  [ListingStatus.DELETED]: { label: "Deleted", variant: "outline" },
};

function ListingStatusBadge({ status, className }: ListingStatusBadgeProps) {
  const { label, variant } = PRESENTATION[status];

  return (
    <StatusBadge
      label={label}
      variant={variant}
      {...(className ? { className } : {})}
    />
  );
}

export { ListingStatusBadge };
