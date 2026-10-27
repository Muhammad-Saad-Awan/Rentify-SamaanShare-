import { ClockIcon, ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { BookingActions } from "@/components/bookings/booking-actions";
import { OpenBookingChatButton } from "@/components/chat/open-booking-chat-button";
import { ClaimPanel } from "@/components/claims/claim-panel";
import { HandoverRecordList } from "@/components/handover/handover-record-list";
import { StatusBadge as StatusLabel } from "@/components/shared/status-badge";
import { Card } from "@/components/ui/card";
import { BookingStatus } from "@/generated/prisma/enums";
import { PENDING_EXPIRY_HOURS } from "@/lib/bookings/lifecycle";
import { bookingBadge } from "@/lib/bookings/status-badge";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { formatCity } from "@/lib/utils/listing";

import type { BookingSummary } from "@/lib/queries/bookings";

interface BookingCardProps {
  booking: BookingSummary;
  /**
   * Which side is looking.
   *
   * Decides both the counterparty label and which half of the lifecycle the action area offers -
   * the renter arranges payment and may cancel, the owner decides, confirms and records handovers.
   */
  side: "renter" | "owner";
}

/**
 * One booking, from either side.
 *
 * A Server Component now: the interactive part moved to {@link BookingActions} when the lifecycle
 * grew past two buttons, which keeps the row's presentation - image, dates, amounts - out of the
 * client bundle. Everything time-dependent (the deposit window) is computed in the query against
 * one instant per page, so nothing here has to know what time it is.
 */
function BookingCard({ booking, side }: BookingCardProps) {
  const awaitingDecision = booking.status === BookingStatus.PENDING;

  return (
    <Card>
      <div className="flex flex-col gap-5 px-(--card-spacing) sm:flex-row">
        <div className="bg-muted relative aspect-4/3 w-full shrink-0 overflow-hidden rounded-lg sm:w-36">
          {booking.listing.imageUrl ? (
            <Image
              src={booking.listing.imageUrl}
              alt=""
              fill
              sizes="(min-width: 640px) 9rem, 100vw"
              className="object-cover"
            />
          ) : (
            <div
              className="text-muted-foreground flex h-full items-center justify-center"
              aria-hidden="true"
            >
              <ImageIcon className="size-5" />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={booking.status} payment={booking.payment} />
              {awaitingDecision && side === "owner" && (
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <ClockIcon className="size-3.5" aria-hidden="true" />
                  Expires {PENDING_EXPIRY_HOURS}h after the request
                </span>
              )}
            </div>

            <h3 className="font-heading text-base leading-snug font-semibold">
              {/* Linked only for the renter: an owner's own listing may be paused, and its
                  public page would 404. */}
              {side === "renter" ? (
                <Link
                  href={`/listings/${booking.listing.id}`}
                  className="decoration-foreground/30 hover:underline hover:underline-offset-4"
                >
                  {booking.listing.title}
                </Link>
              ) : (
                booking.listing.title
              )}
            </h3>

            <p className="text-muted-foreground text-sm">
              {formatDate(booking.startDate)} to {formatDate(booking.endDate)},{" "}
              {formatCity(booking.listing.city)}
            </p>
          </div>

          <dl className="grid grid-cols-3 divide-x rounded-lg border text-xs">
            <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
              <dt className="text-muted-foreground">Rental</dt>
              <dd className="font-heading text-sm font-semibold">
                {formatPKR(booking.totalPrice)}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
              <dt className="text-muted-foreground">Deposit</dt>
              <dd className="font-heading text-sm font-semibold">
                {formatPKR(booking.securityDeposit)}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
              <dt className="text-muted-foreground">
                {side === "renter" ? "Owner" : "Renter"}
              </dt>
              <dd className="truncate text-sm font-medium">
                {/* Name only - the query never selects an email, so there is nothing to leak. */}
                {booking.counterparty.name ?? "SamaanShare member"}
              </dd>
            </div>
          </dl>

          {booking.notes && (
            <p className="text-muted-foreground text-sm">
              <span className="text-foreground font-medium">Note:</span>{" "}
              {booking.notes}
            </p>
          )}

          {booking.pickupInstructions && (
            <p className="bg-muted/60 rounded-lg px-3 py-2.5 text-sm">
              <span className="font-medium">Pickup:</span>{" "}
              {booking.pickupInstructions}
            </p>
          )}

          {booking.statusReason && (
            <p className="text-muted-foreground border-l-2 pl-3 text-sm">
              {booking.statusReason}
            </p>
          )}

          {/*
            The condition records, above the actions rather than inside them.
            One insertion point for every status: a record written at collection stays visible for
            the whole rental and afterwards, which is when it matters. Rendering it from inside the
            status branches would have meant repeating it in six places and forgetting it in one.
          */}
          <HandoverRecordList handovers={booking.handovers} />

          {/*
            The claim, above the actions like the handover records and for the same reason: it stays
            visible for the whole life of the disagreement, on both dashboards, without being
            repeated in every status branch. Filing one is an action and lives below.
          */}
          {booking.claim && (
            <ClaimPanel
              claim={booking.claim}
              securityDeposit={booking.securityDeposit}
            />
          )}

          <BookingActions booking={booking} side={side} />

          {/*
            Chat, at every status - before approval to agree details, during the rental for usage
            help or problems, after return for the deposit. Separate from the lifecycle actions,
            which change the booking; this only talks about it.
          */}
          <div className="border-t pt-4">
            <OpenBookingChatButton
              bookingId={booking.id}
              counterpartRole={side === "renter" ? "owner" : "renter"}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

interface StatusBadgeProps {
  status: BookingStatus;
  payment: BookingSummary["payment"];
}

/**
 * Booking status in plain language, refined by the payment.
 *
 * The mapping lives in `bookingBadge`, which reads the payment as well as the status - a paid
 * booking is still `PAYMENT_PENDING` until the handover, and must not be labelled as unpaid.
 */
function StatusBadge({ status, payment }: StatusBadgeProps) {
  const { label, variant } = bookingBadge(status, payment);

  return <StatusLabel label={label} variant={variant} />;
}

export { BookingCard };
