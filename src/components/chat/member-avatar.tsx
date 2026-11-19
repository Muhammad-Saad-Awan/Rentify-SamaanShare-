import { BadgeCheckIcon } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";
import { getInitials } from "@/lib/utils/user";

interface MemberAvatarProps {
  name: string | null;
  image: string | null;
  /** Shows the verified tick - identity confirmed by SamaanShare. */
  isVerified?: boolean;
  className?: string;
}

/**
 * A member's photo or initials, with the verified tick when it applies.
 *
 * Decorative: the name is always written beside it, so the image has empty alt text and the tick
 * carries its meaning in a screen-reader label rather than in colour alone.
 */
function MemberAvatar({
  name,
  image,
  isVerified = false,
  className,
}: MemberAvatarProps) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <Avatar className="size-full">
        {image && <AvatarImage src={image} alt="" />}
        {/* Mint initials (brand-soft-foreground on brand-soft, 6.78:1) - the theme's soft surface, so a member
            without a photo still reads as a person rather than a blank grey disc. */}
        <AvatarFallback className="bg-brand-soft text-brand-soft-foreground text-xs font-semibold">
          {getInitials({ name })}
        </AvatarFallback>
      </Avatar>
      {isVerified && (
        <span className="bg-background absolute -right-0.5 -bottom-0.5 rounded-full">
          <BadgeCheckIcon
            className="fill-brand text-brand-foreground size-4"
            aria-hidden="true"
          />
          <span className="sr-only">Verified member</span>
        </span>
      )}
    </span>
  );
}

export { MemberAvatar };
