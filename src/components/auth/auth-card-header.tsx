import { CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

import type { ReactNode } from "react";

interface AuthCardHeaderProps {
  title: string;
  description?: ReactNode;
  className?: string;
}

/**
 * Title block for the cards in the `(auth)` group.
 *
 * A REAL `h1`, which `CardTitle` is not - it renders a `div`. Each auth route is a page of its own
 * with no shell heading above it, so without this the sign-in page had no heading at all and a
 * screen reader's heading list came back empty. One component rather than an `h1` per page keeps
 * the six routes at the same size and tracking.
 */
function AuthCardHeader({
  title,
  description,
  className,
}: AuthCardHeaderProps) {
  return (
    <CardHeader className={cn("gap-1.5", className)}>
      <h1 className="font-heading text-2xl font-bold tracking-[-0.025em]">
        {title}
      </h1>
      {description && (
        <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
          {description}
        </p>
      )}
    </CardHeader>
  );
}

export { AuthCardHeader };
