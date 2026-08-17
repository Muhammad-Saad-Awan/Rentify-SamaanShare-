import { ClockIcon, ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { BookingActions } from "@/components/bookings/booking-actions";
import { HandoverRecordList } from "@/components/handover/handover-record-list";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { BookingStatus } from "@/generated/prisma/enums";
import { PENDING_EXPIRY_HOURS } from "@/lib/bookings/lifecycle";
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
      <div className="flex flex-col gap-4 px-(--card-spacing) sm:flex-row">
        <div className="bg-muted relative aspect-4/3 w-full shrink-0 overflow-hidden rounded-lg sm:w-32">
          {booking.listing.imageUrl ? (
            <Image
              src={booking.listing.imageUrl}
              alt=""
              fill
              sizes="(min-width: 640px) 8rem, 100vw"
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

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={booking.status} />
              {awaitingDecision && side === "owner" && (
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <ClockIcon className="size-3.5" aria-hidden="true" />
                  Expires {PENDING_EXPIRY_HOURS}h after the request
                </span>
              )}
            </div>

            <h3 className="font-heading text-sm leading-snug font-medium">
              {/* Linked only for the renter: an owner's own listing may be paused, and its
                  public page would 404. */}
              {side === "renter" ? (
                <Link
                  href={`/listings/${booking.listing.id}`}
                  className="hover:underline"
                >
                  {booking.listing.title}
                </Link>
              ) : (
                booking.listing.title
              )}
            </h3>

            <p className="text-muted-foreground text-xs">
              {formatDate(booking.startDate)} to {formatDate(booking.endDate)} ·{" "}
              {formatCity(booking.listing.city)}
            </p>
          </div>

          <dl className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <div className="flex items-center gap-1.5">
              <dt>Rental</dt>
              <dd className="text-foreground font-medium">
                {formatPKR(booking.totalPrice)}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt>Deposit</dt>
              <dd className="text-foreground font-medium">
                {formatPKR(booking.securityDeposit)}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt>{side === "renter" ? "Owner" : "Renter"}</dt>
              <dd className="text-foreground font-medium">
                {/* Name only - the query never selects an email, so there is nothing to leak. */}
                {booking.counterparty.name ?? "SamaanShare member"}
              </dd>
            </div>
          </dl>

          {booking.notes && (
            <p className="text-muted-foreground text-xs">
              <span className="font-medium">Note:</span> {booking.notes}
            </p>
          )}

          {booking.pickupInstructions && (
            <p className="bg-muted/50 rounded-lg px-3 py-2 text-xs">
              <span className="font-medium">Pickup:</span>{" "}
              {booking.pickupInstructions}
            </p>
          )}

          {booking.statusReason && (
            <p className="text-muted-foreground text-xs">
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

          <BookingActions booking={booking} side={side} />
        </div>
      </div>
    </Card>
  );
}

interface StatusBadgeProps {
  status: BookingStatus;
}

/**
 * Booking status in plain language.
 *
 * A total map over the enum, so adding a state fails at the type level rather than rendering
 * `PAYMENT_PENDING` to a renter.
 */
function StatusBadge({ status }: StatusBadgeProps) {
  const presentation: Record<
    BookingStatus,
    {
      label: string;
      variant: "default" | "secondary" | "outline" | "destructive";
    }
  > = {
    [BookingStatus.PENDING]: { label: "Awaiting owner", variant: "secondary" },
    [BookingStatus.APPROVED]: { label: "Approved", variant: "default" },
    [BookingStatus.PAYMENT_PENDING]: {
      label: "Awaiting payment",
      variant: "secondary",
    },
    [BookingStatus.ACTIVE]: { label: "Rented out", variant: "default" },
    [BookingStatus.COMPLETED]: { label: "Completed", variant: "outline" },
    [BookingStatus.REVIEWED]: { label: "Reviewed", variant: "outline" },
    [BookingStatus.DECLINED]: { label: "Declined", variant: "destructive" },
    [BookingStatus.CANCELLED]: { label: "Cancelled", variant: "outline" },
    [BookingStatus.EXPIRED]: { label: "Expired", variant: "outline" },
  };

  const { label, variant } = presentation[status];

  return <Badge variant={variant}>{label}</Badge>;
}

export { BookingCard };
