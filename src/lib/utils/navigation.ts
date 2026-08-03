import { DASHBOARD_NAV, SEGMENT_LABELS } from "@/config/navigation";
import { DEFAULT_LOGIN_REDIRECT } from "@/config/routes";

import type { NavItem, NavSection } from "@/config/navigation";
import type { UserRole } from "@/generated/prisma/enums";

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
      label: labelForSegment(segment),
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
 * A display label for one URL segment.
 *
 * Falls back to title-casing so an unmapped route still produces a readable
 * crumb. Note this means a dynamic segment renders its raw value - once
 * `/dashboard/listings/[id]` exists it should pass a real title down rather
 * than rely on this fallback showing a cuid.
 */
function labelForSegment(segment: string): string {
  const mapped = SEGMENT_LABELS[segment];

  if (mapped) {
    return mapped;
  }

  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
