"use client";

import {
  ClockIcon,
  GavelIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { resolveDamageClaim } from "@/actions/claim-resolution";
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

  return (
    <Card>
      <div className="flex flex-col gap-3 px-(--card-spacing)">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {formatPKR(claim.amountClaimed)} of{" "}
            {formatPKR(claim.securityDeposit)}
          </Badge>
          <span className="font-heading text-sm font-medium">
            {CLAIM_REASON_LABELS[claim.reason]}
          </span>

          {claim.status !== ClaimStatus.DISPUTED && (
            <Badge variant="outline">{claim.status.toLowerCase()}</Badge>
          )}

          {escalatedBySilence && (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <ClockIcon className="size-3.5" aria-hidden="true" />
              No reply from the renter
            </span>
          )}
        </div>

        {/*
          The owner arguing against their own record. First thing on the card when it applies.
        */}
        {!claim.supportedByHandover && (
          <p className="text-destructive flex items-start gap-1.5 text-xs leading-relaxed">
            <TriangleAlertIcon
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            {claim.handover
              ? `The owner recorded this item as "${HANDOVER_CONDITION_LABELS[claim.handover.condition]}" when it came back, and is now claiming damage.`
              : "There is no return condition record for this rental."}
          </p>
        )}

        <p className="text-muted-foreground text-xs">
          <Link
            href={`/listings/${claim.listing.id}`}
            className="underline-offset-4 hover:underline"
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

        <div className="text-sm">
          <p className="font-medium">The owner says</p>
          {/* A string, never HTML - it is user input. */}
          <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
            {claim.description}
          </p>
        </div>

        {claim.responseNote ? (
          <div className="text-sm">
            <p className="font-medium">The renter says</p>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
              {claim.responseNote}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs italic">
            The renter did not leave an account.
          </p>
        )}

        {claim.handover && (
          <div className="bg-muted/50 rounded-md px-2.5 py-2 text-xs">
            <p className="font-medium">
              Return record:{" "}
              {HANDOVER_CONDITION_LABELS[claim.handover.condition]}
            </p>
            {claim.handover.notes && (
              <p className="text-muted-foreground mt-1 leading-relaxed whitespace-pre-line">
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

        {claim.photos.length > 0 && (
          <PhotoStrip
            photos={claim.photos.map((photo) => ({
              id: photo.id,
              url: photo.url,
              label: photo.byClaimant ? "Owner" : "Renter",
            }))}
          />
        )}

        {claim.status === ClaimStatus.RESOLVED && (
          <div className="text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 text-xs leading-relaxed">
            <p className="flex items-center gap-1.5 font-medium">
              <GavelIcon className="size-3.5" aria-hidden="true" />
              Upheld {formatPKR(claim.amountUpheld ?? 0)}
              {claim.resolvedBy?.name ? ` by ${claim.resolvedBy.name}` : ""}
              {claim.resolvedAt ? ` on ${formatDate(claim.resolvedAt)}` : ""}
            </p>
            {claim.resolution && (
              <p className="mt-1 italic">{claim.resolution}</p>
            )}
          </div>
        )}

        {claim.status === ClaimStatus.DISPUTED && !isOpen && (
          <div>
            <Button size="sm" variant="outline" onClick={() => setIsOpen(true)}>
              Decide
            </Button>
          </div>
        )}

        {claim.status === ClaimStatus.DISPUTED && isOpen && (
          <div className="bg-muted/50 flex flex-col gap-3 rounded-lg px-3 py-3">
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
                className="max-w-40"
              />
              <p className="text-muted-foreground text-xs">
                Between {formatPKR(0)} and {formatPKR(claim.amountClaimed)}.
                Zero decides entirely for the renter.
              </p>
            </div>

            <Textarea
              value={resolution}
              onChange={(event) => setResolution(event.target.value)}
              maxLength={CLAIM_RESOLUTION_MAX}
              rows={3}
              placeholder="Why this decision — both parties will read it"
              disabled={pending}
              aria-label="Decision"
            />

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

            <p className="text-muted-foreground text-xs leading-relaxed">
              This states how much of the deposit the owner may keep.
              SamaanShare does not hold or transfer the money.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Declared at module scope - see the `EditPanel` note in `BookingActions`. */
function PhotoStrip({
  photos,
}: {
  photos: { id: string; url: string; label: string }[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {photos.map((photo) => (
        <a
          key={photo.id}
          href={photo.url}
          target="_blank"
          rel="noreferrer"
          title={photo.label}
          className="focus-visible:ring-ring relative size-16 overflow-hidden rounded-md outline-none focus-visible:ring-2"
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
