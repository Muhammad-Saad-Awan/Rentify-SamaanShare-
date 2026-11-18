import {
  BanknoteIcon,
  CalendarCheckIcon,
  PackageIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { ActivityFeed } from "@/components/admin/activity-feed";
import { CityBarChart } from "@/components/admin/city-bar-chart";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import {
  getCityDistribution,
  getPlatformTotals,
  getRecentActivity,
} from "@/lib/queries/admin-analytics";
import { formatPKR } from "@/lib/utils/currency";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analytics",
  description: "Platform totals.",
  // The admin area should never appear in search results, even if a crawler somehow reaches it
  // while a session cookie is present.
  robots: { index: false, follow: false },
};

/**
 * Platform analytics.
 *
 * READ-ONLY, AND IT DOES NOT SWEEP. Nothing here escalates a claim or expires a request, for the
 * reason the booking queue gives: a screen whose numbers are used to judge the platform must not
 * change the platform by being opened. The one deliberate exception is on the admin home, where the
 * claims count comes from `getOpenClaimCount` - see the note there.
 *
 * EVERY FIGURE IS DEFINED WHERE IT IS SHOWN. "GMV" in particular does not mean what it usually means
 * here, because payment is offline and the platform has never seen the money - see the module note in
 * `queries/admin-analytics.ts`. A number on a dashboard gets quoted; an undefined one gets quoted
 * wrongly.
 */
export default async function AdminAnalyticsPage() {
  return (
    // In-page Suspense rather than a route-level loading.tsx - see the invariant in AGENTS.md. This
    // page runs three multi-query reads, so the boundary is genuinely reachable rather than
    // instantaneous.
    <Suspense fallback={<DashboardPageSkeleton withStats cards={3} />}>
      <Analytics />
    </Suspense>
  );
}

