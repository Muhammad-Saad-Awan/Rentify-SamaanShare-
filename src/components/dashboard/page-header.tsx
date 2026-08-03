import { cn } from "@/lib/utils/cn";

import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  /**
   * Primary actions for the page, aligned to the trailing edge. Stacks beneath
   * the title below `sm` so a long title and a button never collide.
   */
  actions?: ReactNode;
  className?: string;
}

/**
 * Title block at the top of every dashboard page.
 *
 * Owns the single `<h1>` for the route. The header's breadcrumb trail is a
 * `<nav>`, so this is the document's first heading - keeping it here rather than
 * in each page body means the heading level cannot drift between sections.
 */
function PageHeader({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-heading text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h1>

        {description && (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>

      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export { PageHeader };
