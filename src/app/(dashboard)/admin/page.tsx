import {
  ArrowRightIcon,
  BanknoteIcon,
  BarChart3Icon,
  CalendarSearchIcon,
  ChevronRightIcon,
  FlagIcon,
  HandCoinsIcon,
  IdCardIcon,
  PackageSearchIcon,
  ScaleIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AwaitingBadge } from "@/components/admin/attention";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { getAwaitingActionBookingCount } from "@/lib/queries/admin-bookings";
import { getPendingVerificationCount } from "@/lib/queries/admin-payments";
import { getOpenClaimCount } from "@/lib/queries/claims";
import { countPendingIdentityDocuments } from "@/lib/queries/identity-documents";
import { getPendingReportCount } from "@/lib/queries/reports";
import { cn } from "@/lib/utils/cn";

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
 * ONLY QUEUES WHERE A PERSON WAITS ON THE PLATFORM ARE COUNTED AS DECISIONS - reports, disputed
 * claims, recorded payments and CNIC submissions. Bookings awaiting a party are shown as context
 * rather than as work, because nobody here can act on them - see the note in
 * `queries/admin-bookings.ts` on why booking oversight is read-only. Settlements are linked but not
 * counted: there is no count query for them, and paging the queue to get one would cost a full read
 * on every visit to this page.
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
    <Suspense fallback={<DashboardPageSkeleton withStats cards={1} />}>
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
   *
   * The payment and CNIC counts are plain reads with the same predicate as their queues' default
   * views, so the number on a tile is the number of cards behind it.
   */
  const [
    pendingReports,
    claimsToDecide,
    paymentsToCheck,
    cnicsToReview,
    bookingsAwaiting,
  ] = await Promise.all([
    getPendingReportCount(),
    getOpenClaimCount(),
    getPendingVerificationCount(),
    countPendingIdentityDocuments(),
    getAwaitingActionBookingCount(),
  ]);

  const decisions =
    pendingReports + claimsToDecide + paymentsToCheck + cnicsToReview;

  return (
    <>
      {/*
        No "Restricted" badge here any more: `AdminHeader` in the layout carries it on every admin
        route, and two of them on this one page would read as two different claims.
      */}
      <PageHeader
        title="Admin"
        description="What is waiting on you first, then everything else."
        actions={
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/admin/analytics" />}
          >
            <BarChart3Icon aria-hidden="true" />
            Analytics
          </Button>
        }
      />

      <section
        aria-labelledby="waiting-heading"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-0.5">
          <h2
            id="waiting-heading"
            className="font-heading text-lg font-semibold tracking-tight"
          >
            {decisions === 0
              ? "Nothing is waiting on you"
              : decisions === 1
                ? "1 thing is waiting on you"
                : `${decisions} things are waiting on you`}
          </h2>
          <p className="text-muted-foreground text-sm">
            Each is a person waiting on the platform. Open a queue to decide.
          </p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QueueTile
            icon={FlagIcon}
            href="/admin/reports"
            title="Reports to decide"
            count={pendingReports}
            hint="A complaint about a listing, a member or a review."
            clearHint="The queue is clear."
          />
          <QueueTile
            icon={ScaleIcon}
            href="/admin/claims"
            title="Claims to decide"
            count={claimsToDecide}
            hint="A deposit is held pending your decision."
            clearHint="No disputed deposits."
          />
          <QueueTile
            icon={BanknoteIcon}
            href="/admin/payments"
            title="Payments to check"
            count={paymentsToCheck}
            hint="A renter recorded a payment to check against the account."
            clearHint="Nothing to reconcile."
          />
          <QueueTile
            icon={IdCardIcon}
            href="/admin/verifications"
            title="CNICs to review"
            count={cnicsToReview}
            hint="A member uploaded their CNIC to be checked."
            clearHint="No submissions waiting."
          />
        </ul>
      </section>

      <section aria-labelledby="tools-heading" className="flex flex-col gap-4">
        <h2
          id="tools-heading"
          className="font-heading text-lg font-semibold tracking-tight"
        >
          Look something up
        </h2>

        <Card className="py-0">
          <ul className="divide-y">
            <Destination
              icon={HandCoinsIcon}
              href="/admin/settlements"
              title="Settlements"
              description="Finished rentals to settle, and the payouts and deposit returns still to send."
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
              // Context, not a task. Named as such, so nobody goes looking for the button.
              context={
                bookingsAwaiting > 0
                  ? `${bookingsAwaiting.toLocaleString()} awaiting a party`
                  : undefined
              }
            />
          </ul>
        </Card>
      </section>
    </>
  );
}

interface QueueTileProps {
  icon: LucideIcon;
  href: string;
  title: string;
  count: number;
  /** What one item in the queue is, shown while anything is waiting. */
  hint: string;
  /** Shown instead when the queue is empty. */
  clearHint: string;
}

/**
 * One decision queue: how many are waiting, and the way in.
 *
 * A whole-tile link rather than a `StatCard` beside a separate list of links - the number and the
 * place to act on it were two screens of scroll apart. Amber edge and badge when anything waits, so
 * a row of four reads at a glance; the count is in the accessible name, so it does not depend on
 * the colour.
 */
function QueueTile({
  icon: Icon,
  href,
  title,
  count,
  hint,
  clearHint,
}: QueueTileProps) {
  const waiting = count > 0;

  return (
    <li className="min-w-0">
      <Link
        href={href}
        className={cn(
          "group bg-card focus-visible:ring-ring hover:bg-muted/40 flex h-full flex-col gap-3 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          waiting && "border-l-warning border-l-4"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {title}
          </span>
          {waiting && <AwaitingBadge label="Waiting" />}
        </div>

        <span className="font-heading text-3xl font-bold tracking-[-0.025em] tabular-nums">
          {count.toLocaleString()}
        </span>

        <span className="text-muted-foreground mt-auto flex items-end justify-between gap-2 text-xs leading-relaxed">
          {waiting ? hint : clearHint}
          <ArrowRightIcon
            className="text-foreground size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </Link>
    </li>
  );
}

interface DestinationProps {
  icon: LucideIcon;
  href: string;
  title: string;
  description: string;
  /**
   * Something to know rather than something to do - bookings waiting on their parties.
   *
   * Shown as a neutral outline badge, never the amber of the queues above: a badge that looks
   * identical for "two reports await your decision" and "two rentals are between two other people"
   * trains an administrator to ignore both.
   */
  context?: string | undefined;
}

/** One admin surface, with what it is for. */
function Destination({
  icon: Icon,
  href,
  title,
  description,
  context,
}: DestinationProps) {
  return (
    <li>
      <Link
        href={href}
        className="group hover:bg-muted/50 focus-visible:ring-ring flex items-start gap-3 px-(--card-spacing) py-3.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
      >
        <span
          className="bg-muted text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg border"
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {title}
            {context && <Badge variant="outline">{context}</Badge>}
          </span>
          <span className="text-muted-foreground text-xs leading-relaxed">
            {description}
          </span>
        </div>
        <ChevronRightIcon
          className="text-muted-foreground group-hover:text-foreground mt-2 size-4 shrink-0 transition-colors"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}
