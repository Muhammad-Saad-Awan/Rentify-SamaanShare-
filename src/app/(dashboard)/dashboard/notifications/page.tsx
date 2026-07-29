import { BellIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { requireUser } from "@/lib/auth/session";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Your SamaanShare activity notifications.",
};

/**
 * Notification centre. Placeholder for Phase 4.
 *
 * Paired with `NotificationBell` in the header, which links here. Both are shell
 * only - nothing writes to the `Notification` table until the booking lifecycle
 * exists to generate events.
 */
export default async function NotificationsPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates about your listings, bookings and account."
      />

      <PlaceholderCard
        icon={BellIcon}
        title="No notifications yet"
        description="In-app notifications arrive in Phase 4, alongside the booking lifecycle that generates them."
        phase="Phase 4"
      />
    </>
  );
}
