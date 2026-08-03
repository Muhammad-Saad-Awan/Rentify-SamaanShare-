import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import {
  MAIN_CONTENT_ID,
  SkipToContent,
} from "@/components/shared/skip-to-content";
import { requireUser } from "@/lib/auth/session";

import type { ReactNode } from "react";

interface DashboardLayoutProps {
  children: ReactNode;
}

/**
 * Shell for every authenticated section of the app.
 *
 * `(dashboard)` is a route group - the parentheses keep it out of the URL. That
 * matters here because the sections it wraps do not share a URL prefix:
 * `/dashboard/*`, `/profile`, `/settings` and `/admin` are all separate
 * top-level prefixes in `@/config/routes`, yet all need the same sidebar and
 * header. A group gives them one layout without forcing them under one segment.
 *
 * `requireUser()` runs here so the shell itself cannot render without a session,
 * and so `user` is resolved once for both the sidebar and the header. It is NOT
 * the only check: see the note in each page. On a client-side navigation between
 * two dashboard routes React reuses this layout without re-executing it, so a
 * layout-only guard would leave the destination page unverified.
 */
export default async function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  const user = await requireUser();

  return (
    <div className="flex flex-1">
      {/*
        The dashboard needed this more than the public shell did, and had it longer: the
        sidebar is eight or nine links plus a brand, so without a skip link a keyboard or
        screen reader user walks all of them before reaching content - on every navigation.
        First tab stop, so it precedes the sidebar in the DOM.
      */}
      <SkipToContent />

      <DashboardSidebar role={user.role} />

      {/*
        `min-w-0` is load-bearing. Without it this flex child adopts its
        content's intrinsic width, and any wide child - a table, a long
        unbroken string - pushes the column past the viewport and forces the
        whole page to scroll horizontally instead of scrolling inside itself.
      */}
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardHeader user={user} />

        {/*
          `tabIndex={-1}` makes the skip link's target focusable: following a fragment link
          moves scroll but not keyboard focus unless the target can hold it, which would
          leave the next Tab press continuing from the sidebar the user just skipped.
        */}
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="flex-1 outline-none"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:px-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
