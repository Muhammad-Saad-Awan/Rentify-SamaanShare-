import { ScaleIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { ClaimCard } from "@/components/admin/claim-card";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { ClaimStatus } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth/session";
import { getClaims } from "@/lib/queries/claims";
import { parsePageParam } from "@/lib/utils/pagination";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deposit claims",
  description: "Claims awaiting a decision.",
  robots: { index: false, follow: false },
};

/**
 * The views of the queue.
 *
 * `DISPUTED` is the default and the only one that needs deciding. The others exist so a decision can
 * be looked up afterwards - a claim both parties settled between themselves never reaches an
 * administrator at all, and being unable to see that it happened would make the record incomplete.
 */
const STATUS_TABS = [
  {
    status: ClaimStatus.DISPUTED,
    label: "To decide",
    href: "/admin/claims",
  },
  {
    status: ClaimStatus.OPEN,
    label: "With the renter",
    href: "/admin/claims?status=open",
  },
  {
    status: ClaimStatus.RESOLVED,
    label: "Decided",
    href: "/admin/claims?status=resolved",
  },
  {
    status: ClaimStatus.ACCEPTED,
    label: "Settled between parties",
    href: "/admin/claims?status=accepted",
  },
] as const;

interface ClaimsPageProps {
  searchParams: Promise<{
    page?: string | string[];
    status?: string | string[];
  }>;
}

/**
 * The deposit claim queue.
 *
 * `requireAdmin()` again despite `admin/layout.tsx` already doing it, for the reason stated there:
 * a client-side navigation can reuse a layout without re-running it.
 */
export default async function ClaimsPage({ searchParams }: ClaimsPageProps) {
  const { page: rawPage, status: rawStatus } = await searchParams;

  return (
    // In-page Suspense rather than a route-level loading.tsx - see the invariant in AGENTS.md.
    <Suspense
      key={`${String(rawStatus ?? "disputed")}:${String(rawPage ?? 1)}`}
      fallback={<DashboardPageSkeleton cards={3} />}
    >
      <ClaimQueue rawPage={rawPage} rawStatus={rawStatus} />
    </Suspense>
  );
}

interface ClaimQueueProps {
  rawPage: string | string[] | undefined;
  rawStatus: string | string[] | undefined;
}

async function ClaimQueue({ rawPage, rawStatus }: ClaimQueueProps) {
  await requireAdmin();

  const status = parseStatusParam(rawStatus);
  const active =
    STATUS_TABS.find((tab) => tab.status === status) ?? STATUS_TABS[0];

  const { items, total, page, totalPages } = await getClaims({
    status,
    page: parsePageParam(rawPage),
  });

  return (
    <>
      <PageHeader
        title="Deposit claims"
        description={
          status === ClaimStatus.DISPUTED
            ? total === 0
              ? "Nothing is waiting for a decision."
              : `${total === 1 ? "1 claim" : `${total} claims`} awaiting a decision, oldest first.`
            : `${total === 1 ? "1 claim" : `${total} claims`} in this view.`
        }
      />

      {/*
        Links rather than a client-side filter, matching the reports queue: each view stays
        shareable, which for a queue means a claim can be handed to a colleague.
      */}
      <nav aria-label="Claim status" className="flex flex-wrap gap-2">
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
          {items.map((claim) => (
            <li key={claim.id}>
              <ClaimCard claim={claim} />
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && (
        <EmptyState
          icon={ScaleIcon}
          title={total === 0 ? "Nothing here" : "No claims on this page"}
          description={
            total === 0
              ? status === ClaimStatus.DISPUTED
                ? "Claims arrive here when a renter disputes one, or when they let the response window pass. An empty queue is the normal state."
                : "No claims are in this state yet."
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
 * The `?status=` parameter, or disputed.
 *
 * Falls back rather than 404s on an unrecognised value: this is a filter on a queue, not an
 * identifier, and a mistyped one should show the default view rather than an error page.
 */
function parseStatusParam(raw: string | string[] | undefined): ClaimStatus {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.toLowerCase();

  switch (value) {
    case "open":
      return ClaimStatus.OPEN;
    case "resolved":
      return ClaimStatus.RESOLVED;
    case "accepted":
      return ClaimStatus.ACCEPTED;
    case "withdrawn":
      return ClaimStatus.WITHDRAWN;
    default:
      return ClaimStatus.DISPUTED;
  }
}
