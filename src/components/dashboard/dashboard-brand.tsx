import { Brand } from "@/components/shared/brand";
import { DEFAULT_LOGIN_REDIRECT } from "@/config/routes";
import { cn } from "@/lib/utils/cn";

interface DashboardBrandProps {
  className?: string;
}

/**
 * Wordmark at the top of the sidebar and the mobile drawer.
 *
 * Points at `/dashboard` rather than `/`: inside the authenticated shell the
 * logo is expected to return to the app, not to the marketing home page.
 *
 * Thin wrapper over the shared `Brand` so the mark itself is defined once. The
 * only difference here is the focus ring, which uses the sidebar's own ring
 * token to stay legible against `--sidebar`.
 */
function DashboardBrand({ className }: DashboardBrandProps) {
  return (
    <Brand
      href={DEFAULT_LOGIN_REDIRECT}
      className={cn("focus-visible:ring-sidebar-ring", className)}
    />
  );
}

export { DashboardBrand };
