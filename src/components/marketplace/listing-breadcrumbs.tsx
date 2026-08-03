import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface ListingBreadcrumbsProps {
  category: { name: string; slug: string };
  title: string;
}

/**
 * Trail for a listing detail page: Browse → Category → this listing.
 *
 * Built from props rather than from `usePathname()`, which is what the dashboard's
 * breadcrumbs do. The difference is that a listing's ancestry is not derivable from
 * its URL - `/listings/clx123` says nothing about which category it belongs to - so
 * the data has to come from the record. That also keeps this a Server Component.
 *
 * The trail is anchored at Browse rather than Home: a visitor on a listing came to
 * shop, and the useful step back is the catalogue, not the marketing page. Home is
 * one tap away in the header.
 *
 * The listing's own title is truncated rather than wrapped, so a long title cannot
 * push the page content down on a narrow screen.
 */
function ListingBreadcrumbs({ category, title }: ListingBreadcrumbsProps) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink render={<Link href="/listings" />}>
            Browse
          </BreadcrumbLink>
        </BreadcrumbItem>

        <BreadcrumbSeparator />

        <BreadcrumbItem>
          <BreadcrumbLink
            render={<Link href={`/categories/${category.slug}`} />}
          >
            {category.name}
          </BreadcrumbLink>
        </BreadcrumbItem>

        <BreadcrumbSeparator />

        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="max-w-[16rem] truncate sm:max-w-sm">
            {title}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export { ListingBreadcrumbs };
