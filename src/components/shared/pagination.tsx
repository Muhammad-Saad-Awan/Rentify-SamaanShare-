import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

import type { ReactNode } from "react";

interface PaginationProps {
  /** 1-based current page. */
  page: number;
  totalPages: number;
  /**
   * Builds the href for a page number.
   *
   * Passed in rather than assembled here because each caller owns its own query
   * string - browse has to preserve active filters and the sort order across a
   * page change, and this component has no business knowing what those are.
   */
  hrefFor: (page: number) => string;
  className?: string;
}

/**
 * Previous/next pagination over a page-numbered list.
 *
 * Real `<Link>`s, not buttons with an `onClick`. That keeps the control working
 * without JavaScript, makes each page shareable and linkable, and lets the
 * browser's own back button move through pages - none of which a click handler
 * mutating state would give. It also means this stays a Server Component.
 *
 * Renders nothing for a single page: a disabled control on both sides is noise.
 */
function Pagination({ page, totalPages, hrefFor, className }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav
      // Named, because a page can carry more than one paginated region and
      // "navigation" alone would not distinguish them in a landmark list.
      aria-label="Pagination"
      className={cn("flex items-center justify-between gap-4", className)}
    >
      {/*
        `aria-disabled` with no href rather than a disabled <button>: an absent
        edge page has nowhere to point, and rendering a live link to page 0
        would 404. Screen readers still announce the control's presence.
      */}
      <PaginationLink
        href={hasPrevious ? hrefFor(page - 1) : undefined}
        label="Previous page"
      >
        <ChevronLeftIcon aria-hidden="true" />
        <span className="hidden sm:inline">Previous</span>
      </PaginationLink>

      {/*
        `aria-live="polite"`: after a page change the surrounding grid swaps
        silently, so this is the only announcement that the position moved.
      */}
      <p className="text-muted-foreground text-sm" aria-live="polite">
        Page <span className="text-foreground font-medium">{page}</span> of{" "}
        {totalPages}
      </p>

      <PaginationLink
        href={hasNext ? hrefFor(page + 1) : undefined}
        label="Next page"
      >
        <span className="hidden sm:inline">Next</span>
        <ChevronRightIcon aria-hidden="true" />
      </PaginationLink>
    </nav>
  );
}

interface PaginationLinkProps {
  /**
   * `undefined` at the first and last page, which renders an inert control.
   *
   * Written as an explicit union rather than `href?: string`, because the
   * project sets `exactOptionalPropertyTypes` - under which an optional property
   * rejects a deliberately-passed `undefined`.
   */
  href: string | undefined;
  label: string;
  children: ReactNode;
}

function PaginationLink({ href, label, children }: PaginationLinkProps) {
  if (!href) {
    return (
      <Button variant="outline" size="sm" disabled aria-label={label}>
        {children}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      render={<Link href={href} aria-label={label} />}
    >
      {children}
    </Button>
  );
}

export { Pagination };
