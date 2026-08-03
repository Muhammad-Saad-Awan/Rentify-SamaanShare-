"use client";

import { ImageOffIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils/cn";

interface ListingGalleryProps {
  images: readonly { id: string; url: string }[];
  /** Used as the alt text, since the photograph is of the listed item. */
  title: string;
}

/**
 * Main image plus a thumbnail strip.
 *
 * A Client Component only because selecting a thumbnail is local state. There is
 * no lightbox: the main image is already rendered at a useful size, and a modal
 * viewer means a focus trap, a scroll lock and an escape handler to get right -
 * scope that belongs with its own pass rather than bolted on here.
 *
 * The thumbnails are real buttons in a labelled group, not clickable divs, so the
 * strip is reachable by keyboard and each thumbnail announces which image it
 * selects.
 */
function ListingGallery({ images, title }: ListingGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div
        className="bg-muted text-muted-foreground flex aspect-4/3 w-full items-center justify-center rounded-xl"
        // Decorative: the absence of a photo is not information a screen reader
        // user needs announced.
        aria-hidden="true"
      >
        <ImageOffIcon className="size-8" />
      </div>
    );
  }

  // Clamped rather than asserted: `images` can shrink between renders if the page
  // revalidates, and an out-of-range index would blank the gallery.
  const active = images[Math.min(activeIndex, images.length - 1)] ?? images[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-muted relative aspect-4/3 w-full overflow-hidden rounded-xl">
        {active && (
          <Image
            src={active.url}
            alt={title}
            fill
            // The gallery is half the width of a large viewport and full width
            // below `lg`, so the browser is told that rather than guessing.
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
            // The only above-the-fold image on this page, so it is the LCP
            // candidate and worth preloading.
            priority
          />
        )}
      </div>

      {/*
        Hidden for a single image: a one-item picker implies there is something to
        pick between.
      */}
      {images.length > 1 && (
        <div
          role="group"
          aria-label={`${images.length} photos of ${title}`}
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {images.map((image, index) => {
            const isActive = image.id === active?.id;

            return (
              <button
                key={image.id}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Show photo ${index + 1} of ${images.length}`}
                /**
                 * `aria-current`, not `aria-pressed`.
                 *
                 * These thumbnails are mutually exclusive - one photo is shown at a time -
                 * and `aria-pressed` on every button describes a row of independent toggles,
                 * which is not what this is. `aria-current="true"` means "the current item
                 * in a set", which is exactly the relationship. The availability calendar
                 * still uses `aria-pressed`, correctly: blocking a day IS a toggle.
                 */
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "focus-visible:ring-ring relative size-16 shrink-0 overflow-hidden rounded-lg transition-[box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  isActive
                    ? "ring-primary ring-2"
                    : "ring-foreground/10 hover:ring-foreground/30 ring-1"
                )}
              >
                <Image
                  src={image.url}
                  // Empty alt: the button's own label already describes it, and a
                  // duplicate would be read twice.
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { ListingGallery };
