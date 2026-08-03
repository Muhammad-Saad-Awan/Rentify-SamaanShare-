import { PackageSearchIcon, SlidersHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ListingsGrid } from "@/components/marketplace/listings-grid";
import { ListingsSort } from "@/components/marketplace/listings-sort";
import { SubcategoryNav } from "@/components/marketplace/subcategory-nav";
import { EmptyState } from "@/components/shared/empty-state";
import { JsonLd } from "@/components/shared/json-ld";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import {
  buildListingsHref,
  parseListingFilters,
} from "@/lib/marketplace/filters";
import { categoryJsonLd } from "@/lib/marketplace/structured-data";
import { getCategoryBySlug } from "@/lib/queries/categories";
import { getActiveListings } from "@/lib/queries/listings";
import { categoryIcon } from "@/lib/utils/category-icon";

import type {
  ListingFilters,
  RawSearchParams,
} from "@/lib/marketplace/filters";
import type { Metadata } from "next";

/**
 * `params` and `searchParams` are both Promises in Next 15.
 *
 * The breaking change from 14, where both were plain objects. Reading a property
 * without awaiting yields `undefined` rather than throwing, so the mistake shows
 * up as a category page that 404s or a filter that never applies.
 */
interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    // The page itself calls notFound(); metadata for a missing page only needs to
    // avoid claiming a name it does not have.
    return { title: "Category not found" };
  }

  const description =
    category.description ??
    `Rent ${category.name.toLowerCase()} by the day in Karachi, Lahore and Islamabad.`;

  return {
    title: `${category.name} for Rent`,
    description,
    alternates: {
      // Points at the bare category path, so `?subcategory=` and `?page=`
      // variants consolidate here rather than competing as near-duplicates.
      canonical: `/categories/${category.slug}`,
    },
    openGraph: {
      type: "website",
      url: `/categories/${category.slug}`,
      title: `${category.name} for Rent`,
      description,
    },
  };
}

/**
 * Category browse page.
 *
 * A deliberately narrower surface than `/listings`: the state here is the category
 * from the path, plus a subcategory, a sort order and a page. Price, city,
 * condition and availability are *not* read from the query string, so this page
 * can never filter results in a way nothing on screen explains. Full filtering
 * lives on browse, which the "All filters" link hands off to - carrying the
 * category with it.
 *
 * That also keeps the two routes from becoming duplicate filtering surfaces over
 * the same data, which would split their crawl signals.
 */
