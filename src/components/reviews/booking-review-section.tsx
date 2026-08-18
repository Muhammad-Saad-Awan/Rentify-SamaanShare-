"use client";

import { StarIcon } from "lucide-react";
import { useState } from "react";

import { RatingStars } from "@/components/reviews/rating-stars";
import { ReviewForm } from "@/components/reviews/review-form";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils/date";

import type { BookingSummary, ReviewSnapshot } from "@/lib/queries/bookings";

interface BookingReviewSectionProps {
  booking: BookingSummary;
  side: "renter" | "owner";
}

/**
 * The review block on a finished booking, for whichever side is looking.
 *
 * ONE COMPONENT FOR BOTH SIDES, and used in both dashboards, because the states are identical and
 * only the wording differs. Duplicating it would be how one side ends up still showing "leave a
 * review" after the window has closed.
 *
 * FOUR STATES, and each says something different:
 *   - nothing written, window open      -> offer the form
 *   - nothing written, window closed    -> say why it is no longer possible
 *   - written, withheld                 -> explain what it is waiting for
 *   - released                          -> show it, and the counterpart's if there is one
 *
 * The withheld state matters most. Without it a reviewer sees no trace of what they wrote and
 * reasonably concludes it was lost.
 */
function BookingReviewSection({ booking, side }: BookingReviewSectionProps) {
  const [isWriting, setIsWriting] = useState(false);
  const { canWrite, mine, counterpart } = booking.review;

  const counterpartLabel = side === "renter" ? "owner" : "renter";

  if (isWriting) {
    return (
      <ReviewForm
        bookingId={booking.id}
        side={side}
        onDone={() => setIsWriting(false)}
        onCancel={() => setIsWriting(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Nothing written yet. */}
      {!mine &&
        (canWrite.allowed ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs leading-relaxed">
              {side === "renter"
                ? "How did this rental go? Your review helps the next renter, and helps owners trust you."
                : "How was this renter? Your review helps other owners decide."}
            </p>

            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setIsWriting(true)}
            >
              <StarIcon />
              Leave a review
            </Button>
          </div>
        ) : (
          /* Explained rather than silently absent - a missing button with no reason reads as a bug. */
          <p className="text-muted-foreground text-xs leading-relaxed">
            {canWrite.reason}
          </p>
        ))}

      {/* Written, still withheld. */}
      {mine && !mine.publishedAt && (
        <div className="bg-muted/50 flex flex-col gap-1.5 rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-2">
            <RatingStars rating={mine.rating} />
            <span className="text-muted-foreground text-xs">
              your review, not yet public
            </span>
          </div>

          {mine.comment && (
            <p className="text-muted-foreground text-xs leading-relaxed">
              {mine.comment}
            </p>
          )}

          <p className="text-muted-foreground text-xs leading-relaxed">
            It becomes public once the {counterpartLabel} reviews you too, or 14
            days after the rental ended.
          </p>
        </div>
      )}

      {/* Released. */}
      {mine?.publishedAt && (
        <PublishedReview
          label="Your review"
          review={mine}
          publishedAt={mine.publishedAt}
        />
      )}

      {counterpart?.publishedAt && (
        <PublishedReview
          label={`Review from the ${counterpartLabel}`}
          review={counterpart}
          publishedAt={counterpart.publishedAt}
        />
      )}
    </div>
  );
}

interface PublishedReviewProps {
  label: string;
  review: ReviewSnapshot;
  publishedAt: Date;
}

function PublishedReview({ label, review, publishedAt }: PublishedReviewProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">{label}</span>
        <RatingStars rating={review.rating} />
        <span className="text-muted-foreground text-xs">
          {formatDate(publishedAt)}
        </span>
      </div>

      {review.comment && (
        // Rendered as a string, never as HTML - it is user input.
        <p className="text-muted-foreground text-xs leading-relaxed whitespace-pre-line">
          {review.comment}
        </p>
      )}
    </div>
  );
}

export { BookingReviewSection };
