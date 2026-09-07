"use client";

import { Loader2Icon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";

import { removeProfileImage, updateProfileImage } from "@/actions/profile";
import { createAvatarUploadSignature } from "@/actions/uploads";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { compressImage } from "@/lib/utils/image";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
} from "@/lib/validations/listing";

interface AvatarUploaderProps {
  /** Current photo, already resolved as `avatarUrl ?? image` by the page. */
  url: string | null;
  /** Initials for the fallback circle, from `getInitials`. */
  initials: string;
  /**
   * Whether the current photo is the member's own upload.
   *
   * Governs whether "Remove" is offered at all. A picture that came from Google is not
   * ours to delete - clearing `avatarUrl` would not remove it, so a Remove button beside
   * it would appear to do nothing.
   */
  canRemove: boolean;
}

/**
 * Profile photo picker.
 *
 * Same browser -> Cloudinary -> Server Action shape as `ImageUploader`, and deliberately
 * not a reuse of it: that component is a multi-photo gallery with ordering, a cover
 * badge and a drop zone sized for ten files, and every one of those is wrong for a
 * single circular avatar. What is shared is the part that has to be - the signature
 * action, the compression step and the size and type limits.
 *
 * The public id is the only thing sent to the server; the URL comes back from Cloudinary
 * via the Admin API, so the browser never asserts which image an id resolves to.
 *
 * `router.refresh()` after each change rather than local state. The photo is rendered in
 * three places at once - here, the header avatar and the public profile - and the action
 * has already revalidated all of them, so re-rendering the server tree keeps them in
 * step where a local `useState` would leave the header stale until the next navigation.
 */
function AvatarUploader({ url, initials, canRemove }: AvatarUploaderProps) {
  const router = useRouter();
  const inputId = useId();
  const [busy, setBusy] = useState<"uploading" | "removing" | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type as never)) {
      toast.error("Choose a JPEG, PNG or WebP image.");

      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("That image is larger than 15MB.");

      return;
    }

    setBusy("uploading");

    try {
      const signature = await createAvatarUploadSignature();

      if (!signature.success) {
        toast.error(signature.error);

        return;
      }

      const compressed = await compressImage(file);

      const body = new FormData();
      body.append("file", compressed);
      body.append("api_key", signature.data.apiKey);
      body.append("timestamp", String(signature.data.timestamp));
      body.append("signature", signature.data.signature);
      // Must match the signed value exactly, or Cloudinary rejects the request.
      body.append("folder", signature.data.folder);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${signature.data.cloudName}/image/upload`,
        { method: "POST", body }
      );

      if (!response.ok) {
        toast.error("Could not upload that photo. Please try again.");

        return;
      }

      const result = (await response.json()) as { public_id?: string };

      if (!result.public_id) {
        toast.error("Cloudinary did not return a usable image.");

        return;
      }

      const saved = await updateProfileImage(result.public_id);

      if (!saved.success) {
        toast.error(saved.error);

        return;
      }

      toast.success("Profile photo updated.");
      router.refresh();
    } catch {
      toast.error("Could not upload that photo. Check your connection.");
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    setBusy("removing");

    const result = await removeProfileImage();

    setBusy(null);

    if (!result.success) {
      toast.error(result.error);

      return;
    }

    toast.success("Profile photo removed.");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar size="lg" className="size-16">
        {url && <AvatarImage src={url} alt="" />}
        <AvatarFallback className="text-base">{initials}</AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/*
            A label wrapping a real file input, as in `ImageUploader`: click, tap and
            keyboard all work through one control and the picker opens without
            JavaScript. `render` gives it the Button's appearance without nesting a
            button inside a label, which is not valid and swallows the click.
          */}
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            render={<label htmlFor={inputId} className="cursor-pointer" />}
          >
            {busy === "uploading" ? (
              <>
                <Loader2Icon className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <UploadIcon />
                {url ? "Change photo" : "Upload photo"}
              </>
            )}
          </Button>

          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => void handleRemove()}
            >
              {busy === "removing" ? "Removing..." : "Remove"}
            </Button>
          )}
        </div>

        <p className="text-muted-foreground text-xs">
          JPEG, PNG or WebP up to 15MB. Shown on your public profile and beside
          your listings.
        </p>
      </div>

      <input
        id={inputId}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        disabled={busy !== null}
        className="sr-only"
        onChange={(event) => {
          void handleFile(event.target.files?.[0]);
          // Cleared so re-selecting the same file fires `change` again; without this
          // someone who removed a photo could not re-add the identical file.
          event.target.value = "";
        }}
      />
    </div>
  );
}

export { AvatarUploader };
