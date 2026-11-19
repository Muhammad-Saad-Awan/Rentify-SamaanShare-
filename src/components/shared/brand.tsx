import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils/cn";

import logoMarkLight from "../../../public/images/logo-mark-light.png";
import logoMark from "../../../public/images/logo-mark.png";

interface BrandProps {
  /**
   * Where the wordmark points. Required rather than defaulted, because the two
   * shells disagree: the marketing header returns to `/`, the authenticated
   * sidebar returns to the app. A default would quietly be wrong in one of them.
   */
  href: string;
  /**
   * `inverted` for a dark surface (the footer). The mark switches to its light variant - white
   * hand, bright emerald - because the navy hand would vanish into navy, and the emerald half of
   * the name is dropped, since emerald on navy is 2.66:1.
   */
  tone?: "default" | "inverted";
  className?: string;
}

/**
 * The SamaanShare wordmark: the hands-and-parcel mark, "Samaan" in navy, "Share" in emerald.
 *
 * One implementation for both shells - the public header and the dashboard rail
 * - so the logo cannot drift between signed-out and signed-in views.
 * `DashboardBrand` wraps this with the sidebar's focus-ring token.
 *
 * The mark is a transparent PNG cut from the supplied artwork and recoloured to the brand
 * tokens (navy #142B3B, emerald #047857 / #059669). It is sized in `em`, so it scales with
 * whatever text size a call site gives the wordmark. Its alt is empty: the visible name
 * beside it is the link's accessible name, and "SamaanShare logo SamaanShare" helps no one.
 *
 * The name is split into two spans for colour only; it still reads as one word to
 * assistive tech because there is no whitespace between them.
 */
function Brand({ href, tone = "default", className }: BrandProps) {
  const isInverted = tone === "inverted";

  return (
    <Link
      href={href}
      className={cn(
        "focus-visible:ring-ring font-heading group/brand flex items-center gap-2 rounded-lg text-[1.25rem] font-bold tracking-[-0.03em] transition-opacity outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2",
        className
      )}
    >
      <Image
        src={isInverted ? logoMarkLight : logoMark}
        alt=""
        // Rendered at ~35px; 64 covers 2x screens without shipping the 256px master.
        width={64}
        height={64}
        priority
        className="size-[1.75em] shrink-0 transition-transform duration-500 ease-out group-hover/brand:rotate-[-8deg]"
      />
      <span>
        Samaan
        <span className={isInverted ? undefined : "text-brand"}>Share</span>
      </span>
    </Link>
  );
}

export { Brand };
