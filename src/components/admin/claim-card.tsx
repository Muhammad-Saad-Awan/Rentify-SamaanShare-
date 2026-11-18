"use client";

import { ClockIcon, GavelIcon, Loader2Icon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { resolveDamageClaim } from "@/actions/claim-resolution";
import { AttentionNote, AwaitingBadge } from "@/components/admin/attention";
import { DecisionPanel } from "@/components/admin/decision-panel";
import { StatusBadge as StatusLabel } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ClaimStatus } from "@/generated/prisma/enums";
import {
  CLAIM_REASON_LABELS,
  CLAIM_RESOLUTION_MAX,
  CLAIM_DESCRIPTION_MIN,
} from "@/lib/claims/rules";
import { HANDOVER_CONDITION_LABELS } from "@/lib/handover/rules";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

import type { AdminClaimSummary } from "@/lib/queries/claims";

interface ClaimCardProps {
  claim: AdminClaimSummary;
}

/**
 * One claim in the administrator's queue.
 *
 * THE CONTRADICTION IS THE HEADLINE. When the owner's own return record graded the item as fine and
 * they are now claiming damage, that is flagged before anything else - it is the strongest evidence
 * available either way, and an administrator who had to go looking for it would often not.
 *
 * SILENCE IS SHOWN AS SILENCE. A claim that reached this queue because nobody answered is labelled
 * as such rather than as a dispute. One is a disagreement between two accounts; the other is one
 * account and an absence, and they call for different confidence in the same decision.
 *
 * THE AWARD IS BOUNDED IN THE FORM AND ON THE SERVER. `canResolveClaim` refuses more than was
 * claimed, because awarding beyond it would decide something nobody put to the administrator and the
 * renter would have had no chance to answer the larger figure.
 */
