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
        <AvatarFallback className="text-xs font-medium">
          {getInitials({ name })}
        </AvatarFallback>
      </Avatar>
      {isVerified && (
        <span className="bg-background absolute -right-0.5 -bottom-0.5 rounded-full">
          <BadgeCheckIcon
            className="size-4 fill-sky-500 text-white"
            aria-hidden="true"
          />
          <span className="sr-only">Verified member</span>
        </span>
      )}
    </span>
  );
}

export { MemberAvatar };
