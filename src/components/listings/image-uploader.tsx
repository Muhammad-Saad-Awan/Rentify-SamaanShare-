"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ImagePlusIcon,
  Loader2Icon,
  StarIcon,
  XIcon,
} from "lucide-react";
import Image from "next/image";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import {
  createImageUploadSignature,
  deletePendingImage,
} from "@/actions/uploads";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { compressImage } from "@/lib/utils/image";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_LISTING,
} from "@/lib/validations/listing";

import type { ListingImageInput } from "@/lib/validations/listing";
import type { DragEvent } from "react";

interface ImageUploaderProps {
  images: ListingImageInput[];
  onChange: (images: ListingImageInput[]) => void;
  /** Rendered beneath the grid by the form, so errors sit with the field. */
  error?: string | undefined;
  /**
   * Ceiling on the number of photos. Defaults to a listing's ten.
   *
   * A handover passes six: a listing is a shop window and benefits from more, while a handover is
   * evidence of a moment and is captured by two people standing in a doorway, one of whom wants to
   * leave. The server enforces its own limit either way - this only stops the form offering more
   * than the action will accept.
   */
  max?: number;
}

/**
 * Photo picker for the listing form.
 *
 * Uploads go BROWSER -> CLOUDINARY directly, using a signature minted by
 * `createImageUploadSignature`. Nothing routes through the app server, which is what
 * makes ten photos practical: relaying them would hit the Server Action body limit and
 * spend our bandwidth on bytes Cloudinary stores anyway.
 *
 * Files are compressed before sending - see `compressImage`.
 *
 * No byte-level progress bar. `fetch` cannot report upload progress (that needs
 * `XMLHttpRequest`), and a per-file spinner plus a count communicates the same thing
 * for files this size without hand-rolling an XHR wrapper.
 */