function ClaimCard({ claim }: ClaimCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [resolution, setResolution] = useState("");
  const [pending, setPending] = useState(false);

  const parsedAmount = Number.parseInt(amount, 10);
  const amountValid =
    Number.isInteger(parsedAmount) &&
    parsedAmount >= 0 &&
    parsedAmount <= claim.amountClaimed;
  const ready =
    amountValid && resolution.trim().length >= CLAIM_DESCRIPTION_MIN;

  const escalatedBySilence =
    claim.status === ClaimStatus.DISPUTED && claim.respondedAt === null;

  async function submit() {
    if (!ready) {
      return;
    }

    setPending(true);

    const result = await resolveDamageClaim({
      claimId: claim.id,
      amountUpheld: parsedAmount,
      resolution: resolution.trim(),
    });

    setPending(false);

    if (!result.success) {
      toast.error(result.error);

      return;
    }

    toast.success("Claim decided. Both parties have been told.");
    setIsOpen(false);
  }

  const ownerPhotos = claim.photos.filter((photo) => photo.byClaimant);
  const renterPhotos = claim.photos.filter((photo) => !photo.byClaimant);

  return (
    <Card>
      <div className="flex flex-col gap-4 px-(--card-spacing)">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-heading text-base leading-snug font-semibold">
              {CLAIM_REASON_LABELS[claim.reason]}
            </span>
            <p className="text-muted-foreground text-xs">
              <Link
                href={`/listings/${claim.listing.id}`}
                className="text-foreground decoration-foreground/30 hover:decoration-foreground underline underline-offset-4"
              >
                {claim.listing.title}
              </Link>{" "}
              — {claim.claimant.name?.trim() || "the owner"} against{" "}
              {claim.respondent.name?.trim() || "the renter"}. Rental ended{" "}
              {claim.bookingCompletedAt
                ? formatDate(claim.bookingCompletedAt)
                : "unknown"}
              , claim filed {formatDate(claim.filedAt)}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/*
              Silence is shown as silence - see the note on the component. Its own badge, beside the
              state, so it is read at the same glance as "awaiting decision".
            */}
            {escalatedBySilence && (
              <Badge variant="outline">
                <ClockIcon aria-hidden="true" />
                No reply from the renter
              </Badge>
            )}
            {claim.status === ClaimStatus.DISPUTED ? (
              <AwaitingBadge label="Awaiting decision" />
            ) : (
              <StatusLabel
                variant={
                  claim.status === ClaimStatus.OPEN ? "secondary" : "outline"
                }
                label={CLAIM_STATUS_SHORT[claim.status]}
              />
            )}
          </div>
        </div>

        {/*
          The money in question, before the arguments about it. The deposit is the ceiling of any
          award, so the two figures are always read together.
        */}
        <div className="bg-muted/60 flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-lg px-4 py-3">
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">Claimed</span>
            <span className="font-heading text-xl font-bold tracking-tight tabular-nums">
              {formatPKR(claim.amountClaimed)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-muted-foreground text-xs">Deposit held</span>
            <span className="font-heading text-base font-semibold tabular-nums">
              {formatPKR(claim.securityDeposit)}
            </span>
          </div>
          {claim.status === ClaimStatus.RESOLVED && (
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs">Upheld</span>
              <span className="font-heading text-base font-semibold tabular-nums">
                {formatPKR(claim.amountUpheld ?? 0)}
              </span>
            </div>
          )}
        </div>

        {/*
          The owner arguing against their own record. First evidence on the card when it applies.
        */}
        {!claim.supportedByHandover && (
          <AttentionNote>
            {claim.handover
              ? `The owner recorded this item as "${HANDOVER_CONDITION_LABELS[claim.handover.condition]}" when it came back, and is now claiming damage.`
              : "There is no return condition record for this rental."}
          </AttentionNote>
        )}

        {/*
          The two accounts side by side on a wide screen, because the decision is a comparison of
          them - stacked, the renter's answer sat below the fold of the owner's claim.
        */}
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border px-3.5 py-3 text-sm">
            <p className="font-medium">The owner says</p>
            {/* A string, never HTML - it is user input. */}
            <p className="text-muted-foreground leading-relaxed break-words whitespace-pre-line">
              {claim.description}
            </p>
            {ownerPhotos.length > 0 && (
              <PhotoStrip
                photos={ownerPhotos.map((photo) => ({
                  id: photo.id,
                  url: photo.url,
                  label: "Owner",
                }))}
              />
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-1.5 rounded-lg border px-3.5 py-3 text-sm">
            <p className="font-medium">The renter says</p>
            {claim.responseNote ? (
              <p className="text-muted-foreground leading-relaxed break-words whitespace-pre-line">
                {claim.responseNote}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs italic">
                The renter did not leave an account.
              </p>
            )}
            {renterPhotos.length > 0 && (
              <PhotoStrip
                photos={renterPhotos.map((photo) => ({
                  id: photo.id,
                  url: photo.url,
                  label: "Renter",
                }))}
              />
            )}
          </div>
        </div>

        {claim.handover && (
          <div className="bg-muted/50 flex flex-col gap-1 rounded-lg border px-3.5 py-3 text-xs">
            <p className="font-medium">
              Return record:{" "}
              {HANDOVER_CONDITION_LABELS[claim.handover.condition]}
            </p>
            {claim.handover.notes && (
              <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                {claim.handover.notes}
              </p>
            )}
            {claim.handover.photos.length > 0 && (
              <PhotoStrip
                photos={claim.handover.photos.map((photo) => ({
                  ...photo,
                  label: "At return",
                }))}
              />
            )}
          </div>
        )}

        {claim.status === ClaimStatus.RESOLVED && (
          <div className="bg-muted/50 flex flex-col gap-1 rounded-lg border px-3.5 py-3 text-xs leading-relaxed">
            <p className="flex items-center gap-1.5 font-medium">
              <GavelIcon className="size-3.5" aria-hidden="true" />
              Upheld {formatPKR(claim.amountUpheld ?? 0)}
              <span className="text-muted-foreground font-normal">
                {claim.resolvedBy?.name ? ` by ${claim.resolvedBy.name}` : ""}
                {claim.resolvedAt ? ` on ${formatDate(claim.resolvedAt)}` : ""}
              </span>
            </p>
            {claim.resolution && (
              <p className="text-muted-foreground italic">{claim.resolution}</p>
            )}
          </div>
        )}

        {claim.status === ClaimStatus.DISPUTED && !isOpen && (
          <div className="flex justify-end border-t pt-4">
            <Button size="sm" onClick={() => setIsOpen(true)}>
              Decide
            </Button>
          </div>
        )}

        {claim.status === ClaimStatus.DISPUTED && isOpen && (
          <DecisionPanel
            title="Decide this claim"
            consequence="This decides how much of the deposit the owner is paid out of it at settlement. The rest goes back to the renter. Both parties are told, and read your reasoning."
          >
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`upheld-${claim.id}`}
                className="text-xs font-medium"
              >
                Amount upheld, in rupees
              </label>
              <Input
                id={`upheld-${claim.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={claim.amountClaimed}
                step={1}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={pending}
                aria-describedby={`upheld-hint-${claim.id}`}
                className="max-w-40 tabular-nums"
              />
              <p
                id={`upheld-hint-${claim.id}`}
                className="text-muted-foreground text-xs"
              >
                Between {formatPKR(0)} and {formatPKR(claim.amountClaimed)}.
                Zero decides entirely for the renter.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`resolution-${claim.id}`}
                className="text-xs font-medium"
              >
                Decision
              </label>
              <Textarea
                id={`resolution-${claim.id}`}
                value={resolution}
                onChange={(event) => setResolution(event.target.value)}
                maxLength={CLAIM_RESOLUTION_MAX}
                rows={3}
                placeholder="Why this decision — both parties will read it"
                disabled={pending}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={submit}
                disabled={pending || !ready}
                aria-busy={pending}
              >
                {pending && <Loader2Icon className="animate-spin" />}
                Record decision
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </DecisionPanel>
        )}
      </div>
    </Card>
  );
}

/**
 * The claim's state in one to three words, for the badge.
 *
 * `CLAIM_STATUS_LABELS` is written for the parties ("Disputed — with SamaanShare to decide") and is
 * too long for a badge; these match the queue's own tab names, so the badge and the tab it was found
 * under say the same thing.
 */
const CLAIM_STATUS_SHORT: Readonly<Record<ClaimStatus, string>> = {
  [ClaimStatus.OPEN]: "With the renter",
  [ClaimStatus.ACCEPTED]: "Settled between parties",
  [ClaimStatus.DISPUTED]: "To decide",
  [ClaimStatus.RESOLVED]: "Decided",
  [ClaimStatus.WITHDRAWN]: "Withdrawn",
};

/** Declared at module scope - see the `EditPanel` note in `BookingActions`. */
function PhotoStrip({
  photos,
}: {
  photos: { id: string; url: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {photos.map((photo) => (
        <a
          key={photo.id}
          href={photo.url}
          target="_blank"
          rel="noreferrer"
          title={photo.label}
          className="focus-visible:ring-ring bg-muted relative size-16 overflow-hidden rounded-md border outline-none focus-visible:ring-2"
        >
          <Image
            src={photo.url}
            alt={`${photo.label} photo`}
            fill
            sizes="64px"
            className="object-cover"
          />
        </a>
      ))}
    </div>
  );
}

export { ClaimCard };
