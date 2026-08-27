import {
  BarChart3Icon,
  CalendarSearchIcon,
  FlagIcon,
  PackageSearchIcon,
  ScaleIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { getAwaitingActionBookingCount } from "@/lib/queries/admin-bookings";
import { getOpenClaimCount } from "@/lib/queries/claims";
import { getPendingReportCount } from "@/lib/queries/reports";

import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin",
  description: "SamaanShare administration.",
  // The admin area should never appear in search results, even if a crawler
  // somehow reaches it while a session cookie is present.
  robots: { index: false, follow: false },
};

/**
 * Admin landing page.
 *
 * WHAT NEEDS A DECISION, NOT WHAT THE NUMBERS ARE. The two are different jobs and this screen is
 * deliberately only the first: totals, money and trends live at `/admin/analytics`. A landing page
 * that opens with a growth chart buries the two reports waiting for somebody, and an administrator
 * signing in wants to know whether anything is owed a decision before anything else.
 *
 * ONLY REPORTS AND CLAIMS ARE COUNTED AS DECISIONS. Both are queues where a person is waiting on the
 * platform. Bookings awaiting a party are shown as context rather than as work, because nobody here
 * can act on them - see the note in `queries/admin-bookings.ts` on why booking oversight is
 * read-only.
 *
 * THE SKELETON IS IN-PAGE, NOT A ROUTE-LEVEL `loading.tsx`. There used to be one here, and it broke
 * a route several segments below it: a `loading.tsx` covers its own segment *and everything nested
 * under it*, so `admin/users/[id]/layout.tsx` was rendering inside that boundary. Next had already
 * flushed the shell with a 200 by the time the layout called `notFound()`, so an unknown member id
 * returned 200 with a 404 page painted over it - a soft 404, and the exact failure AGENTS.md
 * records from three earlier routes.
 */
export default function AdminPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton withStats cards={2} />}>
      <AdminHome />
    </Suspense>
  );
}

async function AdminHome() {
  await requireAdmin();

  /**
   * `getOpenClaimCount` escalates overdue claims before counting, and that is the one sweep this
   * screen keeps.
   *
   * It looks like a contradiction of the rule stated in `queries/admin-bookings.ts` - that an
   * oversight screen must not change what it reports on - and it is not, because the two sweeps are
   * different things. Expiring a stale booking request is the parties' business: it releases their
   * calendar and notifies them, and an administrator's lookup should not do it. Escalating a claim
   * whose response window has lapsed moves it into *this* queue, and a count taken without it is
   * simply wrong - it would hide claims that nobody is going to decide because nobody was told they
   * were ready.
   */
  const [pendingReports, claimsToDecide, bookingsAwaiting] = await Promise.all([
    getPendingReportCount(),
    getOpenClaimCount(),
    getAwaitingActionBookingCount(),
  ]);

  const decisions = pendingReports + claimsToDecide;

  return (
    <>
      {/*
        No "Restricted" badge here any more: `AdminHeader` in the layout carries it on every admin
        route, and two of them on this one page would read as two different claims.
      */}
      <PageHeader
        title="Admin"
        description="Moderation and platform administration."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Reports to decide"
          value={pendingReports.toLocaleString()}
          icon={FlagIcon}
          hint={
            pendingReports === 0
              ? "The queue is clear"
              : "Someone reported a listing, member or review"
          }
        />
        <StatCard
          label="Claims to decide"
          value={claimsToDecide.toLocaleString()}
          icon={ScaleIcon}
          hint={
            claimsToDecide === 0
              ? "No disputed deposits"
              : "A deposit is held pending your decision"
          }
        />
        <StatCard
          label="Bookings awaiting a party"
          value={bookingsAwaiting.toLocaleString()}
          icon={CalendarSearchIcon}
          // Context, not a task. Named as such, so nobody goes looking for the button.
          hint="Waiting on a renter or owner, not on you"
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 px-(--card-spacing)">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-base font-medium">
              {decisions === 0
                ? "Nothing is waiting on you"
                : decisions === 1
                  ? "1 thing is waiting on you"
                  : `${decisions} things are waiting on you`}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/admin/analytics" />}
            >
              <BarChart3Icon aria-hidden="true" />
              Analytics
            </Button>
          </div>

          <ul className="flex flex-col gap-2">
            <Destination
              icon={FlagIcon}
              href="/admin/reports"
              title="Reports"
              description="Decide a complaint about a listing, a member or a review. Every decision and its consequence land in one transaction."
              count={pendingReports}
            />
            <Destination
              icon={ScaleIcon}
              href="/admin/claims"
              title="Deposit claims"
              description="Settle a damage claim against a security deposit, with both sides' photographs and the return condition record."
              count={claimsToDecide}
            />
            <Destination
              icon={UsersIcon}
              href="/admin/users"
              title="Members"
              description="Search for an account to verify, suspend, ban or change the role of. Nothing is listed until you search."
            />
            <Destination
              icon={PackageSearchIcon}
              href="/admin/listings"
              title="Listings"
              description="Every listing, including removed ones. Take one down, put one back, or correct its wording."
            />
            <Destination
              icon={CalendarSearchIcon}
              href="/admin/bookings"
              title="Bookings"
              description="Look up a rental and read everything recorded about it. Read-only — each step belongs to the renter or the owner."
              count={bookingsAwaiting}
              countIsContext
            />
          </ul>
        </div>
      </Card>
    </>
  );
}

interface DestinationProps {
  icon: LucideIcon;
  href: string;
  title: string;
  description: string;
  count?: number;
  /**
   * Whether the count is something to know rather than something to do.
   *
   * A badge that looks identical for "two reports await your decision" and "two rentals are between
   * two other people" trains an administrator to ignore both.
   */
  countIsContext?: boolean;
}

/** One admin surface, with what it is for and whether anything is waiting there. */
function Destination({
  icon: Icon,
  href,
  title,
  description,
  count,
  countIsContext,
}: DestinationProps) {
  return (
    <li>
      <Link
        href={href}
        className="hover:bg-muted/50 flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors"
      >
        <Icon
          className="text-muted-foreground mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-medium">{title}</span>
          <span className="text-muted-foreground text-xs leading-relaxed">
            {description}
          </span>
        </div>
        {count !== undefined && count > 0 && (
          <Badge variant={countIsContext ? "outline" : "destructive"}>
            {count}
          </Badge>
        )}
      </Link>
    </li>
  );
}
