import { ClockAlertIcon, PackageIcon, ScaleIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingTimeline } from "@/components/admin/booking-timeline";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  BookingStatus,
  HandoverType,
  UserStatus,
} from "@/generated/prisma/enums";
import { describeDepositState } from "@/lib/bookings/deposit";
import { holdsDates } from "@/lib/bookings/lifecycle";
import { BOOKING_STATUS_LABELS } from "@/lib/bookings/timeline";
import { requireAdmin } from "@/lib/auth/session";
import { CLAIM_REASON_LABELS, CLAIM_STATUS_LABELS } from "@/lib/claims/rules";
import {
  HANDOVER_CONDITION_LABELS,
  handoverStanding,
} from "@/lib/handover/rules";
import { getAdminBookingDetail } from "@/lib/queries/admin-bookings";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate, formatDateTime } from "@/lib/utils/date";
import { formatCity } from "@/lib/utils/listing";

import type { AdminBookingParty } from "@/lib/queries/admin-bookings";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Booking",
  description: "Booking detail and recorded history.",
  robots: { index: false, follow: false },
};

interface AdminBookingPageProps {
  params: Promise<{ id: string }>;
}

/**
 * One booking, with everything recorded about it.
 *
 * The id is validated in `layout.tsx`, which runs before the first byte - see the note there. This
 * still handles `null`, because the layout's guarantee is about *ordering*, not about types.
 *
 * NO CONTROLS. Every step of a booking belongs to the renter or the owner - see the note at the top
 * of `queries/admin-bookings.ts` - so what an administrator can do about a booking is elsewhere and
 * audited: settle the claim, take the listing down, suspend an account. Those are linked from here.
 */
