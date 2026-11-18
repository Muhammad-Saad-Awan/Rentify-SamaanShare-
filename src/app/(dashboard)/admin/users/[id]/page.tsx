import {
  BadgeCheckIcon,
  CalendarSearchIcon,
  ExternalLinkIcon,
  MailCheckIcon,
  PackageSearchIcon,
  ScaleIcon,
  ShieldIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminActionLog } from "@/components/admin/admin-action-log";
import { Fact, FactGrid } from "@/components/admin/fact-grid";
import { UserModerationPanel } from "@/components/admin/user-moderation-panel";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge as StatusLabel } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UserRole, UserStatus } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth/session";
import {
  getActiveAdminCount,
  getAdminUserDetail,
} from "@/lib/queries/admin-users";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/date";
import { formatCity } from "@/lib/utils/listing";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Member",
  description: "Account detail and moderation history.",
  robots: { index: false, follow: false },
};

interface AdminUserPageProps {
  params: Promise<{ id: string }>;
}

/**
 * One member, with everything needed to decide about them.
 *
 * The id is validated in `layout.tsx`, which runs before the first byte - see the note there. This
 * still handles `null`, because the layout's guarantee is about *ordering*, not about types, and a
 * page that assumed non-null would be one refactor away from a crash.
 *
 * NO IN-PAGE SUSPENSE. The whole page is one account's record and there is nothing worth showing
 * before the rest arrives; a skeleton around a name and a status would flash rather than help.
 */
