import Link from "next/link";

import { categoryIcon } from "@/lib/utils/category-icon";

import type { FeaturedCategory } from "@/lib/queries/categories";

interface CategoryGridProps {
  categories: readonly FeaturedCategory[];
}

/**
 * Category tiles, linking to each category page.
 *
 * Rendered from the seeded taxonomy rather than a hardcoded list, so the grid and
 * the filter sidebar can never offer different categories. The icon comes back
 * from the database as a Lucide *name* and is resolved by `categoryIcon`.
 *
 * Each tile states its live count, including zero. A tile that silently leads to
 * an empty page is more annoying than one that says so up front, and hiding empty
 * categories would make the grid reshuffle as inventory changes.
 */
function CategoryGrid({ categories }: CategoryGridProps) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {categories.map((category) => {
        const Icon = categoryIcon(category.icon);

        return (
          <li key={category.slug}>
            <Link
              href={`/categories/${category.slug}`}
              className="group bg-card hover:border-foreground focus-visible:ring-ring flex h-full flex-col justify-between gap-8 rounded-xl border p-5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <span
                className="bg-muted group-hover:bg-primary group-hover:text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors"
                aria-hidden="true"
              >
                <Icon className="size-5" strokeWidth={1.75} />
              </span>

              <span className="flex flex-col gap-0.5">
                <span className="font-heading text-base leading-snug font-semibold">
                  {category.name}
                </span>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {category.listingCount === 1
                    ? "1 item"
                    : `${category.listingCount} items`}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export { CategoryGrid };