export default async function AdminBookingPage({
  params,
}: AdminBookingPageProps) {
  await requireAdmin();
  const { id } = await params;

  const booking = await getAdminBookingDetail(id);

  if (!booking) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={booking.listing.title}
        description="Booking detail and everything recorded about it. Read-only."
        actions={
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/admin/bookings" />}
          >
            Back to bookings
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col gap-3 px-(--card-spacing)">
          <div className="flex flex-wrap items-center gap-2">
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

          {/*
            Said out loud, because it is the operational consequence a support question usually turns
            on: this booking is why those days are unavailable on the listing. `holdsDates` is the
            single source of truth for which statuses still occupy a calendar.
          */}
          {holdsDates(booking.status) && (
            <p className="text-muted-foreground text-xs">
              Holding {booking.heldDateCount}{" "}
              {booking.heldDateCount === 1 ? "day" : "days"} on the
              listing&apos;s calendar.
            </p>
          )}

          {booking.isPastPendingWindow && (
            <p className="text-destructive text-xs">
              This request is past the 48-hour window and has not been swept
              yet. It will expire - releasing the dates and notifying both sides
              - the next time either party opens their bookings. Nothing on this
              screen triggers that.
            </p>
          )}

          <dl className="text-muted-foreground grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            <div>
              <dt className="inline font-medium">Rental: </dt>
              <dd className="inline">
                {formatDate(booking.startDate)} — {formatDate(booking.endDate)}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">City: </dt>
              <dd className="inline">{formatCity(booking.listing.city)}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Rent: </dt>
              <dd className="inline">{formatPKR(booking.totalPrice)}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Deposit: </dt>
              <dd className="inline">{formatPKR(booking.securityDeposit)}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Renter: </dt>
              <dd className="inline">
                <Party party={booking.renter} role="renter" />{" "}
                <span className="break-all">({booking.renterEmail})</span>
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Owner: </dt>
              <dd className="inline">
                <Party party={booking.owner} role="owner" />{" "}
                <span className="break-all">({booking.ownerEmail})</span>
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Booking id: </dt>
              {/* In full, because a support ticket quotes it and search matches it exactly. */}
              <dd className="inline break-all">{booking.id}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Deposit standing: </dt>
              <dd className="inline">
                {describeDepositState(booking.deposit)}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/admin/listings/${booking.listing.id}`} />}
            >
              <PackageIcon aria-hidden="true" />
              The listing
            </Button>
            <Button
              variant="ghost"
              size="sm"
              render={
                <Link href={`/admin/bookings?listing=${booking.listing.id}`} />
              }
            >
              Other bookings on it
            </Button>
            {booking.claim && (
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/admin/claims" />}
              >
                <ScaleIcon aria-hidden="true" />
                Claims queue
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3 px-(--card-spacing)">
          <h2 className="font-heading text-base font-medium">Payment</h2>

          {booking.paymentDetail ? (
            <>
              <dl className="text-muted-foreground grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                <div>
                  <dt className="inline font-medium">Method: </dt>
                  <dd className="inline">
                    {booking.paymentDetail.method
                      .toLowerCase()
                      .replace("_", " ")}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium">Status: </dt>
                  <dd className="inline">
                    {booking.paymentDetail.status.toLowerCase()}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium">Amount: </dt>
                  <dd className="inline">
                    {formatPKR(booking.paymentDetail.amount)}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium">Deposit: </dt>
                  <dd className="inline">
                    {formatPKR(booking.paymentDetail.securityDeposit)}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium">Confirmed: </dt>
                  <dd className="inline">
                    {booking.paymentDetail.confirmedAt
                      ? `${formatDateTime(booking.paymentDetail.confirmedAt)}${
                          booking.paymentDetail.confirmedByName
                            ? ` by ${booking.paymentDetail.confirmedByName}`
                            : ""
                        }`
                      : "not yet"}
                  </dd>
                </div>
                <div>
                  <dt className="inline font-medium">Deposit returned: </dt>
                  <dd className="inline">
                    {booking.paymentDetail.depositReturnedAt
                      ? formatDateTime(booking.paymentDetail.depositReturnedAt)
                      : "not recorded"}
                  </dd>
                </div>
                {booking.paymentDetail.transactionRef && (
                  <div>
                    <dt className="inline font-medium">Reference: </dt>
                    <dd className="inline break-all">
                      {booking.paymentDetail.transactionRef}
                    </dd>
                  </div>
                )}
              </dl>

              {/*
                The line this screen must not blur. Payment is offline: the money moved between two
                people and nothing here saw it, so a confirmation is the owner's assertion rather
                than a fact the platform can stand behind. An administrator quoting "our records show
                you were paid" would be overstating what the record is.
              */}
              <p className="text-muted-foreground text-xs italic">
                Offline payment. Both the confirmation and the deposit return
                are recorded by the owner, not verified by the platform, and
                SamaanShare never held the money.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              No payment record yet — the renter has not chosen a method.
            </p>
          )}
        </div>
      </Card>

      {(booking.notes || booking.pickupInstructions) && (
        <Card>
          <div className="flex flex-col gap-3 px-(--card-spacing)">
            <h2 className="font-heading text-base font-medium">
              What the parties wrote
            </h2>

            {/* Strings, never HTML - the two of them typed these. */}
            {booking.notes && (
              <div className="flex flex-col gap-0.5">
                <h3 className="text-xs font-medium">
                  The renter&apos;s note with the request
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                  {booking.notes}
                </p>
              </div>
            )}

            {booking.pickupInstructions && (
              <div className="flex flex-col gap-0.5">
                <h3 className="text-xs font-medium">
                  The owner&apos;s pickup instructions
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                  {booking.pickupInstructions}
                </p>
                {/*
                  Worth flagging on a support screen: these are editable by the owner after the fact,
                  so what is shown here is the current text and not necessarily what the renter read.
                */}
                <p className="text-muted-foreground text-xs italic">
                  The owner can edit these, so this is the current text rather
                  than what the renter first saw.
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {booking.handovers.length > 0 && (
        <Card>
          <div className="flex flex-col gap-3 px-(--card-spacing)">
            <h2 className="font-heading text-base font-medium">
              Condition records
            </h2>

            {/*
              The photographs are the point of showing these here rather than only in the timeline.
              A deposit dispute is two people asserting different things about an item neither has any
              longer, and the pickup record is the baseline the return is judged against - the claims
              queue only shows the return one.
            */}
            <ul className="flex flex-col gap-3">
              {booking.handovers.map((handover) => (
                <li
                  key={handover.id}
                  className="flex flex-col gap-1.5 rounded-lg border px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-medium">
                      {handover.type === HandoverType.PICKUP
                        ? "Pickup"
                        : "Return"}
                      : {HANDOVER_CONDITION_LABELS[handover.condition]}
                    </span>
                    <Badge variant="outline">
                      {handoverStanding(handover.confirmation)}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {formatDateTime(handover.recordedAt)} by{" "}
                      {handover.recordedBy.name?.trim() || "an unnamed member"}
                    </span>
                  </div>

                  {handover.notes && (
                    <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                      {handover.notes}
                    </p>
                  )}

                  {handover.confirmationNote && (
                    <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                      <span className="font-medium">The other party: </span>
                      {handover.confirmationNote}
                    </p>
                  )}

                  {handover.photos.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {handover.photos.map((photo) => (
                        <li key={photo.id}>
                          {/*
                            Opens the full image in a new tab: a thumbnail is not enough to judge
                            damage from, which is the only reason these are on screen.
                          */}
                          <a
                            href={photo.url}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-muted relative block size-20 overflow-hidden rounded-md"
                          >
                            <Image
                              src={photo.url}
                              alt="Condition photo"
                              fill
                              sizes="80px"
                              className="object-cover"
                            />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {booking.claim && (
        <Card>
          <div className="flex flex-col gap-2 px-(--card-spacing)">
            <h2 className="font-heading text-base font-medium">
              Deposit claim
            </h2>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">
                {CLAIM_REASON_LABELS[booking.claim.reason]}
              </span>
              <Badge variant="outline">
                {CLAIM_STATUS_LABELS[booking.claim.status]}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {formatPKR(booking.claim.amountClaimed)} claimed
                {booking.claim.amountUpheld !== null &&
                  `, ${formatPKR(booking.claim.amountUpheld)} upheld`}
              </span>
            </div>

            <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
              {booking.claim.description}
            </p>

            {booking.claim.responseNote && (
              <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                <span className="font-medium">The renter&apos;s answer: </span>
                {booking.claim.responseNote}
              </p>
            )}

            {booking.claim.resolution && (
              <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
                <span className="font-medium">Decision: </span>
                {booking.claim.resolution}
              </p>
            )}

            {/*
              The decision itself is made in the claims queue, which is where the audited action and
              both sides' photographs live. Duplicating the controls here would give one decision two
              front doors.
            */}
            <p className="text-muted-foreground text-xs">
              Decided in the{" "}
              <Link
                href="/admin/claims"
                className="underline underline-offset-4"
              >
                claims queue
              </Link>
              , where both sides&apos; photographs are shown.
            </p>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-col gap-3 px-(--card-spacing)">
          <h2 className="font-heading text-base font-medium">
            Recorded history
          </h2>
          <BookingTimeline booking={booking} />

          {/*
            The gap, stated where somebody would otherwise assume the record is complete. There is no
            `approvedAt` column, so for a booking that has moved past it, when the owner accepted is
            genuinely not recoverable.
          */}
          <p className="text-muted-foreground text-xs italic">
            Reconstructed from the lifecycle timestamps. Approval has no
            timestamp of its own, so it does not appear; a decline or an expiry
            shows the record&apos;s last change instead, marked as such.
          </p>
        </div>
      </Card>
    </>
  );
}

/**
 * One party, linked to their admin screen and labelled with their standing.
 *
 * The admin screen rather than the public profile: a suspended, banned or deleted account has no
 * public profile at all, and those are exactly the accounts a support lookup lands on.
 */
function Party({
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
