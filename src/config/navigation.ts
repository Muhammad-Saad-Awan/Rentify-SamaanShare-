import {
  BarChart3Icon,
  BellIcon,
  CalendarCheckIcon,
  CalendarSearchIcon,
  FlagIcon,
  HeartIcon,
  HomeIcon,
  InboxIcon,
  LayoutDashboardIcon,
  PackageIcon,
  PackageSearchIcon,
  ScaleIcon,
  SettingsIcon,
  ShieldIcon,
  UserIcon,
  UsersIcon,
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
 * Paths deliberately mirror `PROTECTED_PREFIXES` in `@/config/routes`, with one
 * deliberate exception: the "Home" entry points at `/`, which is public. It is
 * the way *out* of the dashboard rather than a section of it, so it is the only
 * href here that middleware does not guard - and it must stay that way, since
 * the whole point is reaching the marketplace. Every other entry sits under a
 * protected prefix, so middleware still guards the rest of the map without a
 * second list to maintain.
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
      /**
       * Back to the public marketplace.
       *
       * `exact` is load-bearing here, more than anywhere else in this map: `/` is a prefix of
       * every route in the app, so a prefix match would light this up permanently and leave the
       * sidebar with two "current" items on every page. Pinned by a test.
       *
       * First in the list because it is what someone reaches for when they are done with the
       * dashboard, and because a link out of a section belongs above that section's contents
       * rather than buried among them.
       */
      {
        title: "Home",
        href: "/",
        icon: HomeIcon,
        exact: true,
      },
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
      // The owner's side of the same system. Separate entry rather than a tab, because the
      // two answer different questions: what have I rented, versus what is being asked of me.
      { title: "Requests", href: "/dashboard/requests", icon: InboxIcon },
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
    items: [
      { title: "Admin", href: "/admin", icon: ShieldIcon, exact: true },
      { title: "Reports", href: "/admin/reports", icon: FlagIcon },
      { title: "Members", href: "/admin/users", icon: UsersIcon },
      /**
       * Listing moderation. `/admin/listings` rather than a section of `/dashboard/listings`,
       * which is the owner's own inventory - the two look similar and answer opposite questions:
       * what am I renting out, versus what is on this platform.
       */
      { title: "Listings", href: "/admin/listings", icon: PackageSearchIcon },
      /**
       * Booking oversight. Read-only - every step of a booking belongs to one of the two parties,
       * so this answers "what happened" and cannot change it. See `queries/admin-bookings.ts`.
       */
      {
        title: "Bookings",
        href: "/admin/bookings",
        icon: CalendarSearchIcon,
      },
      { title: "Claims", href: "/admin/claims", icon: ScaleIcon },
      /**
       * Platform totals. Last in the section deliberately: the queues above it are where somebody
       * is waiting on a decision, and analytics is where nobody is.
       */
      { title: "Analytics", href: "/admin/analytics", icon: BarChart3Icon },
    ],
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
/**
 * Labels for whole paths, checked before {@link SEGMENT_LABELS}.
 *
 * Exists because segment names collide across sections: `/dashboard/listings` is the owner's own
 * inventory ("My Listings") and `/admin/listings` is every listing on the platform, and a single
 * `listings` entry cannot be right for both. Keyed by the full path so the more specific answer
 * wins, with the segment map as the fallback.
 */
export const PATH_LABELS: Readonly<Record<string, string>> = {
  "/admin/listings": "Listings",
  "/admin/bookings": "Bookings",
  "/admin/analytics": "Analytics",
  "/admin/users": "Members",
};

export const SEGMENT_LABELS: Readonly<Record<string, string>> = {
  dashboard: "Dashboard",
  listings: "My Listings",
  bookings: "My Bookings",
  saved: "Saved Listings",
  requests: "Requests",
  notifications: "Notifications",
  profile: "Profile",
  settings: "Settings",
  admin: "Admin",
  reports: "Reports",
  users: "Members",
  claims: "Deposit claims",
  "verify-email": "Confirm email",
};
