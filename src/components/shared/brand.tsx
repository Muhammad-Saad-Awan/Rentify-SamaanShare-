import { PackageIcon } from "lucide-react";
import Link from "next/link";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils/cn";

interface BrandProps {
  /**
   * Where the wordmark points. Required rather than defaulted, because the two
   * shells disagree: the marketing header returns to `/`, the authenticated
   * sidebar returns to the app. A default would quietly be wrong in one of them.
   */
  href: string;
  className?: string;
}

/**
 * The SamaanShare wordmark.
 *
 * One implementation for both shells - the public header and the dashboard rail
 * - so the logo cannot drift between signed-out and signed-in views.
 * `DashboardBrand` wraps this with the sidebar's focus-ring token.
 */
function Brand({ href, className }: BrandProps) {
  return (
    <Link
      href={href}
      className={cn(
        "focus-visible:ring-ring flex items-center gap-2 rounded-lg text-sm font-semibold tracking-tight transition-opacity outline-none hover:opacity-80 focus-visible:ring-2",
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

export { Brand };
