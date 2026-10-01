import { HandCoinsIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { SettlementCard } from "@/components/admin/settlement-card";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/session";
import { getSettlementQueue } from "@/lib/queries/admin-settlements";
import { parsePageParam } from "@/lib/utils/pagination";

import type { SettlementView } from "@/lib/queries/admin-settlements";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settlements",
  description: "Finished rentals waiting to be settled and paid out.",
  robots: { index: false, follow: false },
};

/**
 * The views.
 *
 * TWO WORKING VIEWS, NOT ONE, because settling and sending are different acts done at different
 * times. Deciding what a booking owes happens at a desk; the transfers happen in a banking app
 * afterwards, and an administrator coming back to record references does not want to wade past
 * bookings they have not decided yet.
 */
const VIEW_TABS = [
  { view: "to-settle", label: "To settle", href: "/admin/settlements" },
  {
    view: "to-send",
    label: "To send",
    href: "/admin/settlements?view=to-send",
  },
  { view: "done", label: "Done", href: "/admin/settlements?view=done" },
] as const satisfies readonly {
  view: SettlementView;
  label: string;
  href: string;
}[];

function parseViewParam(raw: string | string[] | undefined): SettlementView {
  const value = Array.isArray(raw) ? raw[0] : raw;

  return value === "to-send" || value === "done" ? value : "to-settle";
}

interface SettlementsPageProps {
  searchParams: Promise<{
    page?: string | string[];
    view?: string | string[];
  }>;
}

/**
 * The settlement queue.
 *
 * `requireAdmin()` again despite `admin/layout.tsx` already doing it, for the reason stated
 * there: a client-side navigation can reuse a layout without re-running it.
 */
export default async function SettlementsPage({
  searchParams,
}: SettlementsPageProps) {
  const { page: rawPage, view: rawView } = await searchParams;

  return (
    // In-page Suspense rather than a route-level loading.tsx - see the invariant in AGENTS.md.
    <Suspense
      key={`${String(rawView ?? "to-settle")}:${String(rawPage ?? 1)}`}
      fallback={<DashboardPageSkeleton cards={3} />}
    >
      <SettlementQueue rawPage={rawPage} rawView={rawView} />
    </Suspense>
  );
}

interface SettlementQueueProps {
  rawPage: string | string[] | undefined;
  rawView: string | string[] | undefined;
}

async function SettlementQueue({ rawPage, rawView }: SettlementQueueProps) {
  await requireAdmin();

  const view = parseViewParam(rawView);
  const active = VIEW_TABS.find((tab) => tab.view === view) ?? VIEW_TABS[0];

  const { items, total, page, totalPages } = await getSettlementQueue({
    view,
    page: parsePageParam(rawPage),
  });

  return (
    <>
      <PageHeader
        title="Settlements"
        description={
          view === "to-settle"
            ? total === 0
              ? "Nothing is waiting to be settled."
              : `${total === 1 ? "1 finished rental" : `${total} finished rentals`} to settle, oldest first.`
            : view === "to-send"
              ? `${total === 1 ? "1 settlement" : `${total} settlements`} with money still to send.`
              : `${total === 1 ? "1 settlement" : `${total} settlements`} fully paid out.`
        }
      />

      {/*
        Links rather than a client-side filter, matching the other queues: each view stays
        shareable, which for a queue means work can be handed to a colleague.
      */}
      <nav aria-label="Settlement view" className="flex flex-wrap gap-2">
        {VIEW_TABS.map((tab) => (
          <Button
            key={tab.view}
            size="sm"
            variant={tab.view === active.view ? "default" : "outline"}
            render={<Link href={tab.href} />}
            {...(tab.view === active.view
              ? { "aria-current": "page" as const }
              : {})}
          >
            {tab.label}
          </Button>
        ))}
      </nav>

      {items.length > 0 && (
        <ul className="flex flex-col gap-4">
          {items.map((row) => (
            <li key={row.bookingId}>
              <SettlementCard row={row} />
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && (
        <EmptyState
          icon={HandCoinsIcon}
          title={
            view === "to-settle" ? "Nothing to settle" : "Nothing in this view"
          }
          description={
            view === "to-settle"
              ? "A rental appears here once the item is back and its payment has been verified."
              : "Try another view."
          }
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
