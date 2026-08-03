"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { buildBreadcrumbs } from "@/lib/utils/navigation";

interface DashboardBreadcrumbsProps {
  className?: string;
}

/**
 * Breadcrumb trail for the current route.
 *
 * Derived from `usePathname()` rather than passed down per page. A Server
 * Component cannot read its own pathname in Next 15, so a server-rendered trail
 * would mean every page repeating its own ancestry - which drifts the moment a
 * route moves. Reading the path once here keeps the trail correct by
 * construction.
 *
 * Below `sm` only the current page is shown: a full trail wraps onto a second
 * line inside a 14-unit-tall header on narrow screens.
 */
function DashboardBreadcrumbs({ className }: DashboardBreadcrumbsProps) {
  const pathname = usePathname();
  const crumbs = buildBreadcrumbs(pathname);

  if (crumbs.length === 0) {
    return null;
  }

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb) => (
          // Item and separator are siblings inside the <ol>. Nesting the
          // separator within the item would put an <li> inside an <li>.
          <Fragment key={crumb.href}>
            <BreadcrumbItem
              className={crumb.isCurrent ? "min-w-0" : "hidden sm:inline-flex"}
            >
              {crumb.isCurrent ? (
                <BreadcrumbPage className="truncate font-medium">
                  {crumb.label}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbLink render={<Link href={crumb.href} />}>
                  {crumb.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>

            {!crumb.isCurrent && (
              <BreadcrumbSeparator className="hidden sm:inline-flex" />
            )}
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export { DashboardBreadcrumbs };
