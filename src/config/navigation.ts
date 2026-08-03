import {
  BellIcon,
  CalendarCheckIcon,
  HeartIcon,
  LayoutDashboardIcon,
  PackageIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
} from "lucide-react";

import { UserRole } from "@/generated/prisma/enums";

import type { LucideIcon } from "lucide-react";

/**
 * Navigation map for the authenticated shell.
 *
 * Single source of truth for three consumers that must never disagree: the
 * desktop sidebar, the mobile drawer, and the breadcrumb trail. Adding a
 * dashboard section means adding one entry here - no component edits.
 *
 * Paths deliberately mirror `PROTECTED_PREFIXES` in `@/config/routes`. Every
 * `href` below already sits under one of those prefixes, so middleware guards
 * the whole map without a second list to maintain.
 */

export interface NavItem {
  /** Label shown in the sidebar and used as the breadcrumb leaf. */
  title: string;
  href: string;
  icon: LucideIcon;
  /**
   * Match `href` exactly instead of by prefix.
   *
   * Required for index routes: without it `/dashboard` would highlight as
   * active while the user is on `/dashboard/listings`, because every section is
   * a prefix match of the overview.
   */
  exact?: boolean;
}

export interface NavSection {
  /** Group heading. Rendered above the group in the sidebar. */
  title: string;
  items: readonly NavItem[];
  /**
   * When set, the whole section is filtered out for users without this role.
   *
   * Presentation only. The real gate is `requireAdmin()` in the route's layout
   * plus `ADMIN_PREFIXES` in middleware - hiding a link is not authorization.
   */
  requiredRole?: UserRole;
}

export const DASHBOARD_NAV: readonly NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboardIcon,
        exact: true,
      },
    ],
  },
  {
    title: "Marketplace",
    items: [
      { title: "My Listings", href: "/dashboard/listings", icon: PackageIcon },
      {
        title: "My Bookings",
        href: "/dashboard/bookings",
        icon: CalendarCheckIcon,
      },
      { title: "Saved Listings", href: "/saved", icon: HeartIcon },
    ],
  },
  {
    title: "Account",
    items: [
      {
        title: "Notifications",
        href: "/dashboard/notifications",
        icon: BellIcon,
      },
      { title: "Profile", href: "/profile", icon: UserIcon },
      { title: "Settings", href: "/settings", icon: SettingsIcon },
    ],
  },
  {
    title: "Administration",
    requiredRole: UserRole.ADMIN,
    items: [{ title: "Admin", href: "/admin", icon: ShieldIcon }],
  },
] as const;

/**
 * Labels for URL segments that are not themselves a {@link NavItem} href.
 *
 * `/dashboard/listings` resolves from the nav map, but an intermediate segment
 * with no page of its own - or a future leaf like `/dashboard/listings/new` -
 * has no entry to borrow a label from. Anything missing here falls back to a
 * title-cased segment, so an unmapped route degrades to "New" rather than
 * breaking the trail.
 */
export const SEGMENT_LABELS: Readonly<Record<string, string>> = {
  dashboard: "Dashboard",
  listings: "My Listings",
  bookings: "My Bookings",
  saved: "Saved Listings",
  notifications: "Notifications",
  profile: "Profile",
  settings: "Settings",
  admin: "Admin",
};
