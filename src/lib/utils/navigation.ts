import {
  DASHBOARD_NAV,
  PATH_LABELS,
  SEGMENT_LABELS,
} from "@/config/navigation";
import { DEFAULT_LOGIN_REDIRECT } from "@/config/routes";
// A value import, not a type one: `adminNavItems` matches sections by role rather than by title.
import { UserRole } from "@/generated/prisma/enums";

import type { NavItem, NavSection } from "@/config/navigation";

/**
 * Pure helpers behind the dashboard shell.
 *
 * Deliberately free of React and of `next/navigation` so they stay unit
 * testable and can be called from either a Server or a Client Component. The
 * components supply `pathname`; these functions only transform it.
 */

/** True when `pathname` should highlight `item` in the sidebar. */
export function isNavItemActive(pathname: string, item: NavItem): boolean {
  if (item.exact) {
    return pathname === item.href;
  }

  // Prefix match with the trailing slash, so `/settings` does not light up for
  // a sibling like `/settings-export`.
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * The nav sections this role may see, with role-gated sections removed.
 *
 * Presentation only - see the note on {@link NavSection.requiredRole}. A user
 * who forges their way to `/admin` is stopped by `requireAdmin()`, not by the
 * absence of a link.
 */
export function visibleNavSections(
  role: UserRole | undefined
): readonly NavSection[] {
  return DASHBOARD_NAV.filter(
    (section) => !section.requiredRole || section.requiredRole === role
  );
}

/**
 * The admin surfaces, as the admin sub-header renders them.
 *
 * DERIVED FROM THE SAME MAP THE SIDEBAR USES, never a second list. A header and a sidebar showing
 * different sets is the kind of drift nobody notices until a queue is unreachable from one of them -
 * and this map is already the single source of truth for three other consumers.
 *
 * Matched by `requiredRole` rather than by section title: the heading is copy and will be reworded
 * eventually, while the role is the thing that actually makes a section administrative.
 */
export function adminNavItems(): readonly NavItem[] {
  return DASHBOARD_NAV.filter(
    (section) => section.requiredRole === UserRole.ADMIN
  ).flatMap((section) => section.items);
}

export interface BreadcrumbEntry {
  label: string;
  href: string;
  /** The final crumb: rendered as plain text rather than a link. */
  isCurrent: boolean;
}

/**
 * Turns a pathname into a breadcrumb trail.
 *
 * Every trail is anchored to `/dashboard`, even for sections that do not nest
 * under it (`/profile`, `/settings`, `/admin` are top-level prefixes in
 * `@/config/routes`). That gives the shell one consistent way back regardless
 * of which section the user is in.
 */
export function buildBreadcrumbs(pathname: string): BreadcrumbEntry[] {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return [];
  }

  let href = "";

  // `isCurrent` is decided during construction rather than by mutating the last
  // entry afterwards - indexing back into the array would need a non-null
  // assertion under `noUncheckedIndexedAccess`.
  const crumbs: BreadcrumbEntry[] = segments.map((segment, index) => {
    href += `/${segment}`;

    return {
      // The accumulated href, not just the segment: `listings` means two different things under
      // `/dashboard` and under `/admin` - see `PATH_LABELS`.
      label: labelForPath(href, segment),
      href,
      isCurrent: index === segments.length - 1,
    };
  });

  if (`/${segments[0]}` !== DEFAULT_LOGIN_REDIRECT) {
    crumbs.unshift({
      label: "Dashboard",
      href: DEFAULT_LOGIN_REDIRECT,
      isCurrent: false,
    });
  }

  return crumbs;
}

/**
 * A display label for one crumb.
 *
 * Most specific answer first: an exact path, then the segment name, then title-casing so an
 * unmapped route still produces a readable crumb. Note the fallback means a dynamic segment renders
 * its raw value - once `/dashboard/listings/[id]` exists it should pass a real title down rather
 * than rely on this showing a cuid.
 */
function labelForPath(path: string, segment: string): string {
  const byPath = PATH_LABELS[path];

  if (byPath) {
    return byPath;
  }

  const mapped = SEGMENT_LABELS[segment];

  if (mapped) {
    return mapped;
  }

  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
