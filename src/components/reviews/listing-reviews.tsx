import { MessageSquareIcon } from "lucide-react";

import { RatingStars } from "@/components/reviews/rating-stars";
import { formatDate } from "@/lib/utils/date";

import type { OwnerReviewSummary } from "@/lib/queries/reviews";

interface ListingReviewsProps {
  reviews: OwnerReviewSummary;
  ownerName: string;
}

/**
 * What previous renters said about this owner.
 *
 * A Server Component: this is text and a rating, with nothing to interact with. Pagination is a
 * deliberate omission for now - the first five newest reviews answer "can I trust this person", and
 * a paginated control on a page that already has a gallery, a price panel and a booking form would
 * add a second reason to lose your scroll position. The count makes the total honest.
 *
 * RENDERS NOTHING WHEN THERE ARE NO REVIEWS. An empty "Reviews" heading reads as a broken section,
 * and worse, it invites the reader to conclude something negative from an absence that only means
 * the owner is new. The owner card already shows an unrated state.
 */
function ListingReviews({ reviews, ownerName }: ListingReviewsProps) {
  if (reviews.items.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-heading text-base font-medium">
          What renters say about {ownerName}
        </h2>

        {reviews.average !== null && (
          <RatingStars
            rating={reviews.average}
            count={reviews.count}
            size="md"
          />
        )}
      </div>

      <ul className="flex flex-col gap-3">
        {reviews.items.map((review) => (
          <li
            key={review.id}
            className="flex flex-col gap-1.5 rounded-lg border px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">
                {/* Name only. The query never selects an email, so there is nothing to leak. */}
                {review.reviewer.name?.trim() || "SamaanShare member"}
              </span>
              <RatingStars rating={review.rating} />
              <span className="text-muted-foreground text-xs">
                {formatDate(review.publishedAt)}
              </span>
            </div>

            {review.comment && (
              // A string, never HTML - it is user input.
              <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                {review.comment}
              </p>
            )}
          </li>
        ))}
      </ul>

      {reviews.total > reviews.items.length && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <MessageSquareIcon className="size-3.5 shrink-0" aria-hidden="true" />
          Showing the {reviews.items.length} most recent of {reviews.total}{" "}
          reviews.
        </p>
      )}
    </section>
  );
}

export { ListingReviews };
