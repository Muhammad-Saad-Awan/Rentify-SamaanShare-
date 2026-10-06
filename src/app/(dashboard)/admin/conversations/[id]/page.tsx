import { ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminConversationReader } from "@/components/chat/admin-conversation-reader";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { adminConversationGrounds } from "@/lib/chat/admin-access";
import { CLAIM_STATUS_LABELS } from "@/lib/claims/rules";
import {
  getAdminConversationHeader,
  getAdminGroundInputs,
} from "@/lib/queries/chat";
import { getDisplayName } from "@/lib/utils/user";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conversation",
  robots: { index: false, follow: false },
};

interface AdminConversationPageProps {
  params: Promise<{ id: string }>;
}

/**
 * The administrator's view of a conversation: who it is between, the grounds that exist for reading
 * it, and the reader. No message is in this render - they arrive only through the logged action.
 */
export default async function AdminConversationPage({
  params,
}: AdminConversationPageProps) {
  await requireAdmin();
  const { id } = await params;

  const [header, inputs] = await Promise.all([
    getAdminConversationHeader(id),
    getAdminGroundInputs(id),
  ]);

  if (!header || !inputs) {
    // Unreachable in practice - the layout has already checked.
    notFound();
  }

  const renterName = getDisplayName(header.renter);
  const ownerName = getDisplayName(header.owner);
  const nameOf = (userId: string) =>
    userId === header.renter.id
      ? renterName
      : userId === header.owner.id
        ? ownerName
        : "a member";

  const claims = new Map(inputs.claims.map((claim) => [claim.id, claim]));
  const reports = new Map(inputs.reports.map((report) => [report.id, report]));

  const grounds = adminConversationGrounds({
    renterId: header.renter.id,
    ownerId: header.owner.id,
    claims: inputs.claims,
    handovers: inputs.handovers,
    reports: inputs.reports,
  }).map((ground) => {
    switch (ground.kind) {
      case "claim": {
        const claim = claims.get(ground.id);

        return {
          ...ground,
          label: `Deposit claim against ${nameOf(ground.subjectId)}${claim ? ` (${CLAIM_STATUS_LABELS[claim.status]})` : ""}`,
        };
      }
      case "dispute":
        return {
          ...ground,
          label: `Handover record by ${nameOf(ground.subjectId)} that the other side disputed`,
        };
      case "report": {
        const report = reports.get(ground.id);

        return {
          ...ground,
          label: `Report by ${report ? nameOf(report.reporterId) : "a member"} against ${nameOf(ground.subjectId)}${report ? ` (${report.status.toLowerCase()})` : ""}`,
        };
      }
    }
  });

  return (
    <>
      <PageHeader
        title={header.listing.title}
        description={`Conversation between ${renterName} (renter) and ${ownerName} (owner). Read-only.`}
        actions={
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/admin/users/${header.renter.id}`} />}
          >
            Renter&apos;s history
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-4 px-(--card-spacing)">
          <p className="text-muted-foreground flex items-start gap-2 text-xs leading-relaxed">
            <ShieldCheckIcon
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            Private messages between two members. Reading them is recorded on
            the history of the member the matter concerns, with your reason -
            once for each page you load.
          </p>

          <AdminConversationReader
            conversationId={header.id}
            listingId={header.listing.id}
            renter={{ id: header.renter.id, name: renterName }}
            owner={{ id: header.owner.id, name: ownerName }}
            grounds={grounds}
          />
        </div>
      </Card>
    </>
  );
}
