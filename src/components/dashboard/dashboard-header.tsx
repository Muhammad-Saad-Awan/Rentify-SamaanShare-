import { Suspense } from "react";

import { MessagesButton } from "@/components/chat/messages-button";
import { DashboardBreadcrumbs } from "@/components/dashboard/dashboard-breadcrumbs";
import { DashboardMobileNav } from "@/components/dashboard/dashboard-mobile-nav";
import {
  NotificationBell,
  NotificationBellFallback,
} from "@/components/dashboard/notification-bell";
import { UserMenu } from "@/components/dashboard/user-menu";

import type { Session } from "next-auth";
import type { ReactNode } from "react";

interface DashboardHeaderProps {
  user: Session["user"];
  /** Nav badges, for the mobile drawer - see `DashboardNav`. */
  navBadges?: Readonly<Record<string, ReactNode>> | undefined;
  /** Unread messages, counted once by the layout. */
  unreadMessages: number;
}

/**
 * Sticky top bar: drawer trigger, breadcrumb trail, notifications, account menu.
 *
 * A Server Component that composes Client Components. The session `user` is
 * already in memory in the layout, so passing it down as a prop avoids a
 * `useSession()` call in the browser - the header renders signed-in on the very
 * first paint instead of flashing an empty avatar while the session loads.
 *
 * `z-30` sits below the drawer and dropdown popups (`z-50`) so an open overlay
 * is never painted behind the header.
 */
function DashboardHeader({
  user,
  navBadges,
  unreadMessages,
}: DashboardHeaderProps) {
  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur lg:px-6">
      <DashboardMobileNav role={user.role} badges={navBadges} />

      <DashboardBreadcrumbs className="min-w-0 flex-1" />

      <div className="flex shrink-0 items-center gap-0.5">
        {/* Suspended on its own so the two notification queries never hold up the header. */}
        <MessagesButton unread={unreadMessages} />

        <Suspense fallback={<NotificationBellFallback />}>
          <NotificationBell userId={user.id} />
        </Suspense>

        <UserMenu user={user} />
      </div>
    </header>
  );
}

export { DashboardHeader };
