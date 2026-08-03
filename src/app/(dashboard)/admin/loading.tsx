import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";

/**
 * Admin fallback. Worth having even though the page is a placeholder:
 * `requireAdmin()` in the layout above hits the database, so this boundary is
 * genuinely reachable rather than instantaneous.
 */
export default function AdminLoading() {
  return <DashboardPageSkeleton cards={1} />;
}
