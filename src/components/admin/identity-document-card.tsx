"use client";

import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { reviewIdentityDocument } from "@/actions/identity-documents";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { IdentityDocumentStatus } from "@/generated/prisma/enums";
import { formatDate, formatDateTime } from "@/lib/utils/date";
import { formatCity } from "@/lib/utils/listing";
import {
  REJECTION_REASON_MAX_LENGTH,
  REJECTION_REASON_MIN_LENGTH,
} from "@/lib/validations/identity";

import type { AdminIdentityDocumentSummary } from "@/lib/queries/identity-documents";

interface IdentityDocumentCardProps {
  document: AdminIdentityDocumentSummary;
  /** The signed-in admin, so the card does not offer a decision about their own CNIC. */
  adminId: string;
}

/**
 * One CNIC submission in the review queue.
 *
 * The images load from `/api/admin/identity-documents`, never from Cloudinary directly - the browser
 * only ever sees this app's own URL, and each load re-checks the admin session. `unoptimized`-style
 * plain `<img>` on purpose: routing an identity document through the image optimizer would cache it.
 *
 * Shown beside the account details an administrator compares it against: the name the member gave,
 * when they joined and where they say they live.
 */
function IdentityDocumentCard({
  document,
  adminId,
}: IdentityDocumentCardProps) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<"approve" | "reject" | null>(null);

  const isSelf = document.user.id === adminId;
  const isPending = document.status === IdentityDocumentStatus.PENDING;

  async function decide(decision: "approve" | "reject") {
    setPending(decision);

    const result = await reviewIdentityDocument({
      userId: document.user.id,
      decision,
      ...(decision === "reject" ? { reason } : {}),
    });

    setPending(null);

    if (!result.success) {
      toast.error(result.error);

      return;
    }

    toast.success(
      decision === "approve"
        ? "CNIC approved. The member is now verified."
        : "CNIC rejected. The member has been asked to upload it again."
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-5 px-(--card-spacing)">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <Link
              href={`/admin/users/${document.user.id}`}
              className="font-heading decoration-foreground/30 text-base leading-snug font-semibold underline-offset-4 hover:underline"
            >
              {document.user.name ?? document.user.email}
            </Link>
            <span className="text-muted-foreground text-sm">
              {document.user.email}
            </span>
          </div>

          {document.status === IdentityDocumentStatus.PENDING && (
            <StatusBadge variant="secondary" label="Awaiting review" />
          )}
          {document.status === IdentityDocumentStatus.APPROVED && (
            <StatusBadge variant="default" label="Approved" />
          )}
          {document.status === IdentityDocumentStatus.REJECTED && (
            <StatusBadge variant="destructive" label="Rejected" />
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-4">
          <div className="col-span-2 flex flex-col gap-0.5 sm:col-span-1">
            <dt className="text-muted-foreground text-xs">CNIC number</dt>
            <dd className="font-mono font-medium tracking-wide">
              {document.cnicNumber}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">Submitted</dt>
            <dd>{formatDateTime(document.submittedAt)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">Member since</dt>
            <dd>{formatDate(document.user.createdAt)}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-muted-foreground text-xs">City</dt>
            <dd>
              {document.user.city ? formatCity(document.user.city) : "Not set"}
            </dd>
          </div>
        </dl>

        <div className="grid gap-4 sm:grid-cols-2">
          {(["front", "back"] as const).map((side) => {
            const src = `/api/admin/identity-documents/${document.user.id}/${side}`;

            return (
              <figure key={side} className="flex flex-col gap-2">
                <figcaption className="text-sm font-medium capitalize">
                  {side}
                </figcaption>
                <a
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-muted focus-visible:ring-ring block overflow-hidden rounded-lg border outline-none focus-visible:ring-2"
                >
                  {/* An admin-only route, deliberately not `next/image` - see the note above. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`${side === "front" ? "Front" : "Back"} of the member's CNIC, opens full size`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="aspect-[1.586] w-full object-contain"
                  />
                </a>
              </figure>
            );
          })}
        </div>

        {document.status === IdentityDocumentStatus.REJECTED &&
          document.rejectionReason && (
            <p className="text-muted-foreground border-l-2 pl-3 text-sm leading-relaxed">
              {document.rejectionReason}
            </p>
          )}

        {!isPending && document.reviewedAt && (
          <p className="text-muted-foreground text-xs">
            {`Reviewed ${formatDateTime(document.reviewedAt)}${
              document.reviewedByName ? ` by ${document.reviewedByName}` : ""
            }.`}
          </p>
        )}

        {isPending && isSelf && (
          <p className="text-muted-foreground text-sm">
            This is your own CNIC. Another administrator has to review it.
          </p>
        )}

        {isPending && !isSelf && !rejecting && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              disabled={pending !== null}
              aria-busy={pending === "approve"}
              onClick={() => void decide("approve")}
            >
              {pending === "approve" ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <CheckIcon />
              )}
              Approve and verify
            </Button>
            <Button
              variant="outline"
              disabled={pending !== null}
              onClick={() => setRejecting(true)}
            >
              <XIcon />
              Reject
            </Button>
          </div>
        )}

        {isPending && !isSelf && rejecting && (
          <div className="flex flex-col gap-3 border-t pt-4">
            <label
              htmlFor={`reason-${document.id}`}
              className="text-sm font-medium"
            >
              What should the member fix?
            </label>
            <Textarea
              id={`reason-${document.id}`}
              value={reason}
              maxLength={REJECTION_REASON_MAX_LENGTH}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: the back of the card is blurred and the address cannot be read."
            />
            <p className="text-muted-foreground text-xs">
              The member sees this exactly as written.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                disabled={
                  pending !== null ||
                  reason.trim().length < REJECTION_REASON_MIN_LENGTH
                }
                aria-busy={pending === "reject"}
                onClick={() => void decide("reject")}
              >
                {pending === "reject" && (
                  <Loader2Icon className="animate-spin" />
                )}
                Reject and ask again
              </Button>
              <Button
                variant="ghost"
                disabled={pending !== null}
                onClick={() => {
                  setRejecting(false);
                  setReason("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export { IdentityDocumentCard };
