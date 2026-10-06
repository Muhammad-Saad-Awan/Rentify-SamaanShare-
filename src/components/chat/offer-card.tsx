"use client";

import { HandshakeIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { createBookingRequest } from "@/actions/bookings";
import { respondToOffer, withdrawOffer } from "@/actions/chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OfferStatus } from "@/generated/prisma/enums";
import { ACCEPTED_OFFER_VALID_HOURS, toCalendarDay } from "@/lib/chat/offers";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate, formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";

import type { OfferView } from "@/lib/queries/chat";

/** What an offer card needs to know about the conversation it sits in. */
export interface OfferContext {
  listingId: string;
  /** Only the renter can book with an accepted offer. */
  viewerIsRenter: boolean;
  /** The market's today, `YYYY-MM-DD`, resolved on the server. */
  today: string;
}

const STATUS_LABELS: Record<OfferStatus, string> = {
  [OfferStatus.PENDING]: "Awaiting answer",
  [OfferStatus.ACCEPTED]: "Accepted",
  [OfferStatus.DECLINED]: "Declined",
  [OfferStatus.WITHDRAWN]: "Withdrawn",
  [OfferStatus.SUPERSEDED]: "Replaced by a newer offer",
  [OfferStatus.EXPIRED]: "Expired",
};

const HOUR_MS = 3_600_000;

interface OfferCardProps {
  offer: OfferView | null;
  viewerId: string;
  /** "You", or the other member's name. */
  proposerName: string;
  context: OfferContext;
}

/**
 * Proposed rental terms, and the only buttons in chat that change money.
 *
 * Everything shown comes from the Offer row the server rendered - `status` is already the effective
 * one, so an offer past its deadline reads as expired without a write. The buttons only ask; every
 * rule is enforced again by the action, and again by the database.
 *
 * `null` while the OFFER message has arrived by realtime but the refresh carrying its offer has not.
 */
function OfferCard({ offer, viewerId, proposerName, context }: OfferCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!offer) {
    return (
      <div className="bg-muted/50 text-muted-foreground flex w-full max-w-sm items-center gap-2 rounded-xl border px-3 py-3 text-sm">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Loading offer…
      </div>
    );
  }

  const current = offer;
  const isRecipient = current.recipientId === viewerId;
  const isProposer = current.proposedById === viewerId;
  const isOpen = current.status === OfferStatus.PENDING;
  const isAccepted = current.status === OfferStatus.ACCEPTED;

  const startDay = toCalendarDay(current.startDate);
  const bookable =
    isAccepted &&
    context.viewerIsRenter &&
    current.bookingId === null &&
    current.agreedByBookingId === null &&
    current.respondedAt !== null &&
    Date.now() - current.respondedAt.getTime() <
      ACCEPTED_OFFER_VALID_HOURS * HOUR_MS &&
    startDay >= context.today;

  function act(
    label: string,
    run: () => Promise<{ success: boolean; error?: string }>
  ) {
    startTransition(async () => {
      const result = await run();

      if (!result.success) {
        toast.error(result.error ?? "Something went wrong. Please try again.");

        return;
      }

      toast.success(label);
      router.refresh();
    });
  }

  function respond(response: "accept" | "decline") {
    act(response === "accept" ? "Offer accepted." : "Offer declined.", () =>
      respondToOffer({ offerId: current.id, response })
    );
  }

  function withdraw() {
    act("Offer withdrawn.", () => withdrawOffer({ offerId: current.id }));
  }

  function book() {
    startTransition(async () => {
      const result = await createBookingRequest({
        listingId: context.listingId,
        startDate: startDay,
        endDate: toCalendarDay(current.endDate),
        offerId: current.id,
      });

      if (!result.success) {
        toast.error(result.error);

        return;
      }

      toast.success("Booking requested on the agreed terms.");
      router.push("/dashboard/bookings");
    });
  }

  return (
    <div
      className={cn(
        "bg-card flex w-full max-w-sm flex-col gap-3 rounded-xl border px-3 py-3",
        isAccepted && "border-primary/40"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <HandshakeIcon className="size-4" aria-hidden="true" />
          {proposerName === "You" ? "Your offer" : `${proposerName}'s offer`}
        </p>
        <Badge
          variant={isAccepted ? "default" : isOpen ? "secondary" : "outline"}
        >
          {STATUS_LABELS[current.status]}
        </Badge>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Dates</dt>
        <dd>
          {formatDate(current.startDate)} to {formatDate(current.endDate)}
        </dd>
        <dt className="text-muted-foreground">Rent</dt>
        <dd className="font-medium tabular-nums">
          {formatPKR(current.totalPrice)}
        </dd>
        <dt className="text-muted-foreground">Deposit</dt>
        <dd className="tabular-nums">
          {current.securityDeposit === 0
            ? "None"
            : formatPKR(current.securityDeposit)}
        </dd>
      </dl>

      <p className="text-muted-foreground text-xs leading-relaxed">
        {current.bookingId
          ? "For an existing booking. Accepting changes its rent and deposit."
          : "Before booking. Once accepted, the renter can book these dates at these terms."}
        {isOpen && ` Answer by ${formatDateTime(current.expiresAt)}.`}
        {current.agreedByBookingId && " These terms are now on a booking."}
      </p>

      {isOpen && isRecipient && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => respond("accept")}
            aria-busy={isPending}
            disabled={isPending}
          >
            Accept
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => respond("decline")}
            disabled={isPending}
          >
            Decline
          </Button>
        </div>
      )}

      {isOpen && isProposer && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          onClick={withdraw}
          disabled={isPending}
        >
          Withdraw offer
        </Button>
      )}

      {bookable && (
        <Button
          type="button"
          size="sm"
          className="self-start"
          onClick={book}
          aria-busy={isPending}
          disabled={isPending}
        >
          {isPending && <Loader2Icon className="animate-spin" />}
          Request booking at these terms
        </Button>
      )}
    </div>
  );
}

export { OfferCard };