export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const [{ slug }, rawParams] = await Promise.all([params, searchParams]);

  const category = await getCategoryBySlug(slug);

  if (!category) {
    // An unknown slug is a normal request for a page that is not there. This
    // renders the segment's not-found.tsx with a 404 status.
    notFound();
  }

  const requested = parseListingFilters(rawParams);

  // Canonical defaults, then only the fields this route honours. Spreading the
  // parsed object instead would silently re-admit every filter the page has no UI
  // for.
  const filters: ListingFilters = {
    ...parseListingFilters({}),
    category: category.slug,
    subcategory: requested.subcategory,
    sort: requested.sort,
    page: requested.page,
  };

  const { items, total, page, totalPages } = await getActiveListings({
    filters,
  });

  // The path already names the category, so no link on this page repeats it in a
  // query string.
  const hrefOptions = {
    basePath: `/categories/${category.slug}`,
    omitCategory: true,
  };
  const hrefFor = (overrides: Partial<ListingFilters>) =>
    buildListingsHref(filters, overrides, hrefOptions);

  const Icon = categoryIcon(category.icon);
  const activeSubcategory = category.subcategories.find(
    (entry) => entry.slug === filters.subcategory
  );

  return (
    <>
      <JsonLd
        data={categoryJsonLd({
          name: category.name,
          slug: category.slug,
          description: category.description,
          listingCount: total,
        })}
      />

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 lg:px-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span
              className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg"
              aria-hidden="true"
            >
              <Icon className="size-5" />
            </span>

            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">
                {category.name}
              </h1>
              <p className="text-muted-foreground text-sm">
                {resultSummary(total, activeSubcategory?.name)}
              </p>
            </div>
          </div>

          {category.description && (
            <p className="text-muted-foreground max-w-2xl text-sm">
              {category.description}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SubcategoryNav
            items={[
              {
                label: `All ${category.name}`,
                href: hrefFor({ subcategory: null, page: 1 }),
                isActive: filters.subcategory === null,
              },
              ...category.subcategories.map((subcategory) => ({
                label: subcategory.name,
                href: hrefFor({ subcategory: subcategory.slug, page: 1 }),
                isActive: filters.subcategory === subcategory.slug,
              })),
            ]}
            className="min-w-0 lg:flex-1"
          />

          <div className="flex shrink-0 items-center gap-2">
            <ListingsSort
              filters={filters}
              hrefFor={(sort) => hrefFor({ sort, page: 1 })}
            />

            {/*
              Hands off to browse with the category (and subcategory) preserved,
              which is where price, city, condition and availability live. Built
              without `hrefOptions`, so the category *is* written into the query
              string this time - `/listings` has no path segment to carry it.
            */}
            <Button
              variant="outline"
              size="sm"
              render={<Link href={buildListingsHref(filters, { page: 1 })} />}
            >
              <SlidersHorizontalIcon />
              All filters
            </Button>
          </div>
        </div>

        <ListingsGrid listings={items} />

        {items.length === 0 && (
          <CategoryEmptyState
            categoryName={category.name}
            subcategoryName={activeSubcategory?.name}
            total={total}
            totalPages={totalPages}
            allInCategoryHref={hrefFor({ subcategory: null, page: 1 })}
            firstPageHref={hrefFor({ page: 1 })}
          />
        )}

        <Pagination
          page={page}
          totalPages={totalPages}
          hrefFor={(target) => hrefFor({ page: target })}
        />
      </div>
    </>
  );
}

interface CategoryEmptyStateProps {
  categoryName: string;
  subcategoryName: string | undefined;
  total: number;
  totalPages: number;
  allInCategoryHref: string;
  firstPageHref: string;
}

/**
 * Explains an empty grid in terms of what the visitor actually narrowed by.
 *
 * A subcategory that matched nothing is a different situation from an empty
 * category, and only the first has a useful next step - widening back to the whole
 * category.
 */
function CategoryEmptyState({
  categoryName,
  subcategoryName,
  total,
  totalPages,
  allInCategoryHref,
  firstPageHref,
}: CategoryEmptyStateProps) {
  if (total === 0 && subcategoryName) {
    return (
      <EmptyState
        icon={PackageSearchIcon}
        title={`Nothing in ${subcategoryName} yet`}
        description={`No one has listed anything under ${subcategoryName}. Other ${categoryName.toLowerCase()} may still be available.`}
        action={
          <Button
            variant="outline"
            size="sm"
            render={<Link href={allInCategoryHref} />}
          >
            View all {categoryName}
          </Button>
        }
      />
    );
  }

  if (total === 0) {
    return (
      <EmptyState
        icon={PackageSearchIcon}
        title={`Nothing in ${categoryName} yet`}
        description="No items are listed in this category so far. Try another category, or browse everything that is available."
        action={
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/listings" />}
          >
            Browse all listings
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={PackageSearchIcon}
      title="No listings on this page"
      description={`There ${totalPages === 1 ? "is only 1 page" : `are only ${totalPages} pages`} of results.`}
      action={
        <Button
          variant="outline"
          size="sm"
          render={<Link href={firstPageHref} />}
        >
          Back to first page
        </Button>
      }
    />
  );
}

/** Count line, naming the subcategory when one is narrowing the results. */
function resultSummary(
  total: number,
  subcategoryName: string | undefined
): string {
  const scope = subcategoryName ? ` in ${subcategoryName}` : "";

  if (total === 0) {
    return `No items available${scope} yet.`;
  }

  return total === 1
    ? `1 item available to rent${scope}.`
    : `${total} items available to rent${scope}.`;
}
