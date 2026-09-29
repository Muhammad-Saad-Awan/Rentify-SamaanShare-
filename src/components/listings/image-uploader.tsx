"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  ImagePlusIcon,
  Loader2Icon,
  StarIcon,
  XIcon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
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

/** Where focus is owed once a removal has rendered. */
type FocusTarget = { kind: "photo"; publicId: string } | { kind: "input" };

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
  /**
   * Offer the camera and nothing else. Used by the handover record.
   *
   * WHAT THIS IS AND IS NOT WORTH. A handover photo is evidence of an item's condition at one
   * moment, and a picture chosen from a gallery could have been taken any time - so the gallery,
   * the drag-and-drop target and the multi-file pick are all removed here, and the only way in is
   * a fresh frame from the camera.
   *
   * IT IS FRICTION, NOT A CONTROL, and nothing downstream may be written as though it were. The
   * `capture` attribute is a hint a browser may ignore - desktop browsers ignore it entirely and
   * open an ordinary file dialog - some Android camera apps offer a gallery of their own, and the
   * upload goes from the browser straight to Cloudinary, so a crafted request never meets this
   * component at all. It stops the person who would have reached for an old photo because it was
   * the easy thing to do. It does not stop somebody who set out to.
   */
  cameraOnly?: boolean;
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
  cameraOnly = false,
}: ImageUploaderProps) {
  const inputId = useId();
  const cameraInputId = useId();

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

  /**
   * Where focus goes after a photo is deleted.
   *
   * Removing a photo unmounts the `<li>` containing the button that was just pressed, and a
   * focused element that leaves the document takes focus to `<body>` with it. A keyboard user
   * clearing three photos is thrown back to the top of the page three times, with no indication
   * that anything happened. So the successor is chosen *before* the list changes, and claimed
   * once the removal has rendered.
   */
  const removeButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterRemove = useRef<FocusTarget | null>(null);

  /** Focused when the last photo goes and there is no neighbour left to receive it. */
  const fileInput = useRef<HTMLInputElement>(null);

  /** The camera-only input, opened by the "Take a photo" button. */
  const cameraInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const target = focusAfterRemove.current;

    if (!target) {
      return;
    }

    focusAfterRemove.current = null;

    if (target.kind === "input") {
      fileInput.current?.focus();

      return;
    }

    // The neighbour can be gone too, if a second removal landed before this ran. The input is
    // the fallback because it is the one control on this component that always exists.
    (removeButtons.current.get(target.publicId) ?? fileInput.current)?.focus();
  }, [images]);

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
        // Cloudinary explains a rejection in `error.message` ("Invalid Signature...", "Unknown
        // API key..."). Dropping it left a misconfigured deployment reporting only that the upload
        // failed, with nothing to say whether the key, the secret or the cloud name was wrong.
        const reason = await response
          .json()
          .then(
            (payload: { error?: { message?: string } }) =>
              payload.error?.message
          )
          .catch(() => undefined);

        console.error(
          "Cloudinary rejected the upload",
          response.status,
          reason
        );
        toast.error(
          reason
            ? `Could not upload ${file.name}: ${reason}`
            : `Could not upload ${file.name}.`
        );

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

    /**
     * Decided here, against the list as it stands, not in the effect that applies it.
     *
     * The photo after this one slides into the vacated position, so focus lands where the eye
     * already is. Removing the last photo has no successor, so it steps back instead; removing
     * the only photo has neither, and the drop zone is the sensible home.
     */
    const successor = images[index + 1] ?? images[index - 1];

    focusAfterRemove.current = successor
      ? { kind: "photo", publicId: successor.publicId }
      : { kind: "input" };

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
        htmlFor={cameraOnly ? cameraInputId : inputId}
        /*
         * No drop target in camera-only mode. Leaving it would be the whole point undone: a file
         * dragged in from the desktop is exactly the old photo the camera requirement exists to
         * refuse, and it would arrive without ever touching the picker.
         */
        {...(cameraOnly
          ? {}
          : {
              onDragOver: (event: DragEvent<HTMLLabelElement>) => {
                event.preventDefault();
                setIsDragging(true);
              },
              onDragLeave: () => setIsDragging(false),
              onDrop: handleDrop,
            })}
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
          ) : cameraOnly ? (
            <CameraIcon className="size-5" />
          ) : (
            <ImagePlusIcon className="size-5" />
          )}
        </span>

        <span className="text-sm font-medium">
          {isBusy
            ? `Uploading ${pendingCount} photo${pendingCount === 1 ? "" : "s"}...`
            : cameraOnly
              ? "Take a photo of the item"
              : "Drag photos here, or click to choose"}
        </span>

        <span className="text-muted-foreground text-xs">
          {cameraOnly
            ? `Photographed now, at the handover. ${images.length} of ${max} added.`
            : `JPEG, PNG or WebP up to 15MB. ${images.length} of ${max} added.`}
        </span>

        {!cameraOnly && (
          <input
            id={inputId}
            ref={fileInput}
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
        )}
      </label>

      {/*
        Straight to the camera, for the phone in someone's hand next to the item.

        A second input rather than an attribute on the first: `capture` makes the browser skip the
        gallery entirely, so the one input could no longer pick existing photos. Single-shot, since
        a camera returns one frame per capture; `handleFiles` takes it the same way as a pick.

        Shown only on touch-first devices. A desktop browser ignores `capture` and opens the
        ordinary file picker, so there the button would be a second "choose a file" labelled
        as something else.
      */}
      {!cameraOnly && (
        <Button
          type="button"
          variant="outline"
          className="hidden self-start pointer-coarse:inline-flex"
          aria-disabled={remaining === 0 || undefined}
          onClick={() => {
            if (remaining > 0) {
              cameraInput.current?.click();
            }
          }}
        >
          <CameraIcon aria-hidden="true" />
          Take a photo
        </Button>
      )}

      {/*
        In camera-only mode this IS the control - the label above points at it, so it must be
        focusable and visible to assistive technology. Everywhere else it stays a hidden partner
        to the button, which is what `tabIndex={-1}` and `aria-hidden` are for: without them the
        camera would be a second, unlabelled tab stop next to the picker.

        Single-shot in both cases, because a camera returns one frame per capture.
      */}
      <input
        id={cameraInputId}
        ref={cameraInput}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        capture="environment"
        disabled={cameraOnly && remaining === 0}
        {...(cameraOnly ? {} : { tabIndex: -1, "aria-hidden": true })}
        className="sr-only"
        onChange={(event) => {
          void handleFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {/*
        Upload progress, announced. The same words are on screen inside the label above, but a
        label is not a live region: it names the input, and changing it tells a screen reader
        user nothing while they wait. Kept outside the `<label>` so it cannot become part of the
        input's accessible name and be read twice.
      */}
      <p aria-live="polite" className="sr-only">
        {isBusy
          ? `Uploading ${pendingCount} photo${pendingCount === 1 ? "" : "s"}.`
          : `${images.length} of ${max} photos added.`}
      </p>

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
                    /**
                     * `aria-disabled`, not `disabled` - see the note in `Button`.
                     *
                     * Moving a photo to the front disables this very button, and a disabled
                     * element cannot keep focus, so `disabled` would drop the user to
                     * `<body>` the instant the move they asked for succeeded. `move()`
                     * already refuses to run past either end, so the click that still fires
                     * does nothing.
                     */
                    aria-disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move photo ${index + 1} earlier`}
                  >
                    <ArrowLeftIcon />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-xs"
                    aria-disabled={index === images.length - 1}
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
                  ref={(node) => {
                    // Keyed by photo rather than by index: the index of any given photo changes
                    // as its neighbours move, and the map has to survive that.
                    if (node) {
                      removeButtons.current.set(image.publicId, node);
                    } else {
                      removeButtons.current.delete(image.publicId);
                    }
                  }}
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
