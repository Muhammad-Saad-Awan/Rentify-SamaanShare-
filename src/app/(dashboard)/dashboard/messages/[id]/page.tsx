import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ChatThread } from "@/components/chat/chat-thread";
import { RentalDetails } from "@/components/chat/rental-details";
import { ThreadHeader } from "@/components/chat/thread-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/session";
import { quickRepliesFor, rentalStage } from "@/lib/chat/quick-replies";
import {
  getConversationForParticipant,
  getMessagesPage,
} from "@/lib/queries/chat";
import { todayInKarachi } from "@/lib/utils/date";
import { getDisplayName } from "@/lib/utils/user";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conversation",
};

interface ConversationPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ draft?: string | string[] }>;
}

/** A carried-over question longer than this is not a question; it is dropped. */
const DRAFT_MAX = 500;

/**
 * One conversation, in the right-hand pane of the messenger.
 *
 * The layout has already refused anyone who is not a participant, with a real 404. The skeleton is an
 * in-page `<Suspense>` keyed by the id, so it reappears when moving between threads without a
 * route-level `loading.tsx` - see AGENTS.md.
 */
export default async function ConversationPage({
  params,
  searchParams,
}: ConversationPageProps) {
  const [{ id }, { draft }] = await Promise.all([params, searchParams]);
  const initialDraft =
    typeof draft === "string" && draft.length <= DRAFT_MAX ? draft : undefined;

  return (
    <Suspense key={id} fallback={<ThreadSkeleton />}>
      <Conversation id={id} initialDraft={initialDraft} />
    </Suspense>
  );
}

async function Conversation({
  id,
  initialDraft,
}: {
  id: string;
  initialDraft: string | undefined;
}) {
  const user = await requireUser();

  const [detail, page] = await Promise.all([
    getConversationForParticipant(id, user.id),
    getMessagesPage(id),
  ]);

  if (!detail) {
    // Unreachable in practice - the layout has already checked. Kept so the type narrows honestly.
    notFound();
  }

  const today = todayInKarachi();
  const rates = {
    pricePerDay: detail.listing.pricePerDay,
    pricePerWeek: detail.listing.pricePerWeek,
    pricePerMonth: detail.listing.pricePerMonth,
  };

  return (
    <>
      <ThreadHeader detail={detail} />
      <RentalDetails detail={detail} />
      <ChatThread
        conversationId={detail.id}
        viewerId={user.id}
        counterparty={{
          name: getDisplayName({ name: detail.counterparty.name }),
          image: detail.counterparty.image,
        }}
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
          rates,
        }}
        offerForm={{
          conversationId: detail.id,
          rates,
          listingDeposit: detail.listing.securityDeposit,
          amendableBookings: detail.bookings.filter(
            (booking) => booking.termsAmendable
          ),
          today,
        }}
        quickReplies={quickRepliesFor(
          detail.role,
          rentalStage(detail.bookings)
        )}
        initialDraft={initialDraft}
      />
    </>
  );
}

/** The thread's shape while it loads: header, a few bubbles, the composer. */
function ThreadSkeleton() {
  return (
    <div
      className="flex flex-1 flex-col"
      aria-busy="true"
      aria-label="Loading conversation"
    >
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-3 p-5">
        <Skeleton className="h-9 w-2/5 rounded-2xl" />
        <Skeleton className="h-9 w-1/3 self-end rounded-2xl" />
        <Skeleton className="h-28 w-72 rounded-2xl" />
        <Skeleton className="h-9 w-1/2 self-end rounded-2xl" />
      </div>
      <div className="border-t p-3">
        <Skeleton className="h-11 w-full rounded-3xl" />
      </div>
    </div>
  );
}
