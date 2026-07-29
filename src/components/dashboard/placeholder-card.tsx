import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

import type { LucideIcon } from "lucide-react";

interface PlaceholderCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /**
   * Backlog phase that will fill this in, e.g. `"Phase 3"`. Rendered as a badge
   * so a reviewer clicking through the shell can tell an unbuilt section from a
   * built one that happens to be empty.
   */
  phase?: string;
  className?: string;
}

/**
 * Stand-in for a dashboard section whose functionality is not built yet.
 *
 * Dashed outline instead of the `Card` default ring: the shell is navigable in
 * full, and this makes it visually obvious which panels are scaffolding rather
 * than a real empty state a user could act on. Replace the whole component when
 * a section lands - it is deliberately not a reusable empty state.
 */
function PlaceholderCard({
  icon: Icon,
  title,
  description,
  phase,
  className,
}: PlaceholderCardProps) {
  return (
    <Card
      className={cn(
        "border-border border-2 border-dashed bg-transparent ring-0",
        className
      )}
    >
      <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <span
          className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full"
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>

        <div className="flex flex-col items-center gap-1.5">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <h2 className="font-heading text-sm font-medium">{title}</h2>
            {phase && (
              <Badge variant="outline" className="shrink-0">
                {phase}
              </Badge>
            )}
          </div>

          <p className="text-muted-foreground max-w-sm text-sm">
            {description}
          </p>
        </div>
      </div>
    </Card>
  );
}

export { PlaceholderCard };
