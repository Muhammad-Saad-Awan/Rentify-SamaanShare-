import { CircleDotIcon } from "lucide-react";

import { HandoverType } from "@/generated/prisma/enums";
import { buildBookingTimeline } from "@/lib/bookings/timeline";
import { CLAIM_REASON_LABELS } from "@/lib/claims/rules";
import {
  HANDOVER_CONDITION_LABELS,
  handoverStanding,
} from "@/lib/handover/rules";
import { formatPKR } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";

import type { AdminBookingDetail } from "@/lib/queries/admin-bookings";
import type { BookingTimelineExtra } from "@/lib/bookings/timeline";

interface BookingTimelineProps {
  booking: AdminBookingDetail;
}

/**
 * Everything recorded about one booking, oldest first.
 *
 * A Server Component. `buildBookingTimeline` is pure and does the ordering and the honesty about
 * missing timestamps; this file owns the copy, which is why the handover, claim and review entries
 * are composed here rather than in the query - a query module that writes sentences ends up being
 * where the wording lives for screens it has never seen.
 *
 * AN APPROXIMATE ENTRY SAYS SO. There is no `declinedAt` or `expiredAt` column, so those entries
 * carry the row's `updatedAt`, and this labels them "as last changed". An administrator reading a
 * deposit dispute is the person most likely to quote a time back to somebody, and a confidently
 * wrong one does real damage.
 */
function BookingTimeline({ booking }: BookingTimelineProps) {
  const entries = buildBookingTimeline({
    status: booking.status,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
    startedAt: booking.startedAt,
    completedAt: booking.completedAt,
    cancelledAt: booking.cancelledAt,
    cancelledByRole: booking.cancelledByRole,
    statusReason: booking.statusReason,
    paymentConfirmedAt: booking.paymentDetail?.confirmedAt ?? null,
    depositReturnedAt: booking.paymentDetail?.depositReturnedAt ?? null,
    extra: relatedEvents(booking),
  });

  return (
    <ol className="flex flex-col gap-2.5">
      {entries.map((entry, index) => (
        <li
          // `kind` is not unique - a booking can carry two handover records - so the index is part
          // of the key. Safe here: the list is server-rendered in a fixed order and never reordered.
          key={`${entry.kind}-${index}`}
          className="flex gap-2.5 text-sm"
        >
          <CircleDotIcon
            className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{entry.label}</span>
              <span className="text-muted-foreground text-xs">
                {formatDateTime(entry.at)}
                {entry.approximate && " — as last changed, not a recorded time"}
              </span>
            </div>
            {entry.detail && (
              // A string, never HTML - somebody typed it.
              <p className="text-muted-foreground text-xs leading-relaxed whitespace-pre-line">
                {entry.detail}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * The handover, claim and review milestones, as timeline events.
 *
 * Reduced to text here so `buildBookingTimeline` stays pure and knows nothing about handovers or
 * claims. Each one carries the fact a dispute turns on - the condition recorded, whether the other
 * party agreed, how much was claimed and what was upheld - rather than just that something happened.
 */
function relatedEvents(booking: AdminBookingDetail): BookingTimelineExtra[] {
  const events: BookingTimelineExtra[] = [];

  for (const handover of booking.handovers) {
    const side = handover.type === HandoverType.PICKUP ? "Pickup" : "Return";

    events.push({
      kind: `handover-${handover.id}`,
      at: handover.recordedAt,
      label: `${side} condition recorded: ${HANDOVER_CONDITION_LABELS[handover.condition]}`,
      detail: [
        `By ${handover.recordedBy.name?.trim() || "an unnamed member"} — ${handoverStanding(handover.confirmation)}`,
        handover.notes,
        handover.confirmationNote,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    // The counterparty's answer is its own event, because it happened at its own time - often days
    // later - and a dispute is precisely a disagreement about the gap between the two.
    if (handover.confirmedAt) {
      events.push({
        kind: `handover-answer-${handover.id}`,
        at: handover.confirmedAt,
        label: `${side} record ${handoverStanding(handover.confirmation)} by the other party`,
        detail: handover.confirmationNote,
      });
    }
  }

  if (booking.claim) {
    const claim = booking.claim;

    events.push({
      kind: "claim-filed",
      at: claim.filedAt,
      label: `Deposit claim filed: ${CLAIM_REASON_LABELS[claim.reason]}, ${formatPKR(claim.amountClaimed)}`,
      detail: `By ${claim.claimant.name?.trim() || "an unnamed member"}\n${claim.description}`,
    });

    if (claim.respondedAt) {
      events.push({
        kind: "claim-answered",
        at: claim.respondedAt,
        label: "Claim answered by the renter",
        detail: claim.responseNote,
      });
    }

    if (claim.resolvedAt) {
      events.push({
        kind: "claim-resolved",
        at: claim.resolvedAt,
        label:
          claim.amountUpheld === null
            ? "Claim closed with nothing settled"
            : `Claim settled at ${formatPKR(claim.amountUpheld)}`,
        detail: [
          claim.resolvedBy?.name ? `Decided by ${claim.resolvedBy.name}` : null,
          claim.resolution,
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }
  }

  for (const review of booking.reviews) {
    /**
     * Reviews appear at the time they were WRITTEN, not published.
     *
     * Reciprocal withholding delays when the other party can read one; it does not change when
     * somebody said it, and for a dispute the writing is the event. The withheld state is stated in
     * the detail line instead - see the note on `AdminBookingReview` for why an administrator sees
     * these at all.
     */
    events.push({
      kind: `review-${review.id}`,
      at: review.createdAt,
      label: `Review written by ${review.reviewer.name?.trim() || "an unnamed member"}: ${review.rating}/5`,
      detail: [
        review.removedAt
          ? `Removed by moderation ${formatDateTime(review.removedAt)}`
          : review.publishedAt
            ? null
            : "Still withheld pending the counterpart review",
        review.comment,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  return events;
}

export { BookingTimeline };
