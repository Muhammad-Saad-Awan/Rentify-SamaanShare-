import { IdCardIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { IdentityDocumentCard } from "@/components/admin/identity-document-card";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { IdentityDocumentStatus } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth/session";
import { getIdentityDocuments } from "@/lib/queries/identity-documents";
import { parsePageParam } from "@/lib/utils/pagination";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Identity verifications",
  description: "CNIC submissions awaiting review.",
  robots: { index: false, follow: false },
};

const STATUS_TABS = [
  {
    status: IdentityDocumentStatus.PENDING,
    label: "Awaiting review",
    href: "/admin/verifications",
  },
  {
    status: IdentityDocumentStatus.APPROVED,
    label: "Approved",
    href: "/admin/verifications?status=approved",
  },
  {
    status: IdentityDocumentStatus.REJECTED,
    label: "Rejected",
    href: "/admin/verifications?status=rejected",
  },
] as const;

interface VerificationsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The CNIC review queue.
 *
 * In-page Suspense rather than a route-level `loading.tsx` - see the invariant in AGENTS.md - keyed
 * on the view so the skeleton reappears between tabs and pages.
 */
export default async function VerificationsPage({
  searchParams,
}: VerificationsPageProps) {
  const { page: rawPage, status: rawStatus } = await searchParams;

  return (
    <Suspense
      key={`${String(rawStatus ?? "pending")}:${String(rawPage ?? 1)}`}
      fallback={<DashboardPageSkeleton cards={3} />}
    >
      <VerificationQueue rawPage={rawPage} rawStatus={rawStatus} />
    </Suspense>
  );
}

interface VerificationQueueProps {
  rawPage: string | string[] | undefined;
  rawStatus: string | string[] | undefined;
}

async function VerificationQueue({
  rawPage,
  rawStatus,
}: VerificationQueueProps) {
  const admin = await requireAdmin();

  const status = parseStatusParam(rawStatus);
  const active =
    STATUS_TABS.find((tab) => tab.status === status) ?? STATUS_TABS[0];

  const { items, total, page, totalPages } = await getIdentityDocuments({
    status,
    page: parsePageParam(rawPage),
  });

  return (
    <>
      <PageHeader
        title="Identity verifications"
        description={
          status === IdentityDocumentStatus.PENDING
            ? total === 0
              ? "Nothing is waiting for review."
              : `${total === 1 ? "1 CNIC" : `${total} CNICs`} awaiting review, oldest first. Compare the number, the photo and the account before deciding.`
            : `${total === 1 ? "1 CNIC" : `${total} CNICs`} in this view.`
        }
      />

      <nav aria-label="Verification status" className="flex flex-wrap gap-2">
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
          {items.map((document) => (
            <li key={document.id}>
              <IdentityDocumentCard document={document} adminId={admin.id} />
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && (
        <EmptyState
          icon={IdCardIcon}
          title={total === 0 ? "Nothing here" : "No submissions on this page"}
          description={
            total === 0
              ? status === IdentityDocumentStatus.PENDING
                ? "CNICs arrive here when members upload them from their profile. An empty queue is the normal state."
                : "No submissions are in this state yet."
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

/** The `?status=` parameter, or pending. A filter, not an identifier, so it falls back rather than 404s. */
function parseStatusParam(
  raw: string | string[] | undefined
): IdentityDocumentStatus {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.toLowerCase();

  switch (value) {
    case "approved":
      return IdentityDocumentStatus.APPROVED;
    case "rejected":
      return IdentityDocumentStatus.REJECTED;
    default:
      return IdentityDocumentStatus.PENDING;
  }
}
