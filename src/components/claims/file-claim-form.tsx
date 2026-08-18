"use client";

import { Loader2Icon, ScaleIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { fileDamageClaim } from "@/actions/claims";
import { ImageUploader } from "@/components/listings/image-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ClaimReason } from "@/generated/prisma/enums";
import {
  CLAIM_DESCRIPTION_MAX,
  CLAIM_DESCRIPTION_MIN,
  CLAIM_PHOTOS_MAX,
  CLAIM_REASON_LABELS,
  CLAIM_RESPONSE_DAYS,
} from "@/lib/claims/rules";
import { formatPKR } from "@/lib/utils/currency";

import type { ListingImageInput } from "@/lib/validations/listing";

interface FileClaimFormProps {
  bookingId: string;
  securityDeposit: number;
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Filing a claim against a renter's deposit.
 *
 * NO REASON AND NO AMOUNT ARE PRESELECTED, the same rule as the review form's stars and the handover
 * form's condition. A default amount would be answered by inertia, and the one number nobody should
 * be able to submit without choosing it is the one that costs another person money.
 *
 * THE CAP IS SHOWN, NOT JUST ENFORCED. The field states the deposit and refuses more, because an
 * owner who types a real repair quote of 90,000 against a 60,000 deposit needs to understand the
 * platform can only speak to the deposit - not to be told "invalid" by a form that never explained
 * what the limit was or why.
 *
 * The server re-checks every one of these against the booking's own figures. This is a convenience.
 */
function FileClaimForm({
  bookingId,
  securityDeposit,
  onDone,
  onCancel,
}: FileClaimFormProps) {
  const [reason, setReason] = useState<ClaimReason | "">("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [photos, setPhotos] = useState<ListingImageInput[]>([]);
  const [isPending, setIsPending] = useState(false);

  const parsedAmount = Number.parseInt(amount, 10);
  const amountValid =
    Number.isInteger(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= securityDeposit;
  const tooMuch =
    Number.isInteger(parsedAmount) && parsedAmount > securityDeposit;

  const ready =
    reason !== "" &&
    description.trim().length >= CLAIM_DESCRIPTION_MIN &&
    amountValid;

  async function submit() {
    if (!ready) {
      return;
    }

    setIsPending(true);

    const result = await fileDamageClaim({
      bookingId,
      reason,
      description: description.trim(),
      amountClaimed: parsedAmount,
      ...(photos.length > 0
        ? { photoIds: photos.map((photo) => photo.publicId) }
        : {}),
    });

    setIsPending(false);

    if (!result.success) {
      toast.error(result.error);

      return;
    }

    toast.success("Claim filed. The renter has been asked to respond.");
    onDone();
  }

  return (
    <div className="bg-muted/50 flex flex-col gap-3 rounded-lg px-3 py-3">
      <p className="flex items-center gap-2 text-xs font-medium">
        <ScaleIcon className="size-4 shrink-0" aria-hidden="true" />
        Claim against the {formatPKR(securityDeposit)} deposit
      </p>

      <div
        role="radiogroup"
        aria-label="What went wrong"
        className="flex flex-col gap-1"
      >
        {Object.values(ClaimReason).map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type="radio"
              name={`claim-reason-${bookingId}`}
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
              disabled={isPending}
              className="accent-primary size-3.5 shrink-0"
            />
            {CLAIM_REASON_LABELS[value]}
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`claim-amount-${bookingId}`}
          className="text-xs font-medium"
        >
          Amount claimed, in rupees
        </label>
        <Input
          id={`claim-amount-${bookingId}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={securityDeposit}
          step={1}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          disabled={isPending}
          className="max-w-40"
        />
        {tooMuch ? (
          <p className="text-destructive text-xs leading-relaxed">
            A claim cannot exceed the {formatPKR(securityDeposit)} deposit.
            Anything beyond it is between you and the renter — SamaanShare has
            no standing to state it.
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            At most {formatPKR(securityDeposit)}.
          </p>
        )}
      </div>

      <Textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={CLAIM_DESCRIPTION_MAX}
        rows={4}
        placeholder="What is damaged or missing, and how you know it happened during this rental"
        disabled={isPending}
        aria-label="What happened"
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

      {/*
        States what filing actually does. An owner expecting SamaanShare to collect the money will
        otherwise learn otherwise at the worst possible moment.
      */}
      <p className="text-muted-foreground text-xs leading-relaxed">
        The renter has {CLAIM_RESPONSE_DAYS} days to accept or dispute this. If
        they do not reply, SamaanShare decides on what has been recorded.
        SamaanShare does not hold the deposit and cannot transfer it — a claim
        changes what we state is owed, not who has the money.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={submit}
          disabled={isPending || !ready}
          aria-busy={isPending}
        >
          {isPending && <Loader2Icon className="animate-spin" />}
          File claim
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export { FileClaimForm };
