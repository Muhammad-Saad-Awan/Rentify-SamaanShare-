import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
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
 * one component across the sections is what keeps that consistent - hand-written
 * headings would eventually disagree on level or spacing and leave the page with a
 * broken outline for anyone navigating by headings.
 *
 * The action is an emerald outline pill with an arrow, after the reference design's
 * "Browse All Categories".
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
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-3",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 className="font-heading text-[1.75rem] font-extrabold tracking-[-0.03em] sm:text-4xl">
          {title}
        </h2>

        {description && (
          <p className="text-muted-foreground max-w-[60ch] text-[0.9375rem] leading-relaxed sm:text-base">
            {description}
          </p>
        )}
      </div>

      {actionHref && actionLabel && (
        <Button
          variant="brand-outline"
          className="h-10 rounded-xl px-4"
          render={<Link href={actionHref} />}
        >
          {actionLabel}
          <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

export { SectionHeading };
