import {
  ClockAlertIcon,
  MessagesSquareIcon,
  PackageIcon,
  ScaleIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AttentionNote, AwaitingBadge } from "@/components/admin/attention";
import { BookingTimeline } from "@/components/admin/booking-timeline";
import { Fact, FactGrid } from "@/components/admin/fact-grid";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge as StatusLabel } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ClaimStatus,
  HandoverType,
  UserStatus,
} from "@/generated/prisma/enums";
import { describeDepositState } from "@/lib/bookings/deposit";
import { holdsDates } from "@/lib/bookings/lifecycle";
import { bookingBadge } from "@/lib/bookings/status-badge";
import { BOOKING_STATUS_LABELS } from "@/lib/bookings/timeline";
import { requireAdmin } from "@/lib/auth/session";
import { CLAIM_REASON_LABELS, CLAIM_STATUS_LABELS } from "@/lib/claims/rules";
import {
  HANDOVER_CONDITION_LABELS,
  handoverStanding,
} from "@/lib/handover/rules";
import { adminConversationHref } from "@/lib/chat/routes";
import { getAdminBookingDetail } from "@/lib/queries/admin-bookings";
import { findConversationIdForRental } from "@/lib/queries/chat";
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

  const conversationId = await findConversationIdForRental(
    booking.listing.id,
    booking.renter.id
  );

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
        <div className="flex flex-col gap-5 px-(--card-spacing)">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {/*
                The admin-neutral label, with the variant from the shared mapper so the state reads
                the same here as on the parties' own screens.
              */}
              <StatusLabel
                variant={bookingBadge(booking.status, null).variant}
                label={BOOKING_STATUS_LABELS[booking.status]}
              />

              {booking.isPastPendingWindow && (
                <AwaitingBadge
                  icon={ClockAlertIcon}
                  label="Past the 48h window"
                />
              )}

              {booking.claimStatus &&
                (booking.claimStatus === ClaimStatus.OPEN ||
                booking.claimStatus === ClaimStatus.DISPUTED ? (
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
            </div>

            {/*
              Said out loud, because it is the operational consequence a support question usually
              turns on: this booking is why those days are unavailable on the listing. `holdsDates`
              is the single source of truth for which statuses still occupy a calendar.
            */}
            {holdsDates(booking.status) && (
              <p className="text-muted-foreground text-xs">
                Holding {booking.heldDateCount}{" "}
                {booking.heldDateCount === 1 ? "day" : "days"} on the
                listing&apos;s calendar.
              </p>
            )}
          </div>

          {booking.isPastPendingWindow && (
            <AttentionNote>
              This request is past the 48-hour window and has not been swept
              yet. It will expire - releasing the dates and notifying both sides
              - the next time either party opens their bookings. Nothing on this
              screen triggers that.
            </AttentionNote>
          )}

          <FactGrid columns={3}>
            <Fact label="Rental">
              {formatDate(booking.startDate)} — {formatDate(booking.endDate)}
            </Fact>
            <Fact label="Rent" money>
              {formatPKR(booking.totalPrice)}
            </Fact>
            <Fact label="Deposit" money>
              {formatPKR(booking.securityDeposit)}
            </Fact>
            <Fact label="Renter">
              <Party party={booking.renter} role="renter" />
              <span className="text-muted-foreground block text-xs break-all">
                {booking.renterEmail}
              </span>
            </Fact>
            <Fact label="Owner">
              <Party party={booking.owner} role="owner" />
              <span className="text-muted-foreground block text-xs break-all">
                {booking.ownerEmail}
              </span>
            </Fact>
            <Fact label="City">{formatCity(booking.listing.city)}</Fact>
            <Fact label="Deposit standing" className="sm:col-span-2">
              {describeDepositState(booking.deposit)}
            </Fact>
            {/* In full, because a support ticket quotes it and search matches it exactly. */}
            <Fact label="Booking id" mono>
              {booking.id}
            </Fact>
          </FactGrid>

          <div className="flex flex-wrap gap-2 border-t pt-4">
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
            {/*
              Offered whenever the two members have a conversation. Whether it may actually be read
              is decided on the next screen, against the grounds - this link grants nothing.
            */}
            {conversationId && (
              <Button
                variant="ghost"
                size="sm"
                render={<Link href={adminConversationHref(conversationId)} />}
              >
                <MessagesSquareIcon aria-hidden="true" />
                Conversation
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4 px-(--card-spacing)">
          <h2 className="font-heading text-base font-semibold tracking-tight">
            Payment
          </h2>

          {booking.paymentDetail ? (
            <>
              <FactGrid columns={3}>
                <Fact label="Method">
                  {booking.paymentDetail.method.toLowerCase().replace("_", " ")}
                </Fact>
                <Fact label="Status">
                  {booking.paymentDetail.status.toLowerCase()}
                </Fact>
                <Fact label="Amount" money>
                  {formatPKR(booking.paymentDetail.amount)}
                </Fact>
                <Fact label="Deposit" money>
                  {formatPKR(booking.paymentDetail.securityDeposit)}
                </Fact>
                <Fact label="Confirmed">
                  {booking.paymentDetail.confirmedAt
                    ? `${formatDateTime(booking.paymentDetail.confirmedAt)}${
                        booking.paymentDetail.confirmedByName
                          ? ` by ${booking.paymentDetail.confirmedByName}`
                          : ""
                      }`
                    : "Not yet"}
                </Fact>
                <Fact label="Deposit returned">
                  {booking.depositReturnedAt
                    ? formatDateTime(booking.depositReturnedAt)
                    : "Not recorded"}
                </Fact>
                {booking.paymentDetail.transactionRef && (
                  <Fact label="Reference" mono>
                    {booking.paymentDetail.transactionRef}
                  </Fact>
                )}
              </FactGrid>

              {/*
                Where the money is, stated once. This used to say payment was offline and that
                SamaanShare never held it - true before the custodial switchover, wrong since: the
                renter pays SamaanShare, an administrator (or Stripe, for cards) confirms it, and the
                deposit return is recorded when the booking is settled. Support quoting the old line
                would have told a renter their deposit was never with us.
              */}
              <p className="text-muted-foreground text-xs">
                The renter pays SamaanShare. The confirmation above is recorded
                by an administrator, or by Stripe for card payments; the owner
                payout and deposit return are recorded under Settlements.
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
            <h2 className="font-heading text-base font-semibold tracking-tight">
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
            <h2 className="font-heading text-base font-semibold tracking-tight">
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
                  className="flex flex-col gap-1.5 rounded-xl border px-3 py-2.5"
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
                            className="bg-muted focus-visible:ring-ring relative block size-20 overflow-hidden rounded-lg border outline-none focus-visible:ring-2"
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
            <h2 className="font-heading text-base font-semibold tracking-tight">
              Deposit claim
            </h2>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">
                {CLAIM_REASON_LABELS[booking.claim.reason]}
              </span>
              <Badge variant="outline">
                {CLAIM_STATUS_LABELS[booking.claim.status]}
              </Badge>
              <span className="text-muted-foreground text-xs tabular-nums">
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
          <h2 className="font-heading text-base font-semibold tracking-tight">
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
        className="decoration-foreground/30 hover:decoration-foreground font-medium underline underline-offset-4"
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
