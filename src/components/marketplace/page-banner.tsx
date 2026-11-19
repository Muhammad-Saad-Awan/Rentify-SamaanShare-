import Image from "next/image";

import { cn } from "@/lib/utils/cn";

import type { LucideIcon } from "lucide-react";
import type { StaticImageData } from "next/image";
import type { ReactNode } from "react";

interface PageBannerProps {
  title: string;
  /** Live count or summary line under the title. */
  summary: ReactNode;
  description?: string | null | undefined;
  /** Small label above the title, with an optional icon. */
  eyebrow?: string;
  eyebrowIcon?: LucideIcon;
  /** A product photograph shown to the trailing edge from `sm` up. */
  image?: StaticImageData | null;
  className?: string;
}

/**
 * The mint banner that opens a marketplace results page (browse, a category).
 *
 * Owns the page's `h1`. The photograph is decorative (empty alt) - the title names the page -
 * and is hidden on phones, where it would push the results below the fold.
 */
function PageBanner({
  title,
  summary,
  description,
  eyebrow,
  eyebrowIcon: EyebrowIcon,
  image,
  className,
}: PageBannerProps) {
  return (
    <div
      className={cn(
        "bg-brand-soft relative flex items-center justify-between gap-6 overflow-hidden rounded-3xl px-6 py-8 sm:px-10 sm:py-10",
        className
      )}
    >
      <div className="animate-fade-up flex min-w-0 flex-col gap-3">
        {eyebrow && (
          <p className="bg-card text-brand-soft-foreground flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-sm">
            {EyebrowIcon && (
              <EyebrowIcon className="size-3.5" aria-hidden="true" />
            )}
            {eyebrow}
          </p>
        )}

        <h1 className="font-heading text-3xl leading-tight font-extrabold tracking-[-0.03em] sm:text-[2.75rem]">
          {title}
        </h1>

        <p className="text-brand-soft-foreground text-sm font-semibold">
          {summary}
        </p>

        {description && (
          <p className="text-muted-foreground max-w-[60ch] text-[0.9375rem] leading-relaxed">
            {description}
          </p>
        )}
      </div>

      {image && (
        <div className="bg-card border-card shadow-soft relative hidden aspect-4/3 w-56 shrink-0 rotate-3 overflow-hidden rounded-2xl border-4 sm:block lg:w-72">
          <Image
            src={image}
            alt=""
            placeholder="blur"
            sizes="288px"
            className="size-full object-cover"
          />
        </div>
      )}
    </div>
  );
}

export { PageBanner };
