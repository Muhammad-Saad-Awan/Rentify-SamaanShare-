import { LockIcon } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conversations",
  robots: { index: false, follow: false },
};

/**
 * Deliberately not a list.
 *
 * Members' conversations are private, and being an administrator is not a reason to browse them. A
 * conversation is opened from the matter that justifies reading it - a deposit claim or a disputed
 * handover on a booking, or a report between the two members - and every read is logged. This page
 * exists so the breadcrumb above a conversation leads somewhere that says so.
 */
export default async function AdminConversationsPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader
        title="Conversations"
        description="Private messages between members. Read only on stated grounds."
      />

      <Card>
        <div className="flex flex-col gap-3 px-(--card-spacing)">
          <p className="flex items-center gap-2 text-sm font-medium">
            <LockIcon className="size-4" aria-hidden="true" />
            There is no conversation list, by design.
          </p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Open a conversation from the booking or the member report it
            concerns. You can read it only when there is a deposit claim, a
            disputed handover, or an open or resolved report between the two
            members. You will be asked which of those you are looking into and
            why, and every page you read is recorded on that member&apos;s
            history.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              render={<Link href="/admin/claims" />}
            >
              Claims queue
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={<Link href="/admin/bookings" />}
            >
              Bookings
            </Button>
            <Button
              size="sm"
              variant="outline"
              render={<Link href="/admin/reports" />}
            >
              Reports
            </Button>
          </div>
        </div>
      </Card>
    </>
  );
}
