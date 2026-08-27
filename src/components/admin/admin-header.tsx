"use client";

import { ShieldIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { adminNavItems, isNavItemActive } from "@/lib/utils/navigation";

/**
 * Sub-header for every route under `/admin`.
 *
 * WHY A DISTINCT HEADER AT ALL. The admin area rendered inside the member dashboard with no visual
 * difference whatsoever - same shell, same top bar, same page chrome - so the only signal that a
 * click here suspends somebody's account rather than pausing your own listing was the URL. This is
 * the boundary made visible, and it is the reason the sentence below names consequences rather than
 * saying "admin area".
 *
 * ITS LINKS COME FROM `DASHBOARD_NAV`, through `adminNavItems()`. A second hand-written list would
 * drift from the sidebar, and the failure mode is a queue that exists but is unreachable from one of
 * the two navigations.
 *
 * NO COUNTS HERE, DELIBERATELY. A badge on a persistent header has to be either always true - which
 * would mean counting reports and claims on every admin page load, and `getOpenClaimCount` escalates
 * overdue claims, so a *layout* would be writing to the database on every navigation - or
 * possibly-stale, which is a number that lies in the one place it is always on screen. "What is
 * waiting" belongs on `/admin`, which is the first link in the row.
 *
 * A Client Component only because active state needs `usePathname()`, matching `DashboardNav`.
 */
function AdminHeader() {
  const pathname = usePathname();
  const items = adminNavItems();

  return (
    <div className="flex flex-col gap-2.5 border-b pb-4">
      <div className="flex flex-wrap items-center gap-2">
        <ShieldIcon
          className="text-muted-foreground size-4 shrink-0"
          aria-hidden="true"
        />
        <span className="font-heading text-sm font-medium">Administration</span>
        <Badge variant="secondary">Restricted</Badge>
        <p className="text-muted-foreground text-xs">
          Actions here affect other people&apos;s accounts, listings and money,
          and are recorded against your name.
        </p>
      </div>

      {/*
        Scrolls horizontally rather than wrapping. On a phone the sidebar is a drawer, so switching
        admin sections otherwise costs a tap to open it, a scroll past the member sections, and a tap
        to leave - and a row that wraps to three lines pushes the actual page below the fold.
      */}
      <nav
        aria-label="Administration"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5"
      >
        {items.map((item) => {
          const isActive = isNavItemActive(pathname, item);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              // Communicates the current section to assistive tech, which cannot infer it from the
              // background colour alone.
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "focus-visible:ring-ring flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors outline-none focus-visible:ring-2",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden="true" />
              {item.title}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export { AdminHeader };
