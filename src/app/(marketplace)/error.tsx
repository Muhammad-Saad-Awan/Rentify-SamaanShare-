"use client";

import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

interface MarketplaceErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Boundary for the public marketplace.
 *
 * Scoped to the route group so the site header and footer survive: the layout sits
 * above this boundary, so a failed browse query leaves the visitor with working
 * navigation instead of a bare error screen. Before this existed, any thrown error -
 * a Neon connection blip, a Prisma timeout - rendered Next's unstyled default page.
 *
 * `reset()` re-renders the segment, which is the right first response to a transient
 * database failure. The link out matters too: if the failure is not transient, a
 * button that keeps failing is a dead end.
 *
 * The message never includes `error.message`. In production Next replaces it with a
 * generic string anyway, and surfacing raw server errors is how connection strings
 * and query fragments end up on screen.
 */
export default function MarketplaceError({
  error,
  reset,
}: MarketplaceErrorProps) {
  useEffect(() => {
    // The digest is what correlates this screen with the server-side log entry;
    // without logging it, a user report cannot be traced to a stack.
    console.error("Marketplace route error", error.digest, error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16 lg:px-6">
      <EmptyState
        icon={TriangleAlertIcon}
        title="Something went wrong"
        description="We could not load this page. It is usually temporary - trying again often works."
        action={
          <>
            <Button size="sm" onClick={reset}>
              <RefreshCwIcon />
              Try again
            </Button>
            <Button variant="outline" size="sm" render={<Link href="/" />}>
              Back to home
            </Button>
          </>
        }
      />
    </div>
  );
}
