"use client";

import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOGIN_REDIRECT } from "@/config/routes";

interface DashboardErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Boundary for the authenticated shell.
 *
 * Separate from the marketplace one so the sidebar and header stay rendered - the
 * `(dashboard)` layout is above this boundary - and so the recovery link points into
 * the app rather than at the marketing home page. A signed-in user who hits an error
 * on their wishlist wants to get back to their dashboard, not to the landing page.
 *
 * Note what this boundary does NOT catch: `requireUser()` redirects. `redirect()`
 * throws a control-flow signal that Next handles before any error boundary sees it,
 * so an expired session still redirects to login rather than landing here.
 */
export default function DashboardError({ error, reset }: DashboardErrorProps) {
  useEffect(() => {
    console.error("Dashboard route error", error.digest, error);
  }, [error]);

  return (
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
          <Button
            variant="outline"
            size="sm"
            render={<Link href={DEFAULT_LOGIN_REDIRECT} />}
          >
            Back to dashboard
          </Button>
        </>
      }
    />
  );
}
