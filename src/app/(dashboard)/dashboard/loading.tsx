import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";

/**
 * Suspense fallback for the overview.
 *
 * `loading.tsx` wraps the page - not the layout - in a Suspense boundary, so the
 * sidebar and header stay mounted and interactive while this renders. Matches
 * the overview's own shape: stat row plus a two-card grid.
 */
export default function DashboardLoading() {
  return <DashboardPageSkeleton withStats cards={2} />;
}
