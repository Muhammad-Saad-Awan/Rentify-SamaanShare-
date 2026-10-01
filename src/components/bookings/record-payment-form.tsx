"use client";

import { CheckIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { submitPaymentEvidence } from "@/actions/payment-verification";
import { ImageUploader } from "@/components/listings/image-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TRANSACTION_REF_MAX } from "@/lib/validations/payment";

import type { ListingImageInput } from "@/lib/validations/listing";

interface RecordPaymentFormProps {
  bookingId: string;
  /** Pre-filled when the renter has recorded a payment before and it was refused. */
  transactionRef?: string | null;
  /** What a rejection said, so the correction is made with the reason in front of them. */
  rejectionReason?: string | null;
}

/**
 * The renter tells us they have paid.
 *
 * THE REFERENCE IS REQUIRED AND THE RECEIPT IS NOT, which is the opposite of what people expect
 * and is the right way round. An administrator reconciling against a bank statement matches on
 * the reference; a screenshot means reading an amount off an image and guessing which of three
 * same-value transfers it was. Proof is corroboration, not identification.
 *
 * THE RECEIPT IS SENT AS A PUBLIC ID ONLY. The uploader puts the file in Cloudinary and hands
 * back an id; the server resolves the URL and the checksum from the Admin API. It used to send
 * all three, and the checksum is what catches the same screenshot submitted against two
 * bookings - a value the client supplies cannot do that job.
 *
 * SUBMITTING DOES NOT START ANYTHING. The rental is no closer to beginning because somebody said
 * they paid; it moves when an administrator agrees the money arrived. The copy says so, because
 * a renter who thinks pressing this unlocks the handover will turn up at a door.
 */
function RecordPaymentForm({
  bookingId,
  transactionRef,
  rejectionReason,
}: RecordPaymentFormProps) {
  const [reference, setReference] = useState(transactionRef ?? "");
  const [receipt, setReceipt] = useState<ListingImageInput[]>([]);
  const [isPending, setIsPending] = useState(false);

  const canSubmit = reference.trim().length > 0 && !isPending;

  async function submit() {
    if (!canSubmit) {
      return;
    }

    setIsPending(true);

    try {
      const result = await submitPaymentEvidence({
        bookingId,
        transactionRef: reference,
        // One receipt, and only its id - see the note on the component.
        ...(receipt[0] ? { proofPublicId: receipt[0].publicId } : {}),
      });

      if (!result.success) {
        toast.error(result.error);

        return;
      }

      toast.success(
        "Recorded. We will check it against our account and tell you."
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {rejectionReason && (
        <p className="text-destructive text-xs leading-relaxed">
          {rejectionReason}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`reference-${bookingId}`}
          className="text-xs font-medium"
        >
          Transaction reference
        </label>

        <Input
          id={`reference-${bookingId}`}
          value={reference}
          maxLength={TRANSACTION_REF_MAX}
          disabled={isPending}
          onChange={(event) => setReference(event.target.value)}
          placeholder="e.g. 4482991 or IBFT-20260930-77"
        />

        <p className="text-muted-foreground text-xs leading-relaxed">
          The number your bank or wallet gave the transfer. This is what we
          search for, so it matters more than the screenshot.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">Receipt (optional)</span>

        {/*
          The listing uploader, at one photo. Not camera-only: a transfer receipt lives in a
          banking app and is screenshotted, so requiring the camera - as the handover form does,
          where the point is a photo taken at that moment - would make it impossible to attach
          the only evidence that exists.
        */}
        <ImageUploader images={receipt} onChange={setReceipt} max={1} />
      </div>

      <div>
        <Button
          size="sm"
          onClick={() => void submit()}
          disabled={!canSubmit}
          aria-busy={isPending}
        >
          {isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
          I have paid
        </Button>
      </div>
    </div>
  );
}

export { RecordPaymentForm };
