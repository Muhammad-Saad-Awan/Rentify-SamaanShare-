"use client";

import {
  CheckCircle2Icon,
  ClockIcon,
  HandshakeIcon,
  Loader2Icon,
  MinusCircleIcon,
  XCircleIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createBookingRequest } from "@/actions/bookings";
import { respondToOffer, withdrawOffer } from "@/actions/chat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OfferStatus } from "@/generated/prisma/enums";
import { calculateRentalPrice, countRentalDays } from "@/lib/bookings/pricing";
import { ACCEPTED_OFFER_VALID_HOURS, toCalendarDay } from "@/lib/chat/offers";
import { cn } from "@/lib/utils/cn";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

import type { RateCard } from "@/lib/bookings/pricing";
import type { OfferView } from "@/lib/queries/chat";

/** What an offer card needs to know about the conversation it sits in. */
export interface OfferContext {
  listingId: string;
  /** Only the renter can book with an accepted offer. */
  viewerIsRenter: boolean;
  /** The market's today, `YYYY-MM-DD`, resolved on the server. */
  today: string;
  /** The listing's rates, to show how an offer compares. Absent where that is not wanted. */
  rates?: RateCard;
}

const HOUR_MS = 3_600_000;

type BadgeVariant =
  "success" | "warning" | "secondary" | "outline" | "destructive";

/**
 * How each state reads in the card's header pill. An icon and a word on every one, so the state
 * never rests on colour: emerald only for an agreement, the destructive tint only for a refusal,
 * and the closed states quiet.
 */
const STATUS: Record<
  OfferStatus,
  { label: string; variant: BadgeVariant; icon: typeof ClockIcon }
> = {
  [OfferStatus.PENDING]: {
    label: "Awaiting answer",
    variant: "secondary",
    icon: ClockIcon,
  },
  [OfferStatus.ACCEPTED]: {
    label: "Accepted",
    variant: "success",
    icon: CheckCircle2Icon,
  },
  [OfferStatus.DECLINED]: {
    label: "Declined",
    variant: "destructive",
    icon: XCircleIcon,
  },
  [OfferStatus.WITHDRAWN]: {
    label: "Withdrawn",
    variant: "outline",
    icon: MinusCircleIcon,
  },
  [OfferStatus.SUPERSEDED]: {
    label: "Replaced",
    variant: "outline",
    icon: MinusCircleIcon,
  },
  [OfferStatus.EXPIRED]: {
    label: "Expired",
    variant: "outline",
    icon: ClockIcon,
  },
};

/**
 * An open offer seen by the person who must answer it. The one state that asks something of the
 * reader, so it gets the warning treatment - "your move", not "something is wrong".
 */
const NEEDS_ANSWER = {
  label: "Needs your answer",
  variant: "warning",
  icon: ClockIcon,
} as const;

