import {
  CalendarCheckIcon,
  HeartIcon,
  InboxIcon,
  PackageIcon,
  SlidersHorizontalIcon,
} from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { StatCard } from "@/components/dashboard/stat-card";
import { requireUser } from "@/lib/auth/session";
import { getDisplayName } from "@/lib/utils/user";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your SamaanShare activity at a glance.",
};

/**
 * Dashboard overview.
 *
 * `requireUser()` is called here as well as in the layout, deliberately. React
 * reuses a layout across client-side navigations without re-running it, so the
 * layout's check cannot be relied on for a page reached from another dashboard
 * route. The cost is re-reading the session cookie - no database query, since
 * `requireUser` reads role and status straight from the JWT.
 *
 * Metrics show an em dash rather than `0`. There is no listing or booking data
 * yet, and a hardcoded zero is indistinguishable from a real count that failed
 * to load.
 */
export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <>
      <PageHeader
        title={`Welcome back, ${getDisplayName(user)}`}
        description="Once listings and bookings are live, this is where you will track them."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active listings"
          value="—"
          icon={PackageIcon}
          hint="Available in Phase 3"
        />
        <StatCard
          label="Active bookings"
          value="—"
          icon={CalendarCheckIcon}
          hint="Available in Phase 4"
        />
        <StatCard
          label="Saved listings"
          value="—"
          icon={HeartIcon}
          hint="Available in Phase 2.2"
        />
        <StatCard
          label="Unread notifications"
          value="—"
          icon={InboxIcon}
          hint="Available in Phase 4"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PlaceholderCard
          icon={SlidersHorizontalIcon}
          title="Recent activity"
          description="Booking requests, approvals and messages will appear here as they happen."
          phase="Phase 4"
        />
        <PlaceholderCard
          icon={PackageIcon}
          title="Your listings"
          description="A summary of your published items, with views and inquiry counts."
          phase="Phase 3"
        />
      </div>
    </>
  );
}
