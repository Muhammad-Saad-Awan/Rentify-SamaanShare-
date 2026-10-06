import { ArrowLeftIcon, ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { MemberAvatar } from "@/components/chat/member-avatar";
import { Button } from "@/components/ui/button";
import { MESSAGES_ROUTE } from "@/lib/chat/routes";
import { formatPKRPerDay } from "@/lib/utils/currency";
import { formatCity } from "@/lib/utils/listing";
import { getDisplayName } from "@/lib/utils/user";

import type { ConversationDetail } from "@/lib/queries/chat";

/**
 * Who this conversation is with, and what it is about.
 *
 * The listing sits in the header as a card rather than as a line of text: in a marketplace the item
 * is half of the context, and the price beside it is what every offer below is measured against.
 */
function ThreadHeader({ detail }: { detail: ConversationDetail }) {
  const name = getDisplayName({ name: detail.counterparty.name });
  const memberSince = new Intl.DateTimeFormat("en-PK", {
    month: "short",
    year: "numeric",
    timeZone: "Asia/Karachi",
  }).format(detail.counterparty.memberSince);

  return (
    <header className="bg-background flex items-center gap-3 border-b px-3 py-3 sm:px-4">
      {/* The list is beside the thread on a desktop; on a phone this is the only way back to it. */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        render={<Link href={MESSAGES_ROUTE} />}
        aria-label="Back to messages"
      >
        <ArrowLeftIcon />
      </Button>

      <MemberAvatar
        name={detail.counterparty.name}
        image={detail.counterparty.image}
        isVerified={detail.counterparty.isVerified}
        className="size-10 rounded-full"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="font-heading truncate text-base font-semibold">
          <Link
            href={`/users/${detail.counterparty.id}`}
            className="hover:underline"
          >
            {name}
          </Link>
        </h2>
        <p className="text-muted-foreground truncate text-xs">
          {detail.role === "renter" ? "Owner" : "Renter"} · Member since{" "}
          {memberSince}
          {detail.counterparty.isVerified && " · Verified"}
        </p>
      </div>

      <Link
        href={`/listings/${detail.listing.id}`}
        className="hover:bg-muted focus-visible:ring-ring hidden max-w-72 items-center gap-2.5 rounded-xl border p-1.5 pr-3 outline-none focus-visible:ring-2 sm:flex"
      >
        <span className="bg-muted relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg">
          {detail.listing.imageUrl ? (
            <Image
              src={detail.listing.imageUrl}
              alt=""
              fill
              sizes="40px"
              className="object-cover"
            />
          ) : (
            <ImageIcon
              className="text-muted-foreground size-4"
              aria-hidden="true"
            />
          )}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-medium">
            {detail.listing.title}
          </span>
          <span className="text-muted-foreground truncate text-[11px]">
            {formatPKRPerDay(detail.listing.pricePerDay)} ·{" "}
            {detail.listing.area ? `${detail.listing.area}, ` : ""}
            {formatCity(detail.listing.city)}
          </span>
        </span>
      </Link>
    </header>
  );
}

export { ThreadHeader };
