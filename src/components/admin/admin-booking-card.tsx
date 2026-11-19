import { ClockAlertIcon, ScaleIcon } from "lucide-react";
import Link from "next/link";

import { AttentionNote, AwaitingBadge } from "@/components/admin/attention";
import { StatusBadge as StatusLabel } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ClaimStatus, UserStatus } from "@/generated/prisma/enums";
import { describeDepositState } from "@/lib/bookings/deposit";
import { bookingBadge } from "@/lib/bookings/status-badge";
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
    <Card size="sm">
      <div className="flex flex-col gap-2.5 px-(--card-spacing)">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link
              href={`/admin/bookings/${booking.id}`}
              className="font-heading decoration-foreground/30 text-base leading-snug font-semibold break-words underline-offset-4 hover:underline"
            >
              {booking.listing.title}
            </Link>
            <p className="text-muted-foreground text-sm">
              <PartyLink party={booking.renter} role="renter" /> renting from{" "}
              <PartyLink party={booking.owner} role="owner" />
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/*
              A request the 48-hour window has already passed. Reported rather than swept: expiring it
              here would notify both parties and release the calendar as a side effect of somebody
              looking at a support screen. See `isPastPendingWindow`. Overdue is a warning, not a
              failure - nothing has gone wrong yet.
            */}
            {booking.isPastPendingWindow && (
              <AwaitingBadge
                icon={ClockAlertIcon}
                label="Past the 48h window"
              />
            )}

            {booking.claimStatus &&
              (claimNeedsAttention(booking.claimStatus) ? (
                <AwaitingBadge
                  icon={ScaleIcon}
                  label={CLAIM_STATUS_LABELS[booking.claimStatus]}
                />
              ) : (
                <Badge variant="outline">
                  <ScaleIcon aria-hidden="true" />
                  {CLAIM_STATUS_LABELS[booking.claimStatus]}
                </Badge>
              ))}

            {/*
              The admin-neutral label rather than the parties' ("Awaiting owner"), with the variant
              from the shared mapper so a state reads the same here as on the parties' screens.
            */}
            <StatusLabel
              variant={bookingBadge(booking.status, null).variant}
              label={BOOKING_STATUS_LABELS[booking.status]}
            />
          </div>
        </div>

        <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
          <span className="font-heading text-foreground text-sm font-semibold tabular-nums">
            {formatPKR(booking.totalPrice)}
          </span>
          <span className="tabular-nums">
            deposit {formatPKR(booking.securityDeposit)}
          </span>
          <span>
            {formatDate(booking.startDate)} — {formatDate(booking.endDate)}
          </span>
          <span>{formatCity(booking.listing.city)}</span>
          <span>requested {formatDate(booking.createdAt)}</span>
        </div>

        {/*
          The deposit sentence only where there is something to say. "Not due back yet" on every
          pending request would push the states that matter - overdue, claimed - into the noise.
        */}
        {booking.deposit.kind !== "none" &&
          booking.deposit.kind !== "not-due" &&
          (booking.deposit.kind === "overdue" ? (
            <AttentionNote>
              {describeDepositState(booking.deposit)}
            </AttentionNote>
          ) : (
            <p className="text-muted-foreground text-xs">
              {describeDepositState(booking.deposit)}
            </p>
          ))}
      </div>
    </Card>
  );
}

/**
 * Whether a claim on this booking is still open - with the renter or with an administrator.
 *
 * Those two are amber; a decided, agreed or withdrawn claim is history and stays neutral. Red was
 * used for all five, which made a claim settled months ago look like an emergency.
 */
function claimNeedsAttention(status: ClaimStatus): boolean {
  return status === ClaimStatus.OPEN || status === ClaimStatus.DISPUTED;
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
