import Link from "next/link";

import { cn } from "@/lib/utils/cn";

import type { ReactNode } from "react";

interface FilterNavProps {
  /** Names the `<nav>` landmark - "Filter listings". */
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * The filter rows of a browse screen - members, listings, bookings.
 *
 * Distinct from `QueueTabs` on purpose. A queue has one dimension and exactly one view is current; a
 * browse screen has several independent dimensions (status, city, "reported"), and squeezing them
 * into one row of identical buttons made "Removed" and "Lahore" look like alternatives to each other.
 * Each dimension gets its own labelled group instead.
 */
function FilterNav({ label, children, className }: FilterNavProps) {
  return (
    <nav
      aria-label={label}
      className={cn("flex min-w-0 flex-col gap-2.5", className)}
    >
      {children}
    </nav>
  );
}

interface FilterGroupProps {
  /** Visible name of the dimension - "Status", "City". Omit for a single ungrouped row. */
  legend?: string;
  children: ReactNode;
}

/** One filter dimension: a short label, then its chips. Wraps; nothing here is long. */
function FilterGroup({ legend, children }: FilterGroupProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      {legend && (
        <span className="text-muted-foreground w-14 shrink-0 text-xs font-medium">
          {legend}
        </span>
      )}
      <ul className="flex min-w-0 flex-wrap gap-1.5">{children}</ul>
    </div>
  );
}

interface FilterChipProps {
  href: string;
  active: boolean;
  children: ReactNode;
}

/**
 * One filter as a link, so every view stays shareable and survives the back button.
 *
 * Navy when active, matching the admin section nav above it; a quiet bordered chip otherwise. The
 * border is `--input` rather than `--border` because a chip is a control, and a control's edge has
 * to clear 3:1 against the page (WCAG 1.4.11) - `--border` is 1.23:1 and is for dividers.
 */
function FilterChip({ href, active, children }: FilterChipProps) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "focus-visible:ring-ring flex h-8 items-center rounded-md border px-2.5 text-xs whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          active
            ? "bg-primary text-primary-foreground border-primary font-medium"
            : "bg-card border-input text-foreground/80 hover:bg-muted hover:text-foreground"
        )}
      >
        {children}
      </Link>
    </li>
  );
}

export { FilterChip, FilterGroup, FilterNav };
