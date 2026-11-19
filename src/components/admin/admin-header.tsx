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
    /*
      A card band rather than a rule under the page title: the boundary between "my account" and
      "everybody's" should read as a different surface, not one more line. The shield tile stays
      navy - the one solid navy mark on these screens - because this is where authority, not
      brand, is the message.
    */
    <div className="bg-card flex flex-col gap-3 rounded-2xl border p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <span
          className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-xl"
          aria-hidden="true"
        >
          <ShieldIcon className="size-[1.125rem]" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-sm font-bold tracking-tight">
              Administration
            </span>
            <Badge variant="secondary">Restricted</Badge>
          </span>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Actions here affect other people&apos;s accounts, listings and
            money, and are recorded against your name.
          </p>
        </div>
      </div>

      {/*
        Scrolls horizontally rather than wrapping. On a phone the sidebar is a drawer, so switching
        admin sections otherwise costs a tap to open it, a scroll past the member sections, and a tap
        to leave - and a row that wraps to three lines pushes the actual page below the fold.
      */}
      <nav
        aria-label="Administration"
        className="-mx-1 flex gap-1 overflow-x-auto border-t px-1 pt-3 pb-0.5"
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
                "focus-visible:ring-ring flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors outline-none focus-visible:ring-2",
                // Selected is mint everywhere in the dashboard - the sidebar, these tabs, the
                // filter chips and the queue tabs - with an emerald edge and a heavier weight so
                // the state never rests on the fill alone.
                isActive
                  ? "bg-brand-soft text-brand-soft-foreground border-brand font-semibold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground border-transparent"
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