async function Analytics() {
  await requireAdmin();

  const [totals, cities, activity] = await Promise.all([
    getPlatformTotals(),
    getCityDistribution(),
    getRecentActivity(),
  ]);

  // One instant for the whole page, so two relative timestamps cannot contradict their order.
  const now = new Date();

  const { users, listings, bookings, money } = totals;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Platform totals, as recorded. Read-only, and nothing here changes state."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Members"
          value={users.total.toLocaleString()}
          icon={UsersIcon}
          hint={`${users.active.toLocaleString()} active, ${users.verified.toLocaleString()} identity-verified`}
        />
        <StatCard
          label="Live listings"
          value={listings.live.toLocaleString()}
          icon={PackageIcon}
          /*
            `live` comes from VISIBLE_LISTING_WHERE, so it also excludes listings whose owner is
            suspended - which is why it can be lower than `active`. The hint names both rather than
            leaving somebody to wonder which number the marketplace shows.
          */
          hint={`of ${listings.total.toLocaleString()} ever created — ${listings.active.toLocaleString()} are ACTIVE`}
        />
        <StatCard
          label="Rentals completed"
          value={bookings.completed.toLocaleString()}
          icon={CalendarCheckIcon}
          hint={`${bookings.live.toLocaleString()} out on rent now, ${bookings.pending.toLocaleString()} awaiting an owner`}
        />
        <StatCard
          label="Recorded rent"
          value={formatPKR(money.realisedGmv)}
          icon={BanknoteIcon}
          hint="Rentals that actually happened. Not revenue — see below"
        />
      </div>

      <Card>
        <div className="flex flex-col gap-3 px-(--card-spacing)">
          <h2 className="font-heading text-base font-semibold tracking-tight">
            Money
          </h2>

          {/*
            Each figure with its definition as a second <dd> - a paragraph is not allowed directly
            inside a <dl> group, and the definition belongs to the term as much as the number does.
          */}
          <dl className="bg-border grid gap-px overflow-hidden rounded-lg border sm:grid-cols-3">
            <MoneyFigure
              label="Recorded rent, realised"
              value={formatPKR(money.realisedGmv)}
              definition="Bookings that reached collection or completion."
            />
            <MoneyFigure
              label="Committed, not started"
              value={formatPKR(money.pipelineGmv)}
              definition="Approved or awaiting payment. Never added to the figure above."
            />
            <MoneyFigure
              label="Deposits at stake"
              value={formatPKR(money.depositsAtStake)}
              definition="Renters' deposits held by SamaanShare on rentals that started."
            />
          </dl>

          {/*
            THE PARAGRAPH THAT KEEPS THESE NUMBERS HONEST. The renter pays SamaanShare, but the
            commission is zero (COMMISSION_RATE_BPS): rent is passed on to the owner at settlement and
            the deposit goes back to the renter. "GMV" on a dashboard is normally read as revenue, and
            somebody will quote this to an investor or a renter - so what it is and is not is stated
            beside it rather than in a comment.
          */}
          <p className="text-muted-foreground max-w-[80ch] text-xs leading-relaxed">
            None of this is revenue. Renters pay SamaanShare, but no commission
            is taken today: rent is paid out to owners at settlement and
            deposits go back to renters, so these are amounts{" "}
            <em>recorded on bookings</em>, not earnings. Deposits are excluded
            from the rent figures because they are returned; requests still
            awaiting an owner are excluded because they are not yet a
            commitment.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="flex flex-col gap-2 px-(--card-spacing)">
            <h2 className="font-heading text-base font-semibold tracking-tight">
              Members by standing
            </h2>
            <Breakdown
              rows={[
                ["Active", users.active],
                ["Suspended", users.suspended],
                ["Banned", users.banned],
                ["Deleted themselves", users.deleted],
                ["Administrators", users.admins],
              ]}
            />
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-2 px-(--card-spacing)">
            <h2 className="font-heading text-base font-semibold tracking-tight">
              Listings by status
            </h2>
            <Breakdown
              rows={[
                ["Visible to the public", listings.live],
                ["ACTIVE", listings.active],
                ["Paused", listings.paused],
                ["Draft", listings.draft],
                ["Removed", listings.removed],
              ]}
            />
            {/*
              The gap between the first two rows is the supply moderation has taken out of the market
              - a suspended owner keeps their listings, and `VISIBLE_LISTING_WHERE` is what hides
              them. Worth naming, because otherwise the two numbers look like a bug.
            */}
            {listings.active > listings.live && (
              <p className="text-muted-foreground text-xs">
                {(listings.active - listings.live).toLocaleString()} ACTIVE{" "}
                {listings.active - listings.live === 1
                  ? "listing is"
                  : "listings are"}{" "}
                hidden because the owner is suspended, banned or deleted.
              </p>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex flex-col gap-2 px-(--card-spacing)">
            <h2 className="font-heading text-base font-semibold tracking-tight">
              Bookings by state
            </h2>
            <Breakdown
              rows={[
                ["Awaiting an owner", bookings.pending],
                ["Committed", bookings.pipeline],
                ["Out on rent", bookings.live],
                ["Completed", bookings.completed],
                ["Declined, cancelled or expired", bookings.failed],
              ]}
            />
            {/*
              The ratio, not just the count. A marketplace where most requests never become rentals is
              a specific and fixable problem, and it is invisible in a total.
            */}
            {bookings.total > 0 && (
              <p className="text-muted-foreground text-xs">
                {Math.round((bookings.failed / bookings.total) * 100)}% of all
                requests ended without a rental.
              </p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-4 px-(--card-spacing)">
          <h2 className="font-heading text-base font-semibold tracking-tight">
            By city
          </h2>

          {/*
            Two charts rather than two scales on one. Listings and rupees are different measures, and
            a second axis would let whoever picked the ranges decide where the lines cross - see the
            note in `CityBarChart`.
          */}
          <div className="grid gap-6 sm:grid-cols-2">
            <CityBarChart
              title="Live listings"
              caption="Visible on the marketplace right now."
              rows={cities.map((row) => ({
                city: row.city,
                value: row.liveListings,
                display: row.liveListings.toLocaleString(),
              }))}
            />
            <CityBarChart
              title="Recorded rent"
              caption="On rentals that actually happened."
              rows={cities.map((row) => ({
                city: row.city,
                value: row.realisedGmv,
                display: formatPKR(row.realisedGmv),
              }))}
            />
          </div>

          {/*
            The city list comes from the data, not from the configured launch cities - so a city that
            appears in the database ahead of `PAKISTANI_CITIES` shows up here rather than being
            silently dropped by the screen reporting the expansion.
          */}
          <p className="text-muted-foreground text-xs">
            Ordered by live supply. Cities appear as soon as they have listings
            or rentals, whether or not they are a configured launch city.
          </p>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 px-(--card-spacing)">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-heading text-base font-semibold tracking-tight">
              Recent activity
            </h2>
            <Link
              href="/admin"
              className="text-xs font-medium underline underline-offset-4"
            >
              What needs attention
            </Link>
          </div>
          <ActivityFeed activity={activity} now={now} />
        </div>
      </Card>
    </>
  );
}

/**
 * A labelled count list.
 *
 * Deliberately not bars. These are parts of a whole where the labels carry the meaning and the
 * numbers are small in count - a bar chart of five statuses adds decoration and takes the figures
 * further from their labels. The city charts earn bars because comparing magnitudes across places is
 * the actual question there.
 */
function Breakdown({ rows }: { rows: readonly [string, number][] }) {
  return (
    <dl className="flex flex-col divide-y text-sm">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-2 py-1.5 first:pt-0 last:pb-0"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-heading font-semibold tabular-nums">
            {value.toLocaleString()}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** One money figure: what it is, the amount, and what it does and does not include. */
function MoneyFigure({
  label,
  value,
  definition,
}: {
  label: string;
  value: string;
  definition: string;
}) {
  return (
    <div className="bg-card flex flex-col gap-1 px-4 py-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-heading text-xl font-bold tracking-tight tabular-nums">
        {value}
      </dd>
      <dd className="text-muted-foreground text-xs leading-relaxed">
        {definition}
      </dd>
    </div>
  );
}
