import { ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { ReportCard } from "@/components/admin/report-card";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { ReportStatus } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth/session";
import { getReports } from "@/lib/queries/reports";
import { parsePageParam } from "@/lib/utils/pagination";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reports",
  description: "Moderation queue.",
  // Same as the admin landing page: never indexed, even if a crawler reaches it
  // with a session cookie present.
  robots: { index: false, follow: false },
};

/** The three views of the queue. Anything else in the URL falls back to pending. */
const STATUS_TABS = [
  { status: ReportStatus.PENDING, label: "Pending", href: "/admin/reports" },
  {
    status: ReportStatus.RESOLVED,
    label: "Resolved",
    href: "/admin/reports?status=resolved",
  },
  {
    status: ReportStatus.DISMISSED,
    label: "Dismissed",
    href: "/admin/reports?status=dismissed",
  },
] as const;

interface ReportsPageProps {
  searchParams: Promise<{
    page?: string | string[];
    status?: string | string[];
  }>;
}

/**
 * The moderation queue.
 *
 * `requireAdmin()` again despite `admin/layout.tsx` already doing it, for the reason stated there:
 * a client-side navigation can reuse a layout without re-running it, so the layout is the boundary
 * that catches new routes and this is the one that catches this route.
 */
export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const { page: rawPage, status: rawStatus } = await searchParams;

  return (
    // In-page Suspense rather than a route-level loading.tsx - see the invariant in AGENTS.md.
    // Keyed on both params so the skeleton reappears when switching tabs, not just pages.
    <Suspense
      key={`${String(rawStatus ?? "pending")}:${String(rawPage ?? 1)}`}
      fallback={<DashboardPageSkeleton cards={3} />}
    >
      <ReportQueue rawPage={rawPage} rawStatus={rawStatus} />
    </Suspense>
  );
}

interface ReportQueueProps {
  rawPage: string | string[] | undefined;
  rawStatus: string | string[] | undefined;
}

async function ReportQueue({ rawPage, rawStatus }: ReportQueueProps) {
  await requireAdmin();

  const status = parseStatusParam(rawStatus);
  const active =
    STATUS_TABS.find((tab) => tab.status === status) ?? STATUS_TABS[0];

  const { items, total, page, totalPages } = await getReports({
    status,
    page: parsePageParam(rawPage),
  });

  return (
    <>
      <PageHeader
        title="Reports"
        description={
          status === ReportStatus.PENDING
            ? total === 0
              ? "Nothing is waiting for a decision."
              : `${total === 1 ? "1 report" : `${total} reports`} awaiting a decision.`
            : `${total === 1 ? "1 report" : `${total} reports`} in this view.`
        }
      />

      {/*
        Links rather than a client-side filter, matching the sort control on /listings: each view
        stays shareable and reachable with the back button, which for a moderation queue also means
        a decision can be linked to a colleague.
      */}
      <nav aria-label="Report status" className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.status}
            size="sm"
            variant={tab.status === active.status ? "default" : "outline"}
            render={<Link href={tab.href} />}
            {...(tab.status === active.status
              ? { "aria-current": "page" as const }
              : {})}
          >
            {tab.label}
          </Button>
        ))}
      </nav>

      {items.length > 0 && (
        <ul className="flex flex-col gap-4">
          {items.map((report) => (
            <li key={report.id}>
              <ReportCard report={report} />
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && (
        <EmptyState
          icon={ShieldCheckIcon}
          title={total === 0 ? "Nothing here" : "No reports on this page"}
          description={
            total === 0
              ? status === ReportStatus.PENDING
                ? "Reports filed against listings, people and reviews arrive here. An empty queue is the normal state."
                : "No reports have been closed this way yet."
              : `There ${totalPages === 1 ? "is only 1 page" : `are only ${totalPages} pages`} in this view.`
          }
          {...(total > 0
            ? {
                action: (
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={active.href} />}
                  >
                    Back to first page
                  </Button>
                ),
              }
            : {})}
        />
      )}

      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(target) =>
          target > 1
            ? `${active.href}${active.href.includes("?") ? "&" : "?"}page=${target}`
            : active.href
        }
      />
    </>
  );
}

/**
 * The `?status=` parameter, or pending.
 *
 * Falls back rather than 404s on an unrecognised value: this is a filter on a queue, not an
 * identifier, and a mistyped one should show the default view rather than an error page.
 */
function parseStatusParam(raw: string | string[] | undefined): ReportStatus {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.toLowerCase();

  switch (value) {
    case "resolved":
      return ReportStatus.RESOLVED;
    case "dismissed":
      return ReportStatus.DISMISSED;
    default:
      return ReportStatus.PENDING;
  }
}
