import { CalendarCheckIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { requireUser } from "@/lib/auth/session";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Bookings",
  description: "Track the items you have rented on SamaanShare.",
};

/**
 * Renter-facing booking list. Placeholder for Phase 4.
 *
 * Will eventually split by booking state - the schema's `BookingStatus` covers
 * pending, approved, active, completed and cancelled - but the tab structure is
 * left out here rather than shipped as tabs that filter nothing.
 */
export default async function MyBookingsPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="My Bookings"
        description="Items you have requested or rented from other members."
      />

      <PlaceholderCard
        icon={CalendarCheckIcon}
        title="No bookings yet"
        description="The booking lifecycle arrives in Phase 4. Requests, approvals, pickup instructions and rental history will be shown here."
        phase="Phase 4"
      />
    </>
  );
}
