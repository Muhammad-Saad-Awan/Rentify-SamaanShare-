"use client";

import {
  CameraIcon,
  CheckIcon,
  ImageIcon,
  Loader2Icon,
  LockIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import {
  createIdentityUploadSignature,
  submitIdentityDocument,
} from "@/actions/identity-documents";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { compressImage } from "@/lib/utils/image";
import { normalizeCnic } from "@/lib/validations/identity";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from "@/lib/validations/listing";

type Side = "front" | "back";

const SIDE_LABELS: Record<Side, { title: string; hint: string }> = {
  front: { title: "Front of card", hint: "The side with your photo" },
  back: { title: "Back of card", hint: "The side with your address" },
};

/**
 * The explicit list, not `image/*`: iOS converts a camera photo to JPEG only when HEIC is not
 * accepted, and no browser canvas can compress HEIC. See `ACCEPTED_IMAGE_TYPES`.
 */
const ACCEPT = ACCEPTED_IMAGE_TYPES.join(",");

/**
 * Formats the number as it is typed, `12345-1234567-1`, so the member can check it against the card
 * group by group. The server normalises again regardless.
 */
function formatCnicInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 13);

  if (digits.length <= 5) {
    return digits;
  }

  if (digits.length <= 12) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }

  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

/**
 * CNIC upload: number, front and back.
 *
 * UPLOADED ON SUBMIT, NOT ON PICK. The photos stay in the browser, previewed, until the member presses
 * submit; only then are they sent to Cloudinary and the ids handed to the server. Someone who picks a
 * photo and walks away leaves nothing behind - for an identity document, an orphaned upload is not a
 * storage cost, it is a copy of somebody's ID card nobody is accounting for.
 *
 * Two pickers per side. "Take photo" carries `capture="environment"`, which opens the rear camera on a
 * phone; "Choose from gallery" has no `capture`, which opens the photo library. On a desktop both
 * open a file dialog, which is the right fallback.
 *
 * THE NUMBER IS MARKED INVALID ONLY AFTER THE FIELD IS LEFT. Flagging it on every keystroke painted
 * the field red from the first digit until the thirteenth, which reads as a mistake the member has not
 * made yet. The submit button says what is still missing instead, so a disabled button is never a
 * puzzle.
 */
