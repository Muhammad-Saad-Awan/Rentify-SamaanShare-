import { ArrowLeftIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ChatThread } from "@/components/chat/chat-thread";
import { OfferForm } from "@/components/chat/offer-form";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { BOOKING_STATUS_LABELS } from "@/lib/bookings/timeline";
import { MESSAGES_ROUTE } from "@/lib/chat/routes";
import {
  getConversationForParticipant,
  getMessagesPage,
} from "@/lib/queries/chat";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate, todayInKarachi } from "@/lib/utils/date";
import { getDisplayName, getInitials } from "@/lib/utils/user";

import type { ConversationDetail } from "@/lib/queries/chat";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conversation",
};

interface ConversationPageProps {
  params: Promise<{ id: string }>;
}

/**
 * One conversation.
 *
 * The layout has already refused anyone who is not a participant, with a real 404. The skeleton is an
 * in-page `<Suspense>` keyed by the id, so it reappears when moving between threads without a
 * route-level `loading.tsx` - see AGENTS.md.
 */
export default async function ConversationPage({
  params,
}: ConversationPageProps) {
  const { id } = await params;

  return (
    <Suspense key={id} fallback={<DashboardPageSkeleton cards={2} />}>
      <Conversation id={id} />
    </Suspense>
  );
}

async function Conversation({ id }: { id: string }) {
  const user = await requireUser();

  const [detail, page] = await Promise.all([
    getConversationForParticipant(id, user.id),
    getMessagesPage(id),
  ]);

  if (!detail) {
    // Unreachable in practice - the layout has already checked. Kept so the type narrows honestly.
    notFound();
  }

  const name = getDisplayName({ name: detail.counterparty.name });
  const today = todayInKarachi();
  const amendable = detail.bookings.filter((booking) => booking.termsAmendable);

  return (
    <>
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href={MESSAGES_ROUTE} />}
          aria-label="Back to messages"
        >
          <ArrowLeftIcon />
        </Button>
        <Avatar className="size-10 shrink-0">
          {detail.counterparty.image && (
            <AvatarImage src={detail.counterparty.image} alt="" />
          )}
          <AvatarFallback>
            {getInitials({ name: detail.counterparty.name })}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <h1 className="font-heading truncate text-lg font-medium">
            <Link
              href={`/users/${detail.counterparty.id}`}
              className="hover:underline"
            >
              {name}
            </Link>
          </h1>
          <p className="text-muted-foreground truncate text-sm">
            {detail.role === "renter" ? "Owner of " : "Interested in your "}
            <Link
              href={`/listings/${detail.listing.id}`}
              className="hover:underline"
            >
              {detail.listing.title}
            </Link>
          </p>
        </div>
      </div>

      <BookingsPanel detail={detail} />

      {detail.counterparty.active && (
        <OfferForm
          conversationId={detail.id}
          rates={{
            pricePerDay: detail.listing.pricePerDay,
            pricePerWeek: detail.listing.pricePerWeek,
            pricePerMonth: detail.listing.pricePerMonth,
          }}
          listingDeposit={detail.listing.securityDeposit}
          amendableBookings={amendable}
          today={today}
        />
      )}

      <ChatThread
        conversationId={detail.id}
        viewerId={user.id}
        counterpartyName={name}
        canWrite={detail.counterparty.active}
        initialMessages={page.messages}
        initialHasOlder={page.hasOlder}
        lastReadAt={detail.lastReadAt}
        counterpartyLastReadAt={detail.counterpartyLastReadAt}
        offers={detail.offers}
        offerContext={{
          listingId: detail.listing.id,
          viewerIsRenter: detail.role === "renter",
          today,
        }}
      />
    </>
  );
}

/**
 * The bookings between these two people for this listing, with their official terms.
 *
 * Shown above the chat because these numbers - not anything said below - are what the rental costs.
 * Each one says whether its terms can still be renegotiated with an offer or are final.
 */
function BookingsPanel({ detail }: { detail: ConversationDetail }) {
  if (detail.bookings.length === 0) {
    return null;
  }

  const bookingsHref =
    detail.role === "renter" ? "/dashboard/bookings" : "/dashboard/requests";

  return (
    <Card className="gap-3 py-4">
      <div className="flex items-center justify-between gap-2 px-(--card-spacing)">
        <h2 className="font-heading text-sm font-medium">
          {detail.bookings.length === 1 ? "Booking" : "Bookings"}
        </h2>
        <Button
          variant="link"
          size="xs"
          className="h-auto p-0"
          render={<Link href={bookingsHref} />}
        >
          {detail.role === "renter" ? "My bookings" : "Requests"}
        </Button>
      </div>
      <ul className="flex flex-col divide-y">
        {detail.bookings.map((booking) => (
          <li
            key={booking.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-(--card-spacing) py-2 text-sm"
          >
            <div className="flex flex-col">
              <span>
                {formatDate(booking.startDate)} to {formatDate(booking.endDate)}
              </span>
              <span className="text-muted-foreground text-xs">
                {formatPKR(booking.totalPrice)} rent ·{" "}
                {booking.securityDeposit === 0
                  ? "no deposit"
                  : `${formatPKR(booking.securityDeposit)} deposit`}
                {booking.agreedOfferId && " · agreed by offer"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!booking.termsAmendable && (
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <LockIcon className="size-3" aria-hidden="true" />
                  Terms final
                </span>
              )}
              <Badge variant="outline">
                {BOOKING_STATUS_LABELS[booking.status]}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
