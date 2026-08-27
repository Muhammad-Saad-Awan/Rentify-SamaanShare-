import { ClockAlertIcon, ScaleIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { BookingStatus, UserStatus } from "@/generated/prisma/enums";
import { describeDepositState } from "@/lib/bookings/deposit";
import { BOOKING_STATUS_LABELS } from "@/lib/bookings/timeline";
import { CLAIM_STATUS_LABELS } from "@/lib/claims/rules";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import { formatCity } from "@/lib/utils/listing";

import type {
  AdminBookingParty,
  AdminBookingSummary,
} from "@/lib/queries/admin-bookings";

interface AdminBookingCardProps {
  booking: AdminBookingSummary;
}

/**
 * One booking in the oversight queue.
 *
 * A Server Component with no controls at all, which is the whole shape of this screen - see the note
 * at the top of `queries/admin-bookings.ts`. Every action on a booking belongs to one of the two
 * parties, so there is nothing here for an administrator to press, and a card that looked like the
 * owner's own would invite exactly that.
 *
 * NAMES BOTH SIDES, unlike the parties' own cards. `BookingCard` shows "the counterparty", because a
 * renter already knows which side they are; an administrator knows neither, and "who is the owner
 * here" is usually the first question.
 */
function AdminBookingCard({ booking }: AdminBookingCardProps) {
  return (
    <Card>
      <div className="flex flex-col gap-2 px-(--card-spacing)">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/bookings/${booking.id}`}
            className="font-heading text-sm font-medium underline-offset-4 hover:underline"
          >
            {booking.listing.title}
          </Link>

          <Badge
            variant={
              booking.status === BookingStatus.ACTIVE
                ? "default"
                : booking.status === BookingStatus.PENDING
                  ? "secondary"
                  : "outline"
            }
          >
            {BOOKING_STATUS_LABELS[booking.status]}
          </Badge>

          {/*
            A request the 48-hour window has already passed. Reported rather than swept: expiring it
            here would notify both parties and release the calendar as a side effect of somebody
            looking at a support screen. See `isPastPendingWindow`.
          */}
          {booking.isPastPendingWindow && (
            <Badge variant="destructive">
              <ClockAlertIcon className="size-3" aria-hidden="true" />
              past the 48h window
            </Badge>
          )}

          {booking.claimStatus && (
            <Badge variant="destructive">
              <ScaleIcon className="size-3" aria-hidden="true" />
              {CLAIM_STATUS_LABELS[booking.claimStatus]}
            </Badge>
          )}
        </div>

        <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span>
            {formatDate(booking.startDate)} — {formatDate(booking.endDate)}
          </span>
          <span>{formatCity(booking.listing.city)}</span>
          <span>{formatPKR(booking.totalPrice)}</span>
          <span>deposit {formatPKR(booking.securityDeposit)}</span>
          <span>requested {formatDate(booking.createdAt)}</span>
        </div>

        <p className="text-muted-foreground text-xs">
          <PartyLink party={booking.renter} role="renter" /> renting from{" "}
          <PartyLink party={booking.owner} role="owner" />
        </p>

        {/*
          The deposit sentence only where there is something to say. "Not due back yet" on every
          pending request would push the states that matter - overdue, claimed - into the noise.
        */}
        {booking.deposit.kind !== "none" &&
          booking.deposit.kind !== "not-due" && (
            <p
              className={
                booking.deposit.kind === "overdue"
                  ? "text-destructive text-xs font-medium"
                  : "text-muted-foreground text-xs"
              }
            >
              {describeDepositState(booking.deposit)}
            </p>
          )}
      </div>
    </Card>
  );
}

/**
 * One party, linked to their admin screen and labelled with their standing.
 *
 * The admin screen rather than the public profile: a suspended, banned or deleted account has no
 * public profile at all, and those are exactly the accounts a support lookup lands on.
 */
function PartyLink({
  party,
  role,
}: {
  party: AdminBookingParty;
  role: "renter" | "owner";
}) {
  const hidden = party.status !== UserStatus.ACTIVE || party.isDeleted;

  return (
    <>
      <Link
        href={`/admin/users/${party.id}`}
        className="underline-offset-4 hover:underline"
      >
        {party.name?.trim() || `Unnamed ${role}`}
      </Link>
      {hidden && (
        <span className="italic">
          {" "}
          ({party.isDeleted ? "deleted" : party.status.toLowerCase()})
        </span>
      )}
    </>
  );
}

export { AdminBookingCard };