function IdentityDocumentForm() {
  const router = useRouter();
  const numberId = useId();
  const [cnic, setCnic] = useState("");
  const [cnicTouched, setCnicTouched] = useState(false);
  const [files, setFiles] = useState<Record<Side, File | null>>({
    front: null,
    back: null,
  });
  const [busy, setBusy] = useState(false);

  const cnicValid = normalizeCnic(cnic) !== null;
  const ready = cnicValid && files.front !== null && files.back !== null;
  const showCnicError = cnicTouched && cnic.length > 0 && !cnicValid;

  const missing = [
    !cnicValid && "your CNIC number",
    !files.front && "a photo of the front",
    !files.back && "a photo of the back",
  ].filter((item): item is string => Boolean(item));

  function choose(side: Side, file: File | undefined) {
    if (!file) {
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type as never)) {
      toast.error("Choose a JPEG, PNG or WebP photo.");

      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("That photo is larger than 15MB.");

      return;
    }

    setFiles((current) => ({ ...current, [side]: file }));
  }

  async function upload(file: File): Promise<string | null> {
    const signature = await createIdentityUploadSignature();

    if (!signature.success) {
      toast.error(signature.error);

      return null;
    }

    const body = new FormData();
    body.append("file", await compressImage(file));
    body.append("api_key", signature.data.apiKey);
    body.append("timestamp", String(signature.data.timestamp));
    body.append("signature", signature.data.signature);
    body.append("folder", signature.data.folder);
    // Signed, so it must be sent exactly as issued - this is what keeps the image private.
    if (signature.data.type) {
      body.append("type", signature.data.type);
    }

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${signature.data.cloudName}/image/upload`,
      { method: "POST", body }
    );

    if (!response.ok) {
      return null;
    }

    const result = (await response.json()) as { public_id?: string };

    return result.public_id ?? null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!ready || !files.front || !files.back) {
      setCnicTouched(true);

      return;
    }

    setBusy(true);

    try {
      const [frontPublicId, backPublicId] = await Promise.all([
        upload(files.front),
        upload(files.back),
      ]);

      if (!frontPublicId || !backPublicId) {
        toast.error("Could not upload your photos. Please try again.");

        return;
      }

      const result = await submitIdentityDocument({
        cnicNumber: cnic,
        frontPublicId,
        backPublicId,
      });

      if (!result.success) {
        toast.error(result.error);

        return;
      }

      toast.success("CNIC submitted. You can now rent and list items.");
      router.refresh();
    } catch {
      toast.error("Could not upload your photos. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      <Field data-invalid={showCnicError} className="max-w-xs">
        <FieldLabel htmlFor={numberId}>CNIC number</FieldLabel>
        <Input
          id={numberId}
          inputMode="numeric"
          autoComplete="off"
          placeholder="12345-1234567-1"
          value={cnic}
          onChange={(event) => setCnic(formatCnicInput(event.target.value))}
          onBlur={() => setCnicTouched(true)}
          aria-invalid={showCnicError}
          className="font-mono tracking-wide"
          disabled={busy}
        />
        {showCnicError ? (
          <FieldError>Enter all 13 digits printed on your card.</FieldError>
        ) : (
          <FieldDescription>
            The 13 digits printed on your card.
          </FieldDescription>
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        {(["front", "back"] as const).map((side) => (
          <SidePicker
            key={side}
            side={side}
            file={files[side]}
            disabled={busy}
            onChoose={(file) => choose(side, file)}
          />
        ))}
      </div>

      <p className="bg-muted/60 text-muted-foreground flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-xs leading-relaxed">
        <LockIcon
          className="text-success mt-0.5 size-3.5 shrink-0"
          aria-hidden="true"
        />
        Stored privately and seen only by SamaanShare staff, to confirm who you
        are. It is never shown to other members.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-auto"
          disabled={!ready || busy}
        >
          {busy ? (
            <>
              <Loader2Icon className="animate-spin" />
              Uploading...
            </>
          ) : (
            "Submit CNIC"
          )}
        </Button>

        {/* Polite, so it reads out as the last missing piece is added - not on every keystroke. */}
        <p
          className="text-muted-foreground text-xs leading-relaxed"
          aria-live="polite"
        >
          {busy
            ? "Sending your photos securely. Keep this page open."
            : missing.length > 0
              ? `Still needed: ${missing.join(", ")}.`
              : "Ready to submit."}
        </p>
      </div>
    </form>
  );
}

interface SidePickerProps {
  side: Side;
  file: File | null;
  disabled: boolean;
  onChoose: (file: File | undefined) => void;
}

function SidePicker({ side, file, disabled, onChoose }: SidePickerProps) {
  const cameraId = useId();
  const galleryId = useId();
  const titleId = useId();
  const [preview, setPreview] = useState<string | null>(null);
  const { title, hint } = SIDE_LABELS[side];

  // An object URL per chosen file, released when it is replaced or the form goes away.
  useEffect(() => {
    if (!file) {
      setPreview(null);

      return;
    }

    const url = URL.createObjectURL(file);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div role="group" aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <span id={titleId} className="text-sm font-medium">
          {title}
        </span>
        {file ? (
          <span className="text-success-soft-foreground flex items-center gap-1 text-xs font-medium">
            <CheckIcon className="size-3.5" aria-hidden="true" />
            Added
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">{hint}</span>
        )}
      </div>

      <div
        className={cn(
          "relative flex aspect-[1.586] w-full items-center justify-center overflow-hidden rounded-xl border",
          preview ? "bg-muted" : "bg-muted/50 border-input/60 border-dashed"
        )}
      >
        {preview ? (
          // A local object URL, so `next/image` has nothing to optimise.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={`Preview of the ${side} of your CNIC`}
            className="size-full object-cover"
          />
        ) : (
          <span className="text-muted-foreground flex flex-col items-center gap-1.5 px-4 text-center text-xs">
            <ImageIcon
              className="size-5"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            No photo yet
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={disabled}
          render={<label htmlFor={cameraId} className="cursor-pointer" />}
        >
          {file ? <RotateCcwIcon /> : <CameraIcon />}
          {file ? "Retake" : "Take photo"}
        </Button>
        <Button
          variant="ghost"
          disabled={disabled}
          render={<label htmlFor={galleryId} className="cursor-pointer" />}
        >
          <ImageIcon />
          Choose from gallery
        </Button>
      </div>

      <input
        id={cameraId}
        type="file"
        accept={ACCEPT}
        capture="environment"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          onChoose(event.target.files?.[0]);
          // Cleared so choosing the same file again still fires `change`.
          event.target.value = "";
        }}
      />
      <input
        id={galleryId}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          onChoose(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}

export { IdentityDocumentForm };
