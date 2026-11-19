"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

/**
 * Every entry points at something that exists. "How it works" is the homepage section the
 * footer already links to; there is deliberately no About page.
 */
const NAV_ITEMS = [
  { href: "/", label: "Home", isActive: (path: string) => path === "/" },
  {
    href: "/listings",
    label: "Browse",
    isActive: (path: string) =>
      path.startsWith("/listings") || path.startsWith("/categories"),
  },
  // A fragment on another page: never "the current page", so never underlined.
  { href: "/#how-it-works", label: "How It Works", isActive: () => false },
] as const;

interface SiteNavProps {
  className?: string;
}

/**
 * The marketplace header's centred links.
 *
 * A Client Component only for `usePathname()`, which decides the emerald underline. The
 * underline is reinforced by `aria-current` and a heavier weight, so the active page is not
 * signalled by colour alone.
 */
function SiteNav({ className }: SiteNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Marketplace" className={className}>
      <ul className="flex items-center gap-1 lg:gap-4">
        {NAV_ITEMS.map((item) => {
          const isActive = item.isActive(pathname);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-ring relative flex h-16 items-center px-3 text-[0.9375rem] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset",
                  "after:bg-brand after:absolute after:inset-x-3 after:bottom-3 after:h-0.5 after:rounded-full after:transition-opacity",
                  isActive
                    ? "text-foreground font-semibold after:opacity-100"
                    : "text-foreground/75 hover:text-foreground font-medium after:opacity-0"
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export { SiteNav };
