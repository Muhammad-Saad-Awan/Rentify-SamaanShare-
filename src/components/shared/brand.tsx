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
  /** `inverted` for the one place the mark sits on black - the sign-in panel. */
  tone?: "default" | "inverted";
  className?: string;
}

/**
 * The SamaanShare wordmark.
 *
 * One implementation for both shells - the public header and the dashboard rail
 * - so the logo cannot drift between signed-out and signed-in views.
 * `DashboardBrand` wraps this with the sidebar's focus-ring token.
 */
function Brand({ href, tone = "default", className }: BrandProps) {
  return (
    <Link
      href={href}
      className={cn(
        "focus-visible:ring-ring font-heading flex items-center gap-2 rounded-lg text-[1.0625rem] font-bold tracking-[-0.02em] transition-opacity outline-none hover:opacity-75 focus-visible:ring-2 focus-visible:ring-offset-2",
        className
      )}
    >
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md",
          tone === "inverted"
            ? "bg-background text-foreground"
            : "bg-primary text-primary-foreground"
        )}
      >
        <PackageIcon className="size-4" strokeWidth={2.25} aria-hidden="true" />
      </span>
      {siteConfig.name}
    </Link>
  );
}

export { Brand };
