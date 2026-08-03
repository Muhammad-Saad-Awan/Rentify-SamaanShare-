import Link from "next/link";

import { Card } from "@/components/ui/card";
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
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {categories.map((category) => {
        const Icon = categoryIcon(category.icon);

        return (
          <li key={category.slug}>
            <Link
              href={`/categories/${category.slug}`}
              className="focus-visible:ring-ring block h-full rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <Card className="h-full transition-shadow hover:shadow-md">
                <div className="flex h-full flex-col items-start gap-3 px-(--card-spacing)">
                  <span
                    className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg"
                    aria-hidden="true"
                  >
                    <Icon className="size-4.5" />
                  </span>

                  <div className="flex flex-col gap-0.5">
                    <span className="font-heading text-sm font-medium">
                      {category.name}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {category.listingCount === 1
                        ? "1 item"
                        : `${category.listingCount} items`}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export { CategoryGrid };
