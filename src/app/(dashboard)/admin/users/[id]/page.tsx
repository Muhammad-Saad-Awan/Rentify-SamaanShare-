import { BadgeCheckIcon, MailCheckIcon, ScaleIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminActionLog } from "@/components/admin/admin-action-log";
import { UserModerationPanel } from "@/components/admin/user-moderation-panel";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UserRole, UserStatus } from "@/generated/prisma/enums";
import { requireAdmin } from "@/lib/auth/session";
import {
  getActiveAdminCount,
  getAdminUserDetail,
} from "@/lib/queries/admin-users";
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
        <div className="flex flex-col gap-3 px-(--card-spacing)">
          <div className="flex flex-wrap items-center gap-2">
            {user.role === UserRole.ADMIN && (
              <Badge variant="secondary">Administrator</Badge>
            )}
            <Badge
              variant={
                user.status === UserStatus.ACTIVE ? "outline" : "destructive"
              }
            >
              {user.status.toLowerCase()}
            </Badge>
            {user.isVerified && (
              <Badge variant="secondary">
                <BadgeCheckIcon className="size-3" aria-hidden="true" />
                Verified
              </Badge>
            )}
            {user.isDeleted && <Badge variant="outline">deleted</Badge>}
          </div>

          {/*
            email and phone, selected here and nowhere public. Two members can share a display name
            and a plausible address; the phone number is often what settles which account a report is
            actually about.
          */}
          <dl className="text-muted-foreground grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            <div>
              <dt className="inline font-medium">Email: </dt>
              <dd className="inline break-all">{user.email}</dd>
            </div>
            {user.phone && (
              <div>
                <dt className="inline font-medium">Phone: </dt>
                <dd className="inline">{user.phone}</dd>
              </div>
            )}
            {user.city && (
              <div>
                <dt className="inline font-medium">City: </dt>
                <dd className="inline">{formatCity(user.city)}</dd>
              </div>
            )}
            <div>
              <dt className="inline font-medium">Joined: </dt>
              <dd className="inline">{formatDate(user.createdAt)}</dd>
            </div>
          </dl>

          <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
            <li className="flex items-center gap-2">
              <MailCheckIcon
                className={
                  user.emailVerified
                    ? "size-3.5 shrink-0 text-emerald-600"
                    : "size-3.5 shrink-0"
                }
                aria-hidden="true"
              />
              {user.emailVerified
                ? `Email confirmed ${formatDate(user.emailVerified)}`
                : "Email not confirmed"}
              <span className="italic">— not proof of identity</span>
            </li>
            <li>
              {user.isVerified
                ? `Identity verified${user.verifiedAt ? ` ${formatDate(user.verifiedAt)}` : ""}${
                    user.verifiedBy?.name ? ` by ${user.verifiedBy.name}` : ""
                  }`
                : "Identity not verified"}
            </li>
          </ul>

          {user.bio && (
            // A string, never HTML - it is user input.
            <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
              {user.bio}
            </p>
          )}

          <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>{user.listingCount} listings</span>
            <span>{user.bookingsAsRenter} rentals as renter</span>
            <span>{user.bookingsAsOwner} as owner</span>
            <span>{user.reportsFiled} reports filed</span>
            <span
              className={
                user.reportsAgainst > 0 ? "text-destructive font-medium" : ""
              }
            >
              {user.reportsAgainst} reports against them
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/users/${user.id}`} />}
            >
              View public profile
            </Button>
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

      <Card>
        <div className="flex flex-col gap-3 px-(--card-spacing)">
          <h2 className="font-heading text-base font-medium">Moderation</h2>
          <UserModerationPanel
            user={user}
            adminId={admin.id}
            activeAdminCount={activeAdminCount}
          />
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 px-(--card-spacing)">
          <h2 className="font-heading text-base font-medium">
            Administrator history
          </h2>
          <AdminActionLog history={user.history} />
        </div>
      </Card>
    </>
  );
}