function ImageUploader({
  images,
  onChange,
  error,
  max = MAX_IMAGES_PER_LISTING,
}: ImageUploaderProps) {
  const inputId = useId();

  const [pendingCount, setPendingCount] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const isBusy = pendingCount > 0;
  const remaining = max - images.length;

  /**
   * Mirror of the latest `images`, read inside the async upload loop.
   *
   * A ref rather than state because the loop needs the value *now*: state updates are
   * not visible until the next render, so a closure over `images` would be stale after
   * the first upload and every subsequent one would overwrite it.
   */
  const currentImages = useRef(images);
  currentImages.current = images;

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) {
      return;
    }

    const selected = Array.from(fileList);

    /**
     * Capacity is read from the ref, not from the `remaining` computed at render.
     *
     * A second drop while the first batch is still uploading would otherwise size
     * itself against a stale count and push the total past ten - the server rejects
     * that, but only after the user has waited for every upload.
     */
    const capacity = Math.max(0, max - currentImages.current.length);

    // Trimmed rather than rejected wholesale: someone selecting twelve photos meant to
    // add photos, and taking the first ten is friendlier than discarding all twelve.
    const accepted = selected.slice(0, capacity);

    if (accepted.length < selected.length) {
      toast.warning(
        `Only ${max} photos are allowed, so ${selected.length - accepted.length} were skipped.`
      );
    }

    const valid = accepted.filter((file) => {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type as never)) {
        toast.error(`${file.name} is not a JPEG, PNG or WebP.`);

        return false;
      }

      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name} is larger than 15MB.`);

        return false;
      }

      return true;
    });

    if (valid.length === 0) {
      return;
    }

    setPendingCount((count) => count + valid.length);

    /**
     * Sequential, not `Promise.all`.
     *
     * Ten parallel uploads on a mobile connection contend for the same bandwidth and
     * all finish later than they would in sequence, while ten parallel signature
     * requests would also trip the per-user rate limit. Sequential also means a
     * mid-batch failure leaves the earlier photos already saved.
     */
    for (const file of valid) {
      try {
        // Re-checked per file: a concurrent batch may have consumed the last slot
        // between this batch being sized and this iteration running.
        if (currentImages.current.length >= max) {
          break;
        }

        const uploaded = await uploadOne(file);

        if (uploaded) {
          // Read from a callback rather than closing over `images`: the array has
          // changed on every previous iteration of this loop, and the captured value
          // would be stale - dropping all but the last upload.
          onChange([...currentImages.current, uploaded]);
        }
      } finally {
        setPendingCount((count) => Math.max(0, count - 1));
      }
    }
  }

  async function uploadOne(file: File): Promise<ListingImageInput | null> {
    const signature = await createImageUploadSignature();

    if (!signature.success) {
      toast.error(signature.error);

      return null;
    }

    const compressed = await compressImage(file);

    const body = new FormData();
    body.append("file", compressed);
    body.append("api_key", signature.data.apiKey);
    body.append("timestamp", String(signature.data.timestamp));
    body.append("signature", signature.data.signature);
    // Must match the signed value exactly, or Cloudinary rejects the request.
    body.append("folder", signature.data.folder);

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${signature.data.cloudName}/image/upload`,
        { method: "POST", body }
      );

      if (!response.ok) {
        toast.error(`Could not upload ${file.name}.`);

        return null;
      }

      const result = (await response.json()) as {
        secure_url?: string;
        public_id?: string;
      };

      if (!result.secure_url || !result.public_id) {
        toast.error(
          `Cloudinary did not return a usable image for ${file.name}.`
        );

        return null;
      }

      return { url: result.secure_url, publicId: result.public_id };
    } catch {
      toast.error(`Could not upload ${file.name}. Check your connection.`);

      return null;
    }
  }

  async function handleRemove(index: number) {
    const target = images[index];

    if (!target) {
      return;
    }

    // Removed from the form first, so the UI responds immediately. The asset is then
    // deleted from Cloudinary; if that fails the photo is still gone from the listing,
    // which is what the user asked for - the orphan is our problem, not theirs.
    onChange(images.filter((_, position) => position !== index));

    const result = await deletePendingImage(target.publicId);

    if (!result.success) {
      console.error("Pending image left behind in Cloudinary", result.error);
    }
  }

  /** Swaps with a neighbour. Buttons, not drag-and-drop - see the note below. */
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;

    if (target < 0 || target >= images.length) {
      return;
    }

    const next = [...images];
    const [moved] = next.splice(index, 1);

    if (moved) {
      next.splice(target, 0, moved);
      onChange(next);
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    void handleFiles(event.dataTransfer.files);
  }

  return (
    <div className="flex flex-col gap-3">
      {/*
        The drop zone is a label wrapping a real file input, so a click, a tap, the
        keyboard and a drag all work through one control - and no JavaScript is needed
        to open the picker.
      */}
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "focus-within:ring-ring flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors focus-within:ring-2",
          isDragging ? "border-primary bg-primary/5" : "border-border",
          remaining === 0 && "pointer-events-none opacity-50"
        )}
      >
        <span
          className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full"
          aria-hidden="true"
        >
          {isBusy ? (
            <Loader2Icon className="size-5 animate-spin" />
          ) : (
            <ImagePlusIcon className="size-5" />
          )}
        </span>

        <span className="text-sm font-medium">
          {isBusy
            ? `Uploading ${pendingCount} photo${pendingCount === 1 ? "" : "s"}...`
            : "Drag photos here, or click to choose"}
        </span>

        <span className="text-muted-foreground text-xs">
          JPEG, PNG or WebP up to 15MB. {images.length} of {max} added.
        </span>

        <input
          id={inputId}
          type="file"
          multiple
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          disabled={remaining === 0}
          className="sr-only"
          onChange={(event) => {
            void handleFiles(event.target.files);
            // Cleared so re-selecting the same file fires `change` again; without this
            // a user who removed a photo could not re-add the identical file.
            event.target.value = "";
          }}
        />
      </label>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {images.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <li
              key={image.publicId}
              className="ring-foreground/10 relative overflow-hidden rounded-lg ring-1"
            >
              <div className="bg-muted relative aspect-4/3">
                <Image
                  src={image.url}
                  // Decorative here: the surrounding controls name each photo by
                  // position, and the listing's own alt text is its title.
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 20vw, 45vw"
                  className="object-cover"
                />
              </div>

              {index === 0 && (
                <span className="bg-primary text-primary-foreground absolute top-1.5 left-1.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
                  <StarIcon
                    className="size-3 fill-current"
                    aria-hidden="true"
                  />
                  Cover
                </span>
              )}

              {/*
                Reordering is arrow buttons rather than drag-and-drop. Dragging needs a
                keyboard alternative to be usable at all, and a pointer-only sortable
                grid is exactly the control that locks out keyboard and screen reader
                users. Two buttons are operable by everyone and need no library.
              */}
              <div className="flex items-center justify-between gap-1 p-1.5">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move photo ${index + 1} earlier`}
                  >
                    <ArrowLeftIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    disabled={index === images.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move photo ${index + 1} later`}
                  >
                    <ArrowRightIcon />
                  </Button>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => void handleRemove(index)}
                  aria-label={`Remove photo ${index + 1}`}
                >
                  <XIcon />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {images.length > 1 && (
        <p className="text-muted-foreground text-xs">
          The first photo is the cover image shown in search results.
        </p>
      )}
    </div>
  );
}

export { ImageUploader };
