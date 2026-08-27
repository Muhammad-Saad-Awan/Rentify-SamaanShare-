"use client";

import {
  Loader2Icon,
  PencilIcon,
  RotateCcwIcon,
  TrashIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  adminEditListing,
  adminRemoveListing,
  adminRestoreListing,
} from "@/actions/admin-listings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ADMIN_EDITABLE_LISTING_FIELDS,
  canEditListing,
  canRemoveListing,
  canRestoreListing,
  RESTORED_LISTING_STATUS,
} from "@/lib/admin/listing-rules";
import { ADMIN_REASON_MAX, ADMIN_REASON_MIN } from "@/lib/admin/rules";
import {
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  TITLE_MAX,
  TITLE_MIN,
} from "@/lib/validations/listing";

import type { AdminListingDetail } from "@/lib/queries/admin-listings";

interface ListingModerationPanelProps {
  listing: AdminListingDetail;
}

type PendingAction = "remove" | "restore" | "edit";

/**
 * Removal, restoration and a copy edit for one listing.
 *
 * THE SAME PREDICATES THE SERVER USES decide which controls appear - `canRemoveListing` and friends
 * from `src/lib/admin/listing-rules.ts`, imported rather than re-expressed. A button the action would
 * refuse is a button that only produces an error.
 *
 * ONE SHARED REASON BOX, matching `UserModerationPanel`. What is being recorded is the same thing
 * each time - why moderation touched this listing - and a box per control invites a different
 * standard of explanation for each.
 *
 * THE EDIT FIELDS ARE PRE-FILLED WITH THE CURRENT TEXT, and the panel is uncontrolled after that: a
 * moderator's job here is to change a phrase, not to rewrite a listing from scratch, and starting
 * from blank fields would turn "remove the phone number" into retyping 400 words of somebody else's
 * description.
 */
function ListingModerationPanel({ listing }: ListingModerationPanelProps) {
  const [reason, setReason] = useState("");
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const subject = {
    id: listing.id,
    status: listing.status,
    isDeleted: listing.isDeleted,
  };

  const removable = canRemoveListing(subject);
  const restorable = canRestoreListing(subject);
  const editable = canEditListing(subject);

  const reasonReady = reason.trim().length >= ADMIN_REASON_MIN;
  const copyChanged =
    title !== listing.title || description !== listing.description;

  async function run(
    action: PendingAction,
    call: () => Promise<{ success: boolean; error?: string }>,
    success: string
  ) {
    if (!reasonReady) {
      return;
    }

    setPending(action);

    const result = await call();

    setPending(null);

    if (!result.success) {
      toast.error(result.error ?? "Something went wrong.");

      return;
    }

    toast.success(success);
    setReason("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`reason-${listing.id}`} className="text-xs font-medium">
          Reason — recorded permanently against this listing and its owner
        </label>
        <Textarea
          id={`reason-${listing.id}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={ADMIN_REASON_MAX}
          rows={3}
          placeholder="What is wrong with this listing, and why this action. Both are kept in the audit log."
          disabled={pending !== null}
        />
        {!reasonReady && (
          <p className="text-muted-foreground text-xs">
            At least {ADMIN_REASON_MIN} characters. Every action below requires
            one.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {removable.allowed && (
          <Button
            size="sm"
            variant="destructive"
            disabled={pending !== null || !reasonReady}
            aria-busy={pending === "remove"}
            onClick={() =>
              run(
                "remove",
                () => adminRemoveListing({ listingId: listing.id, reason }),
                "Listing removed. It can be restored."
              )
            }
          >
            {pending === "remove" ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <TrashIcon aria-hidden="true" />
            )}
            Remove listing
          </Button>
        )}

        {restorable.allowed && (
          <Button
            size="sm"
            disabled={pending !== null || !reasonReady}
            aria-busy={pending === "restore"}
            onClick={() =>
              run(
                "restore",
                () => adminRestoreListing({ listingId: listing.id, reason }),
                `Listing restored, ${RESTORED_LISTING_STATUS.toLowerCase()}. The owner decides when it goes back up.`
              )
            }
          >
            {pending === "restore" ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <RotateCcwIcon aria-hidden="true" />
            )}
            Restore listing
          </Button>
        )}
      </div>

      {/*
        A live rental is not a reason to refuse a removal - an unsafe item has to be able to come
        down while it is out - but it is a reason to say so out loud. Removing the listing does not
        cancel the booking, release the dates or return the deposit.
      */}
      {listing.activeBookingCount > 0 && removable.allowed && (
        <p className="text-destructive text-xs">
          {listing.activeBookingCount === 1
            ? "1 booking is live on this listing."
            : `${listing.activeBookingCount} bookings are live on this listing.`}{" "}
          Removing it does not cancel them, release the dates or return the
          deposit — someone still has to deal with the rental itself.
        </p>
      )}

      {editable.allowed && (
        <div className="flex flex-col gap-2 border-t pt-4">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-xs font-medium">
              Edit {ADMIN_EDITABLE_LISTING_FIELDS}
            </h3>
            {/*
              Says what this cannot do, and why. An administrator looking for the price field should
              find the reasoning rather than conclude the form is incomplete.
            */}
            <p className="text-muted-foreground text-xs">
              Prices, photos, city and category are the owner&apos;s to set — a
              booking is a contract over the price, and the photos are their
              evidence of the item&apos;s condition at handover. A listing wrong
              in those ways is one to remove, not to rewrite.
            </p>
          </div>

          <label
            htmlFor={`title-${listing.id}`}
            className="text-xs font-medium"
          >
            Title
          </label>
          <Input
            id={`title-${listing.id}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            minLength={TITLE_MIN}
            maxLength={TITLE_MAX}
            disabled={pending !== null}
          />

          <label
            htmlFor={`description-${listing.id}`}
            className="text-xs font-medium"
          >
            Description
          </label>
          <Textarea
            id={`description-${listing.id}`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            minLength={DESCRIPTION_MIN}
            maxLength={DESCRIPTION_MAX}
            rows={8}
            disabled={pending !== null}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending !== null || !reasonReady || !copyChanged}
              aria-busy={pending === "edit"}
              onClick={() =>
                run(
                  "edit",
                  () =>
                    adminEditListing({
                      listingId: listing.id,
                      title,
                      description,
                      reason,
                    }),
                  "Listing copy updated. The previous text is in the audit log."
                )
              }
            >
              {pending === "edit" ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <PencilIcon aria-hidden="true" />
              )}
              Save copy
            </Button>

            {copyChanged && (
              <Button
                size="sm"
                variant="ghost"
                disabled={pending !== null}
                onClick={() => {
                  setTitle(listing.title);
                  setDescription(listing.description);
                }}
              >
                Discard changes
              </Button>
            )}
          </div>

          {/*
            The old text is destroyed by this, unlike every other action here - a status is
            recoverable from the enum, a sentence is not. Said before the button, not after.
          */}
          <p className="text-muted-foreground text-xs">
            The current text is recorded in the audit log before it is
            overwritten. That row is the only remaining copy.
          </p>
        </div>
      )}

      {/*
        Why an action is missing. Policy, not accident.
      */}
      <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
        {!removable.allowed && <li>{removable.reason}</li>}
        {!editable.allowed && <li>{editable.reason}</li>}
      </ul>
    </div>
  );
}

export { ListingModerationPanel };
