"use client";

import { ImageOffIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils/cn";

interface ListingPhotoProps {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
}

/**
 * A listing's cover photo that degrades to the "no photo" mark when the file is gone.
 *
 * Uploaded images can disappear from storage (a cleanup job, a deleted test fixture), and a
 * dead URL otherwise renders the browser's broken-image glyph in the corner of the frame. The
 * fallback is the same mark a listing with no photo shows, so the two states look identical.
 *
 * The smallest possible client leaf: only `onError` needs the browser; the card around it
 * stays a Server Component.
 */
function ListingPhoto({
  src,
  alt,
  sizes,
  priority = false,
  className,
}: ListingPhotoProps) {
  // Keyed by `src`, so a card re-rendered with a different photo gets a fresh attempt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (failedSrc === src) {
    return <ListingPhotoFallback />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      onError={() => setFailedSrc(src)}
      className={cn("object-cover", className)}
    />
  );
}

/** Shown for a listing with no photo, or one whose photo failed to load. */
function ListingPhotoFallback() {
  return (
    <div
      className="text-muted-foreground flex h-full items-center justify-center"
      // Decorative: the absence of a photo is not information a screen reader
      // user needs announced.
      aria-hidden="true"
    >
      <ImageOffIcon className="size-6" />
    </div>
  );
}

export { ListingPhoto, ListingPhotoFallback };
