import {
  ChevronDownIcon,
  ImageIcon,
  LockIcon,
  ShieldCheckIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { StatusBadge } from "@/components/shared/status-badge";
import { bookingBadge } from "@/lib/bookings/status-badge";
import { BOOKING_STATUS_LABELS } from "@/lib/bookings/timeline";
import { formatPKR, formatPKRPerDay } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

import type { BookingStatus } from "@/generated/prisma/enums";
import type { ConversationDetail } from "@/lib/queries/chat";

/**
 * A booking's state in the shared `StatusBadge` language - filled for live, ring for waiting, dash
 * for closed, cross for went wrong - so a rental reads the same here as on the bookings screens.
 *
 * Only the VARIANT comes from `bookingBadge`. The thread does not load payment rows, and that
 * mapper's labels read the payment to tell "paid" from "awaiting payment"; without it they would
 * guess. The timeline labels below are status-only by design, which is what this view knows.
 */
function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return (
    <StatusBadge
      label={BOOKING_STATUS_LABELS[status]}
      variant={bookingBadge(status, null).variant}
    />
  );
}

/**
 * The official side of the conversation, folded into one line under the header.
 *
 * Collapsed, it says where the rental stands and what it costs - the numbers that matter, as
 * opposed to anything said in the messages below. Open, it lists every booking between the two
 * with its terms, and the safety basics.
 *
 * A native `<details>`: keyboard and screen-reader support come with the element, and it works
 * before any JavaScript has loaded.
 */
function RentalDetails({ detail }: { detail: ConversationDetail }) {
  const latest = detail.bookings[0] ?? null;
  const bookingsHref =
    detail.role === "renter" ? "/dashboard/bookings" : "/dashboard/requests";

  return (
    <details className="group bg-card border-b">
      <summary className="hover:bg-muted/50 focus-visible:ring-ring flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-2 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        {latest ? (
          <>
            <BookingStatusBadge status={latest.status} />
            <span className="text-muted-foreground min-w-0 truncate">
              {formatDate(latest.startDate)} to {formatDate(latest.endDate)} ·{" "}
              <span className="text-foreground font-medium">
                {formatPKR(latest.totalPrice)}
              </span>
              {latest.agreedOfferId && " (agreed by offer)"}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground min-w-0 truncate">
            No booking yet · Listed at{" "}
            <span className="text-foreground font-medium">
              {formatPKRPerDay(detail.listing.pricePerDay)}
            </span>
            , {formatPKR(detail.listing.securityDeposit)} deposit
          </span>
        )}
        <span className="text-muted-foreground group-hover:text-foreground ml-auto flex shrink-0 items-center gap-1 font-medium">
          Details
          <ChevronDownIcon
            className="size-4 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </span>
      </summary>

      <div className="grid gap-4 px-4 pt-1 pb-4 md:grid-cols-[1fr_16rem]">
        <div className="flex flex-col gap-3">
          {/* The listing, for the phone layout where the header has no room for it. */}
          <Link
            href={`/listings/${detail.listing.id}`}
            className="hover:bg-muted/60 focus-visible:ring-ring flex items-center gap-3 rounded-xl border p-2 transition-colors outline-none focus-visible:ring-2 sm:hidden"
          >
            <span className="bg-muted relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg">
              {detail.listing.imageUrl ? (
                <Image
                  src={detail.listing.imageUrl}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              ) : (
                <ImageIcon
                  className="text-muted-foreground size-4"
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="flex min-w-0 flex-col text-sm">
              <span className="truncate font-medium">
                {detail.listing.title}
              </span>
              <span className="font-heading text-xs font-semibold">
                {formatPKRPerDay(detail.listing.pricePerDay)}
              </span>
            </span>
          </Link>

          {detail.bookings.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing booked between you yet. Agree terms with an offer, then
              request the booking.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {detail.bookings.map((booking) => (
                <li
                  key={booking.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 rounded-lg border px-3 py-2.5 text-sm"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">
                      {formatDate(booking.startDate)} to{" "}
                      {formatDate(booking.endDate)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {formatPKR(booking.totalPrice)} rent ·{" "}
                      {booking.securityDeposit === 0
                        ? "no deposit"
                        : `${formatPKR(booking.securityDeposit)} deposit`}
                      {booking.agreedOfferId && " · agreed by offer"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {!booking.termsAmendable && (
                      <span className="text-muted-foreground flex items-center gap-1 text-xs">
                        <LockIcon className="size-3" aria-hidden="true" />
                        Terms final
                      </span>
                    )}
                    <BookingStatusBadge status={booking.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}

          {detail.bookings.length > 0 && (
            <Link
              href={bookingsHref}
              className="text-primary focus-visible:ring-ring self-start rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2"
            >
              {detail.role === "renter"
                ? "Go to my bookings"
                : "Go to requests"}
            </Link>
          )}
        </div>

        <aside className="bg-muted/60 flex flex-col gap-2 rounded-lg p-3 text-xs leading-relaxed">
          <p className="flex items-center gap-1.5 font-medium">
            <ShieldCheckIcon className="size-4" aria-hidden="true" />
            Rent safely
          </p>
          <ul className="text-muted-foreground flex list-disc flex-col gap-1 pl-4">
            <li>Agree prices with offers - chat text is not binding.</li>
            <li>Pay through SamaanShare, never directly to a stranger.</li>
            <li>Never share your CNIC, passwords or OTP codes.</li>
            <li>Record the item&apos;s condition at pickup and return.</li>
          </ul>
        </aside>
      </div>
    </details>
  );
}

export { RentalDetails };
