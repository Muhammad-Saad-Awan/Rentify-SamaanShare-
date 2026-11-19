import {
  CalendarDaysIcon,
  ClockIcon,
  ImageIcon,
  MapPinIcon,
} from "lucide-react";
import Link from "next/link";

import { BookingActions } from "@/components/bookings/booking-actions";
import { OpenBookingChatButton } from "@/components/chat/open-booking-chat-button";
import { ClaimPanel } from "@/components/claims/claim-panel";
import { HandoverRecordList } from "@/components/handover/handover-record-list";
import { StatusBadge as StatusLabel } from "@/components/shared/status-badge";
import { Card, CardFooter } from "@/components/ui/card";
import { ListingPhoto } from "@/components/marketplace/listing-photo";
import { BookingStatus } from "@/generated/prisma/enums";
import { PENDING_EXPIRY_HOURS } from "@/lib/bookings/lifecycle";
import { bookingBadge } from "@/lib/bookings/status-badge";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { formatCity } from "@/lib/utils/listing";

import type { BookingSummary } from "@/lib/queries/bookings";
import type { ReactNode } from "react";

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
 *
 * READ TOP TO BOTTOM AS: what it is, what it costs, what has happened, what happens next. The
 * header and money strip are facts; the records and claim are history; the section under the rule
 * is the next step, with `BookingActions` deciding what that is. Chat sits in the footer strip
 * because it is available at every status and changes nothing.
 */
function BookingCard({ booking, side }: BookingCardProps) {
  const awaitingDecision = booking.status === BookingStatus.PENDING;

  return (
    <Card>
      <div className="flex flex-col gap-4 px-(--card-spacing)">
        {/*
          Thumbnail beside the title at every width. Full-width on a phone, the photo alone was
          taller than the rest of the header and pushed the next step below the fold on every row.
        */}
        <div className="flex gap-4">
          <div className="bg-muted relative aspect-4/3 w-20 shrink-0 self-start overflow-hidden rounded-xl sm:w-28">
            {booking.listing.imageUrl ? (
              <ListingPhoto
                src={booking.listing.imageUrl}
                alt=""
                sizes="(min-width: 640px) 7rem, 5rem"
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

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <StatusBadge status={booking.status} payment={booking.payment} />
              {awaitingDecision && side === "owner" && (
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <ClockIcon className="size-3.5" aria-hidden="true" />
                  Expires {PENDING_EXPIRY_HOURS}h after the request
                </span>
              )}
            </div>

            <h3 className="font-heading line-clamp-2 text-base leading-snug font-semibold tracking-tight break-words">
              {/* Linked only for the renter: an owner's own listing may be paused, and its
                  public page would 404. */}
              {side === "renter" ? (
                <Link
                  href={`/listings/${booking.listing.id}`}
                  className="decoration-foreground/30 underline-offset-4 hover:underline"
                >
                  {booking.listing.title}
                </Link>
              ) : (
                booking.listing.title
              )}
            </h3>

            <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5">
                <CalendarDaysIcon
                  className="size-3.5 shrink-0"
                  aria-hidden="true"
                />
                {formatDate(booking.startDate)} to {formatDate(booking.endDate)}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPinIcon className="size-3.5 shrink-0" aria-hidden="true" />
                {formatCity(booking.listing.city)}
              </span>
            </p>
          </div>
        </div>

        {/*
          The money, as two separate figures and never one total: the rent is what the owner
          earns, the deposit is the renter's own money that comes back. The badge above and the
          next step below say where each one stands - this strip only states the amounts agreed.

          Two columns on a phone with the counterparty on its own row; three from `sm`. Three at
          360px left each cell about 90px, which a six-figure amount in the heading face overflows.
        */}
        <dl className="bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-3">
          <MoneyCell label="Rental total">
            {formatPKR(booking.totalPrice)}
          </MoneyCell>
          <MoneyCell label="Security deposit">
            {booking.securityDeposit > 0 ? (
              <>
                {formatPKR(booking.securityDeposit)}
                <span className="text-muted-foreground font-sans text-xs font-normal">
                  {" "}
                  refundable
                </span>
              </>
            ) : (
              "None"
            )}
          </MoneyCell>
          <div className="bg-card col-span-2 flex min-w-0 flex-col gap-0.5 px-3 py-2.5 sm:col-span-1">
            <dt className="text-muted-foreground text-xs">
              {side === "renter" ? "Owner" : "Renter"}
            </dt>
            <dd className="truncate text-sm font-medium">
              {/* Name only - the query never selects an email, so there is nothing to leak. */}
              {booking.counterparty.name ?? "SamaanShare member"}
            </dd>
          </div>
        </dl>

        {booking.notes && (
          <p className="text-muted-foreground text-sm leading-relaxed break-words">
            <span className="text-foreground font-medium">
              {side === "owner" ? "Note from the renter:" : "Your note:"}
            </span>{" "}
            {booking.notes}
          </p>
        )}

        {booking.pickupInstructions && (
          <div className="bg-muted/60 flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm">
            <MapPinIcon
              className="text-muted-foreground mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <p className="min-w-0 leading-relaxed break-words whitespace-pre-line">
              <span className="font-medium">Pickup:</span>{" "}
              {booking.pickupInstructions}
            </p>
          </div>
        )}

        {booking.statusReason && (
          <p className="text-muted-foreground border-l-2 pl-3 text-sm leading-relaxed break-words">
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

        {/*
          The next step, set off by a rule so it reads as "what happens now" rather than one more
          fact. Empty for closed bookings (declined, cancelled, expired), where `BookingActions`
          renders nothing - `empty:hidden` drops the rule with it.
        */}
        <div className="flex flex-col gap-3 border-t pt-4 empty:hidden">
          <BookingActions booking={booking} side={side} />
        </div>
      </div>

      {/*
        Chat, at every status - before approval to agree details, during the rental for usage
        help or problems, after return for the deposit. Separate from the lifecycle actions,
        which change the booking; this only talks about it.
      */}
      <CardFooter>
        <OpenBookingChatButton
          bookingId={booking.id}
          counterpartRole={side === "renter" ? "owner" : "renter"}
        />
      </CardFooter>
    </Card>
  );
}

interface MoneyCellProps {
  label: string;
  children: ReactNode;
}

/** One amount in the money strip: a small label over the figure in the heading face. */
function MoneyCell({ label, children }: MoneyCellProps) {
  return (
    <div className="bg-card flex min-w-0 flex-col gap-0.5 px-3 py-2.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-heading text-sm font-semibold tabular-nums">
        {children}
      </dd>
    </div>
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
