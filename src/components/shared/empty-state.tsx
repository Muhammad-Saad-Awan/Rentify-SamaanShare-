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
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span
          className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full"
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>

        <div className="flex flex-col items-center gap-1.5">
          {/*
            `h2` not `h3`: an empty state replaces a page's content region, and
            the page's own `h1` is the only heading above it.
          */}
          <h2 className="font-heading text-sm font-medium">{title}</h2>
          <p className="text-muted-foreground max-w-sm text-sm">
            {description}
          </p>
        </div>

        {action && <div className="mt-1 flex items-center gap-2">{action}</div>}
      </div>
    </Card>
  );
}

export { EmptyState };
