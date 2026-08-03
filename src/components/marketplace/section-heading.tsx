import Link from "next/link";

import { cn } from "@/lib/utils/cn";

interface SectionHeadingProps {
  title: string;
  description?: string;
  /** Optional "see everything" link, shown to the trailing edge. */
  actionHref?: string;
  actionLabel?: string;
  className?: string;
}

/**
 * Heading block for a homepage section.
 *
 * Renders `h2`, which is the correct level under the hero's single `h1`. Sharing
 * one component across the four sections is what keeps that consistent - four
 * hand-written headings would eventually disagree on level or spacing and leave
 * the page with a broken outline for anyone navigating by headings.
 */
function SectionHeading({
  title,
  description,
  actionHref,
  actionLabel,
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-4 gap-y-2",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h2>

        {description && (
          <p className="text-muted-foreground max-w-2xl text-sm">
            {description}
          </p>
        )}
      </div>

      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="text-primary focus-visible:ring-ring shrink-0 rounded text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

export { SectionHeading };
