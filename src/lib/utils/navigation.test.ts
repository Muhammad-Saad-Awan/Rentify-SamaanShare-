import { describe, expect, it } from "vitest";

import { DASHBOARD_NAV } from "@/config/navigation";
import { UserRole } from "@/generated/prisma/enums";
import {
  adminNavItems,
  buildBreadcrumbs,
  isNavItemActive,
} from "@/lib/utils/navigation";

import type { NavItem } from "@/config/navigation";

/**
 * Dashboard navigation.
 *
 * Focused on the "Home" entry added for the marketplace link, because `/` interacts badly with
 * prefix matching in a way no other href in the map does: it is a prefix of every route in the
 * application. Getting it wrong is not subtle to a user - every page would show two highlighted
 * items - but it is invisible in a diff, which is what makes it worth a test.
 */

const allItems: NavItem[] = DASHBOARD_NAV.flatMap((section) => [
  ...section.items,
]);

const homeItem = allItems.find((item) => item.href === "/");

describe("the Home nav entry", () => {
  it("exists and points at the marketplace root", () => {
    expect(homeItem).toBeDefined();
    expect(homeItem?.title).toBe("Home");
  });

  /**
   * The whole reason this test file exists.
   *
   * Without `exact`, `isNavItemActive` falls back to a prefix match, and `/` prefixes everything.
   */
  it("is exact-matched", () => {
    expect(homeItem?.exact).toBe(true);
  });

  it("highlights only on the marketplace homepage", () => {
    expect(isNavItemActive("/", homeItem!)).toBe(true);
  });

  it("does not highlight anywhere inside the dashboard", () => {
    for (const pathname of [
      "/dashboard",
      "/dashboard/listings",
      "/dashboard/bookings",
      "/dashboard/requests",
      "/dashboard/notifications",
      "/saved",
      "/profile",
      "/settings",
      "/admin",
      "/listings",
      "/listings/abc123",
    ]) {
      expect(isNavItemActive(pathname, homeItem!)).toBe(false);
    }
  });
});

describe("nav map integrity", () => {
  it("has no duplicate hrefs", () => {
    const hrefs = allItems.map((item) => item.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  /**
   * Every index-style href must be exact.
   *
   * `/` and `/dashboard` are both prefixes of other entries, so a prefix match would leave them
   * permanently active. Derived rather than hardcoded, so a future index route added without
   * `exact` fails here instead of shipping a permanently-lit sidebar.
   */
  it("marks every href that prefixes another as exact", () => {
    for (const item of allItems) {
      const prefixesAnother = allItems.some(
        (other) => other !== item && other.href.startsWith(`${item.href}/`)
      );

      // `/` is a special case: `startsWith("//")` is false, so the check above misses it.
      const isRoot = item.href === "/";

      if (prefixesAnother || isRoot) {
        expect(item.exact, `${item.href} must be exact`).toBe(true);
      }
    }
  });
});

describe("buildBreadcrumbs is unaffected by the Home entry", () => {
  /**
   * Breadcrumbs are built from the pathname and `SEGMENT_LABELS`, never from `DASHBOARD_NAV` - so
   * adding a nav item cannot change a trail. Asserted because the two are easy to assume coupled.
   */
  it("returns no crumbs for the marketplace root", () => {
    expect(buildBreadcrumbs("/")).toEqual([]);
  });

  it("still anchors a top-level section to Dashboard", () => {
    expect(buildBreadcrumbs("/settings")).toEqual([
      { label: "Dashboard", href: "/dashboard", isCurrent: false },
      { label: "Settings", href: "/settings", isCurrent: true },
    ]);
  });

  it("does not double-anchor a dashboard-nested route", () => {
    expect(buildBreadcrumbs("/dashboard/listings")).toEqual([
      { label: "Dashboard", href: "/dashboard", isCurrent: false },
      { label: "My Listings", href: "/dashboard/listings", isCurrent: true },
    ]);
  });
});

describe("adminNavItems", () => {
  const items = adminNavItems();

  /**
   * The admin sub-header renders from this rather than from a list of its own. Pinned because the
   * drift it prevents is invisible: a queue reachable from the sidebar and not from the header, or
   * the reverse, looks correct on whichever screen you happen to be on.
   */
  it("returns exactly the ADMIN-gated section's items", () => {
    const gated = DASHBOARD_NAV.filter(
      (section) => section.requiredRole === UserRole.ADMIN
    ).flatMap((section) => section.items);

    expect(items).toEqual(gated);
  });

  it("includes every admin surface", () => {
    expect(items.map((item) => item.href)).toEqual([
      "/admin",
      "/admin/reports",
      "/admin/users",
      "/admin/listings",
      "/admin/bookings",
      "/admin/claims",
      "/admin/analytics",
    ]);
  });

  /**
   * `/admin` is a prefix of every other entry, so without `exact` it would highlight alongside the
   * real current section - the header would show two active tabs on every page but its own.
   */
  it("marks the index route exact so it does not match its children", () => {
    const index = items.find((item) => item.href === "/admin");

    expect(index?.exact).toBe(true);
    expect(isNavItemActive("/admin/reports", index!)).toBe(false);
  });

  it("keeps a section link active on its own detail routes", () => {
    const listings = items.find((item) => item.href === "/admin/listings");

    expect(isNavItemActive("/admin/listings/abc123", listings!)).toBe(true);
  });
});
