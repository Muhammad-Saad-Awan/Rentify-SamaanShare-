import { ArrowUpRightIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { categoryImage } from "@/config/category-images";
import { categoryIcon } from "@/lib/utils/category-icon";

import type { FeaturedCategory } from "@/lib/queries/categories";

interface CategoryGridProps {
  categories: readonly FeaturedCategory[];
}

/**
 * Category tiles, linking to each category page.
 *
 * Rendered from the seeded taxonomy rather than a hardcoded list, so the grid and
 * the filter sidebar can never offer different categories. Each tile shows a real product
 * photograph from `CATEGORY_IMAGES`; a category without one falls back to its Lucide icon
 * (stored in the database as a *name* and resolved by `categoryIcon`).
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
    // Auto-fit rather than fixed columns: the seeded taxonomy has seven top-level categories,
    // which a fixed six-up grid left with one orphan. This fits all seven in a row on desktop.
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] sm:gap-4">
      {categories.map((category) => {
        const image = categoryImage(category.slug);
        const Icon = categoryIcon(category.icon);

        return (
          <li key={category.slug}>
            <Link
              href={`/categories/${category.slug}`}
              className="group bg-card hover-lift hover:border-brand/30 focus-visible:ring-ring flex h-full flex-col gap-3 rounded-2xl border p-2 pb-3.5 outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <span className="bg-muted relative block aspect-4/3 overflow-hidden rounded-xl">
                {image ? (
                  <Image
                    src={image}
                    // Decorative: the category name below is the link's accessible name.
                    alt=""
                    placeholder="blur"
                    sizes="(min-width: 1280px) 180px, (min-width: 640px) 25vw, 50vw"
                    className="size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
                  />
                ) : (
                  <span
                    className="text-brand flex size-full items-center justify-center"
                    aria-hidden="true"
                  >
                    <Icon className="size-10" strokeWidth={1.5} />
                  </span>
                )}

                <span
                  className="bg-card/95 text-brand absolute top-2 right-2 flex size-7 translate-y-1 items-center justify-center rounded-full opacity-0 shadow-sm transition-[opacity,transform] duration-200 group-hover:translate-y-0 group-hover:opacity-100"
                  aria-hidden="true"
                >
                  <ArrowUpRightIcon className="size-4" />
                </span>
              </span>

              <span className="flex min-w-0 flex-col items-center gap-0.5 px-1 text-center">
                <span className="font-heading group-hover:text-brand text-[0.9375rem] leading-snug font-bold transition-colors">
                  {category.name}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {category.listingCount === 1
                    ? "1 item available"
                    : `${category.listingCount.toLocaleString("en-PK")} items available`}
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