/** "2 days", "5 hours", "under an hour" - how long is left to answer. */
function remaining(until: Date, now: number): string {
  const hours = Math.floor((until.getTime() - now) / HOUR_MS);

  if (hours >= 48) return `${Math.floor(hours / 24)} days`;
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"}`;

  return "under an hour";
}

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
  /** Which button started the pending work, so only that one shows the spinner. */
  const [busyWith, setBusyWith] = useState<
    "accept" | "decline" | "withdraw" | "book" | null
  >(null);

  if (!offer) {
    return (
      <div
        role="status"
        className="bg-card text-muted-foreground shadow-soft flex w-full max-w-sm items-center gap-2 rounded-2xl border px-4 py-4 text-sm"
      >
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Loading offer…
      </div>
    );
  }

  const current = offer;
  const now = Date.now();
  const isRecipient = current.recipientId === viewerId;
  const isProposer = current.proposedById === viewerId;
  const isOpen = current.status === OfferStatus.PENDING;
  const isAccepted = current.status === OfferStatus.ACCEPTED;
  const isClosed = !isOpen && !isAccepted;
  const needsAnswer = isOpen && isRecipient;
  const status = needsAnswer ? NEEDS_ANSWER : STATUS[current.status];
  const StatusIcon = status.icon;

  const startDay = toCalendarDay(current.startDate);
  const endDay = toCalendarDay(current.endDate);
  const days = countRentalDays(startDay, endDay);
  const listingTotal = context.rates
    ? calculateRentalPrice(days, context.rates).total
    : null;
  const saving =
    listingTotal && listingTotal > current.totalPrice
      ? Math.round(((listingTotal - current.totalPrice) / listingTotal) * 100)
      : 0;

  const bookable =
    isAccepted &&
    context.viewerIsRenter &&
    current.bookingId === null &&
    current.agreedByBookingId === null &&
    current.respondedAt !== null &&
    now - current.respondedAt.getTime() <
      ACCEPTED_OFFER_VALID_HOURS * HOUR_MS &&
    startDay >= context.today;

  function act(
    which: "accept" | "decline" | "withdraw",
    label: string,
    run: () => Promise<{ success: boolean; error?: string }>
  ) {
    setBusyWith(which);
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

  function book() {
    setBusyWith("book");
    startTransition(async () => {
      const result = await createBookingRequest({
        listingId: context.listingId,
        startDate: startDay,
        endDate: endDay,
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

  const heading =
    proposerName === "You" ? "Your offer" : `${proposerName}'s offer`;

  const spinner = (which: typeof busyWith) =>
    isPending && busyWith === which ? (
      <Loader2Icon className="animate-spin" aria-hidden="true" />
    ) : null;

  return (
    <article
      aria-label={heading}
      className={cn(
        "bg-card shadow-soft w-full max-w-sm overflow-hidden rounded-2xl border",
        // Semantic tokens, not raw emerald/amber: the edge says "agreed" or "your move", and
        // the status pill in the header says it in words with an icon - never the colour alone.
        isAccepted && "border-success",
        needsAnswer && "border-warning"
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <p className="font-heading flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight">
          <span
            className="bg-brand-soft text-brand flex size-7 shrink-0 items-center justify-center rounded-full"
            aria-hidden="true"
          >
            <HandshakeIcon className="size-3.5" />
          </span>
          <span className="truncate">{heading}</span>
        </p>
        <Badge variant={status.variant} className="shrink-0">
          <StatusIcon aria-hidden="true" />
          {status.label}
        </Badge>
      </header>

      <div className="flex flex-col gap-4 px-4 py-4">
        {/* The headline is the rent; a closed offer's is struck through, since it no longer
            stands - its pill says why. Muted rather than faded, so it stays readable. */}
        <div className="flex flex-col gap-0.5">
          <p className="text-muted-foreground text-xs">Total rent</p>
          <p
            className={cn(
              "font-heading text-2xl font-bold tracking-tight tabular-nums",
              isClosed && "text-muted-foreground line-through decoration-1"
            )}
          >
            {formatPKR(current.totalPrice)}
          </p>
          <p className="text-muted-foreground text-xs">
            {formatPKR(Math.round(current.totalPrice / days))} per day
            {saving > 0 && (
              <span className="text-foreground font-medium">
                {" "}
                · {saving}% below listing price
              </span>
            )}
          </p>
        </div>

        <dl className="bg-muted/60 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 rounded-xl px-3.5 py-3 text-sm">
          <dt className="text-muted-foreground">Dates</dt>
          <dd className="text-right">
            {formatDate(current.startDate)} to {formatDate(current.endDate)}
            <span className="text-muted-foreground block text-xs">
              {days} day{days === 1 ? "" : "s"}
            </span>
          </dd>
          <dt className="text-muted-foreground">Deposit</dt>
          <dd className="text-right tabular-nums">
            {current.securityDeposit === 0 ? (
              "No deposit"
            ) : (
              <>
                {formatPKR(current.securityDeposit)}
                <span className="text-muted-foreground block text-xs">
                  Refundable
                </span>
              </>
            )}
          </dd>
        </dl>

        {isOpen && (
          <p
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium",
              needsAnswer
                ? "bg-warning-soft text-warning-soft-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            <ClockIcon className="size-3.5 shrink-0" aria-hidden="true" />
            {isRecipient ? "Answer" : "Expires"} within{" "}
            {remaining(current.expiresAt, now)}.
          </p>
        )}

        <p className="text-muted-foreground text-xs leading-relaxed">
          {current.agreedByBookingId
            ? "These terms are now on a booking."
            : current.bookingId
              ? "For your existing booking - accepting changes its rent and deposit."
              : isAccepted
                ? bookable
                  ? `Agreed. Request the booking within ${ACCEPTED_OFFER_VALID_HOURS} hours of acceptance.`
                  : "Agreed before booking."
                : "Before booking. Once accepted, the renter can book these dates at these terms."}
        </p>

        {needsAnswer && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={() =>
                act("accept", "Offer accepted.", () =>
                  respondToOffer({ offerId: current.id, response: "accept" })
                )
              }
              aria-busy={isPending}
              disabled={isPending}
            >
              {spinner("accept")}
              Accept
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                act("decline", "Offer declined.", () =>
                  respondToOffer({ offerId: current.id, response: "decline" })
                )
              }
              disabled={isPending}
            >
              {spinner("decline")}
              Decline
            </Button>
          </div>
        )}

        {isOpen && isProposer && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              act("withdraw", "Offer withdrawn.", () =>
                withdrawOffer({ offerId: current.id })
              )
            }
            disabled={isPending}
          >
            {spinner("withdraw")}
            Withdraw offer
          </Button>
        )}

        {bookable && (
          <Button
            type="button"
            onClick={book}
            aria-busy={isPending}
            disabled={isPending}
          >
            {spinner("book")}
            Request booking at these terms
          </Button>
        )}
      </div>
    </article>
  );
}

export { OfferCard };