export default async function AdminUserPage({ params }: AdminUserPageProps) {
  const admin = await requireAdmin();
  const { id } = await params;

  const [user, activeAdminCount] = await Promise.all([
    getAdminUserDetail(id),
    getActiveAdminCount(),
  ]);

  if (!user) {
    notFound();
  }

  const name = user.name?.trim() || "Unnamed member";

  return (
    <>
      <PageHeader
        title={name}
        description="Account detail, moderation controls and the full administrator history."
        actions={
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/admin/users" />}
          >
            Back to members
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-5 px-(--card-spacing)">
          <div className="flex flex-wrap items-center gap-2">
            <StatusLabel
              variant={
                user.status === UserStatus.ACTIVE ? "default" : "destructive"
              }
              label={USER_STATUS_LABELS[user.status]}
            />
            {user.role === UserRole.ADMIN && (
              <Badge variant="secondary">
                <ShieldIcon aria-hidden="true" />
                Administrator
              </Badge>
            )}
            {user.isVerified && (
              <Badge variant="success">
                <BadgeCheckIcon aria-hidden="true" />
                Identity verified
              </Badge>
            )}
            {user.isDeleted && <Badge variant="outline">Deleted</Badge>}
          </div>

          {/*
            email and phone, selected here and nowhere public. Two members can share a display name
            and a plausible address; the phone number is often what settles which account a report is
            actually about.
          */}
          <FactGrid columns={3}>
            <Fact label="Email">
              <span className="break-all">{user.email}</span>
            </Fact>
            <Fact label="Phone">{user.phone ?? "Not given"}</Fact>
            <Fact label="City">
              {user.city ? formatCity(user.city) : "Not set"}
            </Fact>
            <Fact label="Joined">{formatDate(user.createdAt)}</Fact>
            <Fact label="Email confirmation">
              <span className="flex flex-wrap items-center gap-x-1.5">
                <MailCheckIcon
                  className={
                    user.emailVerified
                      ? "text-foreground size-3.5 shrink-0"
                      : "text-muted-foreground size-3.5 shrink-0"
                  }
                  aria-hidden="true"
                />
                {user.emailVerified
                  ? `Confirmed ${formatDate(user.emailVerified)}`
                  : "Not confirmed"}
                <span className="text-muted-foreground text-xs italic">
                  — not proof of identity
                </span>
              </span>
            </Fact>
            <Fact label="Identity">
              {user.isVerified
                ? `Verified${user.verifiedAt ? ` ${formatDate(user.verifiedAt)}` : ""}${
                    user.verifiedBy?.name ? ` by ${user.verifiedBy.name}` : ""
                  }`
                : "Not verified"}
            </Fact>
          </FactGrid>

          {user.bio && (
            // A string, never HTML - it is user input.
            <p className="text-muted-foreground max-w-[65ch] border-l-2 pl-3 text-sm leading-relaxed whitespace-pre-line">
              {user.bio}
            </p>
          )}

          {/*
            The account's footprint, as five counts read at a glance. Reports against them are amber
            when there are any - the one count here that is a reason to look closer.
          */}
          <dl className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-lg border sm:grid-cols-5">
            <Count label="Listings" value={user.listingCount} />
            <Count label="Rentals as renter" value={user.bookingsAsRenter} />
            <Count label="Rentals as owner" value={user.bookingsAsOwner} />
            <Count label="Reports filed" value={user.reportsFiled} />
            <Count
              label="Reports against them"
              value={user.reportsAgainst}
              attention={user.reportsAgainst > 0}
              // Spans the row on a phone, so the odd fifth cell does not leave a hole in the grid.
              className="col-span-2 sm:col-span-1"
            />
          </dl>

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/users/${user.id}`} />}
            >
              <ExternalLinkIcon aria-hidden="true" />
              View public profile
            </Button>
            {/*
              This member's listings and bookings. The counts above say how many there are; without
              these the only way to reach them was a search by name, which is ambiguous for exactly
              the accounts a support question is about.
            */}
            {user.listingCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                render={<Link href={`/admin/listings?owner=${user.id}`} />}
              >
                <PackageSearchIcon aria-hidden="true" />
                Their listings
              </Button>
            )}
            {user.bookingsAsRenter + user.bookingsAsOwner > 0 && (
              <Button
                variant="ghost"
                size="sm"
                render={<Link href={`/admin/bookings?user=${user.id}`} />}
              >
                <CalendarSearchIcon aria-hidden="true" />
                Their bookings
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/admin/claims" />}
            >
              <ScaleIcon aria-hidden="true" />
              Claims queue
            </Button>
          </div>
        </div>
      </Card>

      {/*
        The controls beside the record of their use, on a wide screen. Deciding about an account is
        reading what has already been done to it, and stacked, the history sat a screen below the
        buttons it should inform.
      */}
      <div className="grid gap-4 lg:grid-cols-5 lg:items-start">
        <Card className="lg:col-span-2">
          <div className="flex flex-col gap-4 px-(--card-spacing)">
            <div className="flex flex-col gap-0.5">
              <h2 className="font-heading text-base font-semibold tracking-tight">
                Moderation
              </h2>
              <p className="text-muted-foreground text-xs">
                Every action is recorded against your name with the reason you
                give.
              </p>
            </div>
            <UserModerationPanel
              user={user}
              adminId={admin.id}
              activeAdminCount={activeAdminCount}
            />
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <div className="flex flex-col gap-4 px-(--card-spacing)">
            <h2 className="font-heading text-base font-semibold tracking-tight">
              Administrator history
            </h2>
            <AdminActionLog history={user.history} />
          </div>
        </Card>
      </div>
    </>
  );
}

/** The account status in sentence case, for the badge. */
const USER_STATUS_LABELS: Readonly<Record<UserStatus, string>> = {
  [UserStatus.ACTIVE]: "Active",
  [UserStatus.SUSPENDED]: "Suspended",
  [UserStatus.BANNED]: "Banned",
};

/** One count in the account's footprint strip. */
function Count({
  label,
  value,
  attention = false,
  className,
}: {
  label: string;
  value: number;
  attention?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0.5 px-3 py-2.5",
        attention ? "bg-warning-soft text-warning-soft-foreground" : "bg-card",
        className
      )}
    >
      <dt
        className={
          attention
            ? "flex items-center gap-1 text-xs font-medium"
            : "text-muted-foreground text-xs"
        }
      >
        {attention && (
          <TriangleAlertIcon className="size-3 shrink-0" aria-hidden="true" />
        )}
        {label}
      </dt>
      <dd className="font-heading text-xl font-bold tabular-nums">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}
