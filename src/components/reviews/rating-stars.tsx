import { StarIcon } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import { RATING_MAX } from "@/lib/reviews/rules";

interface RatingStarsProps {
  /** 1-5. Fractional values are rounded for display; the number is shown alongside. */
  rating: number;
  /** Shown after the stars, e.g. "4.3 (12)". Omitted when there is nothing to count. */
  count?: number;
  size?: "sm" | "md";
  className?: string;
}

/**
 * A rating, read-only.
 *
 * THE STARS ARE DECORATIVE AND THE NUMBER IS THE CONTENT. Five icons are `aria-hidden` and a single
 * text node carries "4.3 out of 5 from 12 reviews" - because a screen reader announcing five
 * separate star images conveys nothing, and the shape of a half-filled row is not information
 * anyone can act on without the figure.
 *
 * Rounds for the fill only. `ratingAggregate` stores two decimal places, and rounding the displayed
 * *number* would make 4.25 and 4.34 both read as "4.3" while sorting differently on the browse page.
 */
function RatingStars({
  rating,
  count,
  size = "sm",
  className,
}: RatingStarsProps) {
  const filled = Math.round(rating);
  const starSize = size === "md" ? "size-4" : "size-3.5";

  const label =
    count === undefined
      ? `${rating} out of ${RATING_MAX}`
      : `${rating} out of ${RATING_MAX} from ${count} ${count === 1 ? "review" : "reviews"}`;

  return (
    <span className={cn("flex items-center gap-1", className)}>
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {Array.from({ length: RATING_MAX }, (_, index) => (
          <StarIcon
            key={index}
            className={cn(
              starSize,
              index < filled
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground/30"
            )}
          />
        ))}
      </span>

      <span className="text-muted-foreground text-xs tabular-nums">
        {rating}
        {count !== undefined && ` (${count})`}
      </span>

      <span className="sr-only">{label}</span>
    </span>
  );
}

export { RatingStars };
