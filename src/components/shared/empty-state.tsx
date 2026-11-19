import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Optional recovery action - "Clear filters", "Create your first listing". */
  action?: ReactNode;
  className?: string;
}

/**
 * A built section that currently has nothing to show.
 *
 * Distinct from `PlaceholderCard`, which marks a section that is not built yet.
 * The difference is what the user should conclude: a placeholder says "come
 * back later", an empty state says "this works, there is simply nothing here" -
 * and usually offers a way out via `action`. Rendering a placeholder where an
 * empty state belongs tells a user the feature is missing when in fact their
 * filters just matched nothing.
 *
 * A solid card rather than the placeholder's dashed outline, for the same
 * reason: dashed reads as unfinished.
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <Card className={cn("bg-card", className)}>
      <div className="animate-fade-up flex flex-col items-center gap-4 px-6 py-14 text-center sm:py-16">
        {/* A mint disc inside a fainter halo: one quiet focal point in the brand's decorative
            surface. `brand-soft` is decoration, not success - it says nothing went well, it just
            makes an empty card look intended rather than broken. */}
        <span
          className="bg-brand-soft text-brand ring-brand-soft/50 flex size-14 items-center justify-center rounded-full ring-8"
          aria-hidden="true"
        >
          <Icon className="size-6" strokeWidth={1.75} />
        </span>

        <div className="flex flex-col items-center gap-1.5">
          {/*
            `h2` not `h3`: an empty state replaces a page's content region, and
            the page's own `h1` is the only heading above it.
          */}
          <h2 className="font-heading text-lg font-bold tracking-tight">
            {title}
          </h2>
          <p className="text-muted-foreground max-w-[42ch] text-sm leading-relaxed">
            {description}
          </p>
        </div>

        {action && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {action}
          </div>
        )}
      </div>
    </Card>
  );
}

export { EmptyState };
