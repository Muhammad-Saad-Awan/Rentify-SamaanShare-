"use client";

import { Loader2Icon, StarIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { createReview } from "@/actions/reviews";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import { RATING_MAX, REVIEW_COMMENT_MAX } from "@/lib/reviews/rules";

interface ReviewFormProps {
  bookingId: string;
  /** Which side the viewer is on - only affects the wording. */
  side: "renter" | "owner";
  onDone?: () => void;
  onCancel: () => void;
}

/**
 * Writing a review.
 *
 * THE RATING IS BUTTONS, NOT A SELECT. Five options that must be comparable at a glance is exactly
 * what a radio group is for, and stars are the convention people already read. Each is a real
 * `<button>` inside a `radiogroup`, so it is keyboard reachable and announced with its value - a row
 * of clickable icons with no roles is the usual version of this and is unusable without a mouse.
 *
 * NO RATING IS PRESELECTED. A default of 5 would be answered by inertia, and a review feature whose
 * average is manufactured by its own default is worse than none. Submit stays disabled until a
 * deliberate choice is made.
 */
function ReviewForm({ bookingId, side, onDone, onCancel }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const prompt =
    side === "renter"
      ? "How was the item and the owner?"
      : "How was the renter to deal with?";

  async function submit() {
    if (rating === 0) {
      return;
    }

    setIsSubmitting(true);

    const result = await createReview({
      bookingId,
      rating,
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    });

    setIsSubmitting(false);

    if (!result.success) {
      toast.error(result.error);

      return;
    }

    /**
     * Two different messages, because the outcome genuinely differs.
     *
     * The first reviewer's is withheld until the other side writes theirs; saying "published" would
     * be false, and saying nothing would leave them wondering why it is not visible.
     */
    toast.success(
      result.data.published
        ? "Review posted. Both reviews are now public."
        : "Review saved. It becomes public once the other person reviews too, or after 14 days."
    );

    onDone?.();
  }

  return (
    <div className="bg-muted/50 flex flex-col gap-3 rounded-lg px-3 py-3">
      <p className="text-xs font-medium">{prompt}</p>

      <div
        role="radiogroup"
        aria-label="Rating out of 5"
        className="flex items-center gap-1"
      >
        {Array.from({ length: RATING_MAX }, (_, index) => index + 1).map(
          (value) => {
            const selected = value <= rating;

            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} star${value === 1 ? "" : "s"}`}
                onClick={() => setRating(value)}
                disabled={isSubmitting}
                className="focus-visible:ring-ring rounded outline-none focus-visible:ring-2 disabled:opacity-50"
              >
                <StarIcon
                  className={cn(
                    "size-6 transition-colors",
                    selected
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/40"
                  )}
                  aria-hidden="true"
                />
              </button>
            );
          }
        )}

        {rating > 0 && (
          <span className="text-muted-foreground ml-1.5 text-xs">
            {rating} of {RATING_MAX}
          </span>
        )}
      </div>

      <Textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={REVIEW_COMMENT_MAX}
        rows={3}
        placeholder="Optional — what should the next person know?"
        disabled={isSubmitting}
        aria-label="Review comment"
      />

      <p className="text-muted-foreground text-xs leading-relaxed">
        Your review stays hidden until the other person has written theirs, so
        neither of you can react to the other.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={submit}
          disabled={isSubmitting || rating === 0}
          aria-busy={isSubmitting}
        >
          {isSubmitting && <Loader2Icon className="animate-spin" />}
          Post review
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Not now
        </Button>
      </div>
    </div>
  );
}

export { ReviewForm };
