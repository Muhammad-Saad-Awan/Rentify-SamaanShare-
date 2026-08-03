import Link from "next/link";

import { cn } from "@/lib/utils/cn";

interface SubcategoryNavItem {
  label: string;
  href: string;
  isActive: boolean;
}

interface SubcategoryNavProps {
  items: readonly SubcategoryNavItem[];
  className?: string;
}

/**
 * Horizontal subcategory filter for a category page.
 *
 * Presentational: hrefs are computed by the page, because only the route knows its
 * own base path and which parameters that path already implies. Same division of
 * labour as `Pagination` and `ListingsSort`.
 *
 * Links rather than a select, because there are only a handful per category and
 * showing them all makes the available refinements visible without interaction.
 * Scrolls horizontally on narrow viewports instead of wrapping to three rows and
 * pushing the results below the fold.
 */
function SubcategoryNav({ items, className }: SubcategoryNavProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Subcategories"
      className={cn("-mx-1 overflow-x-auto px-1 pb-1", className)}
    >
      <ul className="flex w-max items-center gap-1.5">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              // `aria-current="page"` rather than "true": each of these is a
              // distinct URL, so the active one genuinely is the current page.
              aria-current={item.isActive ? "page" : undefined}
              className={cn(
                "focus-visible:ring-ring block rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2",
                item.isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export { SubcategoryNav };
