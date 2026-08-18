"use client";

import {
  GavelIcon,
  Loader2Icon,
  ScaleIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

import { respondToDamageClaim, withdrawDamageClaim } from "@/actions/claims";
import { ImageUploader } from "@/components/listings/image-uploader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ClaimStatus } from "@/generated/prisma/enums";
import {
  CLAIM_PHOTOS_MAX,
  CLAIM_REASON_LABELS,
  CLAIM_RESPONSE_DAYS,
  CLAIM_RESPONSE_MAX,
  CLAIM_STATUS_LABELS,
} from "@/lib/claims/rules";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

import type { ClaimSnapshot } from "@/lib/queries/bookings";
import type { ListingImageInput } from "@/lib/validations/listing";

interface ClaimPanelProps {
  claim: ClaimSnapshot;
  securityDeposit: number;
}

/**
 * A deposit claim, as both parties see it.
 *
 * ONE COMPONENT FOR BOTH SIDES. The facts are identical - the same amount, the same description, the
 * same photographs - and only the controls differ. Two components would be two places for the two
 * people to be shown subtly different accounts of the same disagreement, which is how a settled
 * dispute restarts.
 *
 * THE COPY NEVER IMPLIES CUSTODY. SamaanShare holds nothing and moves nothing; an upheld claim says
 * the owner "may keep" and the rest "is owed back". The same line every payment string draws.
 *
 * NOTHING IS DECIDED UNTIL IT IS. While a claim is open the panel states the amount as claimed, not
 * as owed - the platform does not act on one person's assertion, and rendering it as a settled
 * deduction would do exactly that.
 */
function ClaimPanel({ claim, securityDeposit }: ClaimPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<ListingImageInput[]>([]);
  const [pending, setPending] = useState<
    "accept" | "dispute" | "withdraw" | null
  >(null);

  const settled = claim.amountUpheld !== null;
  const owed = Math.max(0, securityDeposit - (claim.amountUpheld ?? 0));

  async function respond(accepted: boolean) {
    setPending(accepted ? "accept" : "dispute");

    const result = await respondToDamageClaim({
      claimId: claim.id,
      accepted,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(photos.length > 0
        ? { photoIds: photos.map((photo) => photo.publicId) }
        : {}),
    });

    setPending(null);

    if (!result.success) {
      toast.error(result.error);

      return;
    }

    toast.success(
      accepted
        ? "Recorded that you accept the claim."
        : "Recorded that you dispute it. SamaanShare will decide."
    );
    setIsOpen(false);
  }

  async function withdraw() {
    setPending("withdraw");

    const result = await withdrawDamageClaim({ claimId: claim.id });

    setPending(null);

    if (!result.success) {
      toast.error(result.error);

      return;
    }

    toast.success("Claim withdrawn. The full deposit is owed back.");
  }

  return (
    <div className="border-destructive/30 flex flex-col gap-3 rounded-lg border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <ScaleIcon
          className="text-destructive size-4 shrink-0"
          aria-hidden="true"
        />
        <span className="text-sm font-medium">
          {claim.isMine ? "Your claim" : "Claim on your deposit"}:{" "}
          {formatPKR(claim.amountClaimed)}
        </span>
        <span className="text-muted-foreground text-xs">
          of {formatPKR(securityDeposit)}
        </span>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span>{CLAIM_REASON_LABELS[claim.reason]}</span>
        <span aria-hidden="true">·</span>
        <span>{CLAIM_STATUS_LABELS[claim.status]}</span>
        <span aria-hidden="true">·</span>
        <span>filed {formatDate(claim.filedAt)}</span>
      </div>

      {/* A string, never HTML - it is user input. */}
      <p className="text-sm leading-relaxed whitespace-pre-line">
        {claim.description}
      </p>

      {claim.photos.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {claim.photos.map((photo) => (
            <a
              key={photo.id}
              href={photo.url}
              target="_blank"
              rel="noreferrer"
              className="focus-visible:ring-ring relative size-16 overflow-hidden rounded-md outline-none focus-visible:ring-2"
            >
              <Image
                src={photo.url}
                alt="Claim photo"
                fill
                sizes="64px"
                className="object-cover"
              />
            </a>
          ))}
        </div>
      )}

      {claim.responseNote && (
        <p className="text-muted-foreground border-muted border-l-2 pl-2.5 text-xs leading-relaxed whitespace-pre-line">
          {claim.isMine ? "The renter replied: " : "You replied: "}
          {claim.responseNote}
        </p>
      )}

      {/*
        The determination, with both figures. Each party sees the same two numbers, so neither can
        walk away describing a different outcome.
      */}
      {claim.status === ClaimStatus.RESOLVED && (
        <div className="bg-muted/50 flex flex-col gap-1 rounded-md px-2.5 py-2 text-xs">
          <p className="flex items-center gap-1.5 font-medium">
            <GavelIcon className="size-3.5 shrink-0" aria-hidden="true" />
            SamaanShare decided on{" "}
            {claim.resolvedAt ? formatDate(claim.resolvedAt) : "review"}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            The owner may keep {formatPKR(claim.amountUpheld ?? 0)}.{" "}
            {formatPKR(owed)} is owed back to the renter.
          </p>
          {claim.resolution && (
            <p className="text-muted-foreground leading-relaxed italic">
              {claim.resolution}
            </p>
          )}
        </div>
      )}

      {claim.status === ClaimStatus.ACCEPTED && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          Agreed by both parties. The owner may keep{" "}
          {formatPKR(claim.amountUpheld ?? 0)}, and {formatPKR(owed)} is owed
          back to the renter.
        </p>
      )}

      {claim.status === ClaimStatus.WITHDRAWN && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          Withdrawn. The full {formatPKR(securityDeposit)} is owed back.
        </p>
      )}

      {/*
        Says plainly that nothing has been decided while a claim is live. Without it, an amount in
        bold at the top of a card reads as a deduction that has already happened.
      */}
      {!settled && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          Nothing has been decided yet, and the full deposit is still owed until
          it is.
          {claim.canRespond
            ? ` If you do not reply within ${CLAIM_RESPONSE_DAYS} days of it being filed, SamaanShare decides on what has been recorded.`
            : ""}
        </p>
      )}

      {claim.canRespond && !isOpen && (
        <div>
          <Button size="sm" variant="outline" onClick={() => setIsOpen(true)}>
            Accept or dispute
          </Button>
        </div>
      )}

      {claim.canRespond && isOpen && (
        <div className="flex flex-col gap-2.5">
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={CLAIM_RESPONSE_MAX}
            rows={3}
            placeholder="Optional — your own account of the item's condition"
            disabled={pending !== null}
            aria-label="Your reply"
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">
              Photos (optional, but they are the strongest thing you can add)
            </span>
            <ImageUploader
              images={photos}
              onChange={setPhotos}
              max={CLAIM_PHOTOS_MAX}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => respond(true)}
              disabled={pending !== null}
              aria-busy={pending === "accept"}
            >
              {pending === "accept" && <Loader2Icon className="animate-spin" />}
              I accept {formatPKR(claim.amountClaimed)}
            </Button>

            <Button
              size="sm"
              onClick={() => respond(false)}
              disabled={pending !== null}
              aria-busy={pending === "dispute"}
            >
              {pending === "dispute" && (
                <Loader2Icon className="animate-spin" />
              )}
              I dispute this
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsOpen(false)}
              disabled={pending !== null}
            >
              Not now
            </Button>
          </div>

          <p className="text-muted-foreground flex items-start gap-1.5 text-xs leading-relaxed">
            <TriangleAlertIcon
              className="mt-0.5 size-3.5 shrink-0"
              aria-hidden="true"
            />
            You can answer once, and it cannot be changed afterwards. Accepting
            means agreeing the owner may keep that amount.
          </p>
        </div>
      )}

      {claim.canWithdraw && (
        <div>
          <Button
            size="sm"
            variant="ghost"
            onClick={withdraw}
            disabled={pending !== null}
            aria-busy={pending === "withdraw"}
          >
            {pending === "withdraw" && <Loader2Icon className="animate-spin" />}
            Withdraw my claim
          </Button>
        </div>
      )}
    </div>
  );
}

export { ClaimPanel };
