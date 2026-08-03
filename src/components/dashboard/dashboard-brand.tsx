import { PackageIcon } from "lucide-react";
import Link from "next/link";

import { DEFAULT_LOGIN_REDIRECT } from "@/config/routes";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils/cn";

interface DashboardBrandProps {
  className?: string;
}

/**
 * Wordmark at the top of the sidebar and the mobile drawer.
 *
 * Points at `/dashboard` rather than `/`: inside the authenticated shell the
 * logo is expected to return to the app, not to the marketing home page.
 */
function DashboardBrand({ className }: DashboardBrandProps) {
  return (
    <Link
      href={DEFAULT_LOGIN_REDIRECT}
      className={cn(
        "focus-visible:ring-sidebar-ring flex items-center gap-2 rounded-lg text-sm font-semibold tracking-tight transition-opacity outline-none hover:opacity-80 focus-visible:ring-2",
        className
      )}
    >
      <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
        <PackageIcon className="size-4" aria-hidden="true" />
      </span>
      {siteConfig.name}
    </Link>
  );
}

export { DashboardBrand };
