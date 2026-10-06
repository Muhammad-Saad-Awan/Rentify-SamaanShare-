"use client";

import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  ClockIcon,
  HandshakeIcon,
  Loader2Icon,
  ShieldIcon,
  XCircleIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { createBookingRequest } from "@/actions/bookings";
import { respondToOffer, withdrawOffer } from "@/actions/chat";
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

const STATUS: Record<
  OfferStatus,
  { label: string; className: string; icon: typeof ClockIcon }
> = {
  [OfferStatus.PENDING]: {
    label: "Awaiting answer",
    className:
      "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    icon: ClockIcon,
  },
  [OfferStatus.ACCEPTED]: {
    label: "Accepted",
    className:
      "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    icon: CheckCircle2Icon,
  },
  [OfferStatus.DECLINED]: {
    label: "Declined",
    className: "bg-muted text-muted-foreground",
    icon: XCircleIcon,
  },
  [OfferStatus.WITHDRAWN]: {
    label: "Withdrawn",
    className: "bg-muted text-muted-foreground",
    icon: XCircleIcon,
  },
  [OfferStatus.SUPERSEDED]: {
    label: "Replaced",
    className: "bg-muted text-muted-foreground",
    icon: XCircleIcon,
  },
  [OfferStatus.EXPIRED]: {
    label: "Expired",
    className: "bg-muted text-muted-foreground",
    icon: ClockIcon,
  },
};

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

  if (!offer) {
    return (
      <div className="bg-card text-muted-foreground flex w-full max-w-sm items-center gap-2 rounded-2xl border px-4 py-4 text-sm">
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
  const status = STATUS[current.status];
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

  function book() {
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

  return (
    <article
      aria-label={heading}
      className={cn(
        "bg-card w-full max-w-sm overflow-hidden rounded-2xl border shadow-xs",
        isAccepted && "border-emerald-300 dark:border-emerald-800",
        isOpen && isRecipient && "border-amber-300 dark:border-amber-800",
        isClosed && "opacity-75"
      )}
    >
      <header className="bg-muted/60 flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
          <HandshakeIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{heading}</span>
        </p>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
            status.className
          )}
        >
          <StatusIcon className="size-3.5" aria-hidden="true" />
          {status.label}
        </span>
      </header>

      <div className="flex flex-col gap-3 px-4 py-3.5">
        <div>
          <p className="font-heading text-2xl font-semibold tabular-nums">
            {formatPKR(current.totalPrice)}
          </p>
          <p className="text-muted-foreground text-xs">
            {days} day{days === 1 ? "" : "s"} ·{" "}
            {formatPKR(Math.round(current.totalPrice / days))} per day
            {saving > 0 && (
              <span className="text-emerald-700 dark:text-emerald-300">
                {" "}
                · {saving}% below listing price
              </span>
            )}
          </p>
        </div>

        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-center gap-2">
            <dt>
              <CalendarDaysIcon
                className="text-muted-foreground size-4"
                aria-hidden="true"
              />
              <span className="sr-only">Dates</span>
            </dt>
            <dd>
              {formatDate(current.startDate)} to {formatDate(current.endDate)}
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt>
              <ShieldIcon
                className="text-muted-foreground size-4"
                aria-hidden="true"
              />
              <span className="sr-only">Security deposit</span>
            </dt>
            <dd className="tabular-nums">
              {current.securityDeposit === 0
                ? "No deposit"
                : `${formatPKR(current.securityDeposit)} refundable deposit`}
            </dd>
          </div>
        </dl>

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
          {isOpen && (
            <span className="text-foreground font-medium">
              {" "}
              {isRecipient ? "Answer" : "Expires"} within{" "}
              {remaining(current.expiresAt, now)}.
            </span>
          )}
        </p>

        {isOpen && isRecipient && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={() =>
                act("Offer accepted.", () =>
                  respondToOffer({ offerId: current.id, response: "accept" })
                )
              }
              aria-busy={isPending}
              disabled={isPending}
            >
              Accept
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                act("Offer declined.", () =>
                  respondToOffer({ offerId: current.id, response: "decline" })
                )
              }
              disabled={isPending}
            >
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
              act("Offer withdrawn.", () =>
                withdrawOffer({ offerId: current.id })
              )
            }
            disabled={isPending}
          >
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
            {isPending && <Loader2Icon className="animate-spin" />}
            Request booking at these terms
          </Button>
        )}
      </div>
    </article>
  );
}

export { OfferCard };
