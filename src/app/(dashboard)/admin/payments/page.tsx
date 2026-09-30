import { BanknoteIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { PaymentCard } from "@/components/admin/payment-card";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { COMMISSION_RATE_BPS } from "@/config/commission";
import { PaymentStatus } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth/session";
import { getPaymentQueue } from "@/lib/queries/admin-payments";
import { parsePageParam } from "@/lib/utils/pagination";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Payments",
  description: "Payments awaiting verification.",
  robots: { index: false, follow: false },
};

/**
 * The views of the queue.
 *
 * `PENDING_VERIFICATION` is the default and the only one that needs deciding. The others exist so
 * a decision can be looked up afterwards, and so a renter on the phone about a rejection can be
 * found without paging through everything.
 *
 * `AWAITING_CONFIRMATION` is here under a plainer name: those are bookings where a method was
 * chosen and nobody has recorded paying yet. They need no action, but an administrator asking
 * "where is that payment" needs somewhere to see that it never arrived.
 */
const STATUS_TABS = [
  {
    status: PaymentStatus.PENDING_VERIFICATION,
    label: "To check",
    href: "/admin/payments",
  },
  {
    status: PaymentStatus.AWAITING_CONFIRMATION,
    label: "Not yet recorded",
    href: "/admin/payments?status=awaiting",
  },
  {
    status: PaymentStatus.COMPLETED,
    label: "Verified",
    href: "/admin/payments?status=verified",
  },
  {
    status: PaymentStatus.REJECTED,
    label: "Not found",
    href: "/admin/payments?status=rejected",
  },
  {
    status: PaymentStatus.REFUNDED,
    label: "Refunded",
    href: "/admin/payments?status=refunded",
  },
] as const;

/** URL value to status. Unknown values fall back to the queue rather than erroring. */
function parseStatusParam(raw: string | string[] | undefined): PaymentStatus {
  const value = Array.isArray(raw) ? raw[0] : raw;

  switch (value) {
    case "awaiting":
      return PaymentStatus.AWAITING_CONFIRMATION;
    case "verified":
      return PaymentStatus.COMPLETED;
    case "rejected":
      return PaymentStatus.REJECTED;
    case "refunded":
      return PaymentStatus.REFUNDED;
    default:
      return PaymentStatus.PENDING_VERIFICATION;
  }
}

interface PaymentsPageProps {
  searchParams: Promise<{
    page?: string | string[];
    status?: string | string[];
  }>;
}

/**
 * The payment verification queue.
 *
 * `requireAdmin()` again despite `admin/layout.tsx` already doing it, for the reason stated
 * there: a client-side navigation can reuse a layout without re-running it.
 */
export default async function PaymentsPage({
  searchParams,
}: PaymentsPageProps) {
  const { page: rawPage, status: rawStatus } = await searchParams;

  return (
    // In-page Suspense rather than a route-level loading.tsx - see the invariant in AGENTS.md.
    <Suspense
      key={`${String(rawStatus ?? "pending")}:${String(rawPage ?? 1)}`}
      fallback={<DashboardPageSkeleton cards={3} />}
    >
      <PaymentQueue rawPage={rawPage} rawStatus={rawStatus} />
    </Suspense>
  );
}

interface PaymentQueueProps {
  rawPage: string | string[] | undefined;
  rawStatus: string | string[] | undefined;
}

async function PaymentQueue({ rawPage, rawStatus }: PaymentQueueProps) {
  await requireAdmin();

  const status = parseStatusParam(rawStatus);
  const active =
    STATUS_TABS.find((tab) => tab.status === status) ?? STATUS_TABS[0];

  const { items, total, page, totalPages } = await getPaymentQueue({
    status,
    /**
     * The rate an unverified payment WOULD freeze at, read here rather than in the query so the
     * query stays free of configuration. A payment already verified carries its own frozen rate
     * and ignores this - see the note on `AdminPaymentSummary.rateBps`.
     */
    configuredRateBps: COMMISSION_RATE_BPS,
    page: parsePageParam(rawPage),
  });

  return (
    <>
      <PageHeader
        title="Payments"
        description={
          status === PaymentStatus.PENDING_VERIFICATION
            ? total === 0
              ? "Nothing is waiting to be checked."
              : `${total === 1 ? "1 payment" : `${total} payments`} to check against the account, oldest first.`
            : `${total === 1 ? "1 payment" : `${total} payments`} in this view.`
        }
      />

      {/*
        Links rather than a client-side filter, matching the claims and reports queues: each view
        stays shareable, which for a queue means a payment can be handed to a colleague.
      */}
      <nav aria-label="Payment status" className="flex flex-wrap gap-2">
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
          {items.map((payment) => (
            <li key={payment.paymentId}>
              <PaymentCard payment={payment} />
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && (
        <EmptyState
          icon={BanknoteIcon}
          title={
            status === PaymentStatus.PENDING_VERIFICATION
              ? "Nothing to check"
              : "Nothing in this view"
          }
          description={
            status === PaymentStatus.PENDING_VERIFICATION
              ? "When a renter records a payment, it appears here to be checked against the account."
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
