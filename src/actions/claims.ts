"use server";

import { revalidatePath } from "next/cache";

import { ClaimStatus, HandoverType } from "@/generated/prisma/enums";
import { getActiveUser } from "@/lib/auth/session";
import {
  canFileClaim,
  canRespondToClaim,
  canWithdrawClaim,
} from "@/lib/claims/rules";
import { createNotifications } from "@/lib/notifications/create";
import { publishAfterCommit } from "@/lib/realtime/publish";
import { buildClaimNotifications } from "@/lib/notifications/claim-messages";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { CLAIM_REUSE_COPY, photoReuseError } from "@/lib/uploads/photo-reuse";
import { resolveOwnedPhotos } from "@/lib/uploads/resolve-photos";
import {
  fileClaimSchema,
  respondToClaimSchema,
  withdrawClaimSchema,
} from "@/lib/validations/claim";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ResolvedPhoto } from "@/lib/uploads/resolve-photos";
import type { ActionResult } from "@/types";

/**
 * Damage claims, from the two people in the rental.
 *
 * WHAT A CLAIM DOES, GIVEN THE PLATFORM HOLDS NOTHING. The deposit passes directly between owner and
 * renter and SamaanShare never touches it. So none of this moves money. What it changes is the
 * amount the platform STATES is owed back - see `depositState`, which now reads the settled figure.
 * Every message here is written on that side of the line: an upheld claim says the owner "may keep",
 * never that anything was transferred.
 *
 * BOTH PARTIES ARE DERIVED FROM THE BOOKING, never accepted from input. A client-supplied respondent
 * would let someone aim a demand for money at a person who was not party to the rental.
 *
 * NOTHING HERE DECIDES ANYTHING. Filing is an assertion. It becomes a settled figure only when the
 * renter accepts it or an administrator rules on it, and until then `upheldAmount` returns null and
 * the full deposit is still what the platform says is owed.
 */

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

/**
 * Claims per user per hour.
 *
 * Low, because one rental can only ever carry one claim and a person files these rarely. The limit
 * is really bounding a script walking every booking an account has.
 */
const CLAIM_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };

/**
 * Files a claim against a rental's deposit.
 *
 * The owner only. `loadBookingForParty` is not reused here because this needs the payment's deposit
 * figure and the return handover record in the same read, and the shared loader selects neither.
 */
/**
 * Has any of these images been offered as evidence before?
 *
 * TWO LOOKUPS, AND THEY DISAGREE ON ONE CASE ON PURPOSE.
 *
 * Any prior CLAIM photo is refused. The scam this table is most exposed to is one photograph of
 * damage filed against rental after rental, and there is no honest reading of the same image
 * turning up on two claims.
 *
 * A prior HANDOVER photo is refused only when it belongs to a DIFFERENT booking. On this booking
 * it is the expected thing: the damage recorded at the door, offered again as the basis of the
 * claim, which is the claim at its most credible rather than its least. Refusing that would
 * punish the owner who documented the problem properly - so those matches are dropped before the
 * decision rather than passed in and argued about.
 *
 * The checksums come from Cloudinary, not the browser - see `ResolvedPhoto.hash`. This runs
 * before the transaction opens, like the resolve above it. The unique index on `ClaimPhoto.hash`
 * is what actually enforces the first rule and this is for the message; the cross-booking
 * handover rule has no index behind it and is a read only, which the schema note records.
 */
async function claimPhotoReuseError(
  bookingId: string,
  photos: readonly ResolvedPhoto[]
): Promise<string | null> {
  const hashes = photos
    .map((photo) => photo.hash)
    .filter((hash): hash is string => hash !== null);

  if (hashes.length === 0) {
    // Still worth calling: it catches the same file twice in one submission, which needs no reads.
    return photoReuseError(photos, [], CLAIM_REUSE_COPY);
  }

  const [priorClaims, priorHandovers] = await Promise.all([
    prisma.claimPhoto.findMany({
      where: { hash: { in: hashes } },
      select: { hash: true, claim: { select: { bookingId: true } } },
    }),
    prisma.handoverPhoto.findMany({
      where: { hash: { in: hashes } },
      select: { hash: true, handover: { select: { bookingId: true } } },
    }),
  ]);

  const priorUses = [
    ...priorClaims.flatMap((row) =>
      row.hash === null
        ? []
        : [{ hash: row.hash, sameBooking: row.claim.bookingId === bookingId }]
    ),
    ...priorHandovers.flatMap((row) =>
      // This booking's own handover photo is allowed - see the note above.
      row.hash === null || row.handover.bookingId === bookingId
        ? []
        : [{ hash: row.hash, sameBooking: false }]
    ),
  ];

  return photoReuseError(photos, priorUses, CLAIM_REUSE_COPY);
}

export async function fileDamageClaim(input: unknown): Promise<ActionResult> {
  const parsed = fileClaimSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the claim.",
    };
  }

  const owner = await getActiveUser();

  if (!owner) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`claim:${owner.id}`, CLAIM_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many claims just now. Please try again shortly.",
    };
  }

  const { bookingId, reason, description, amountClaimed, photoIds } =
    parsed.data;

  try {
    const booking = await prisma.booking.findFirst({
      // Scoped to the owner: only the person owed the deposit can claim against it.
      where: { id: bookingId, ownerId: owner.id },
      select: {
        id: true,
        status: true,
        completedAt: true,
        listingId: true,
        ownerId: true,
        renterId: true,
        securityDeposit: true,
        listing: { select: { title: true } },
        payment: { select: { securityDeposit: true } },
        // Returning the deposit closes the window to claim against it.
        settlement: { select: { depositReturnedAt: true } },
        claim: { select: { id: true } },
        handovers: {
          where: { type: HandoverType.RETURN },
          select: { id: true },
        },
      },
    });

    if (!booking) {
      return { success: false, error: "That rental was not found." };
    }

    /**
     * The payment's figure wins, falling back to the booking's.
     *
     * Same precedence as `queries/bookings.ts`: the payment row is what the money actually moved
     * against, and a booking with no payment still has the amount agreed at request time.
     */
    const securityDeposit =
      booking.payment?.securityDeposit ?? booking.securityDeposit;

    const eligibility = canFileClaim({
      status: booking.status,
      completedAt: booking.completedAt,
      securityDeposit,
      depositReturnedAt: booking.settlement?.depositReturnedAt ?? null,
      alreadyClaimed: booking.claim !== null,
      amountClaimed,
    });

    if (!eligibility.allowed) {
      return { success: false, error: eligibility.reason };
    }

    // Resolved before the transaction opens - an outbound Cloudinary call, and holding a connection
    // across one is what produced the P2028 timeouts Stage A4 removed.
    const photos = await resolveOwnedPhotos(owner.id, photoIds);

    if (!photos.ok) {
      return { success: false, error: photos.error };
    }

    const reuse = await claimPhotoReuseError(booking.id, photos.photos);

    if (reuse) {
      return { success: false, error: reuse };
    }

    /**
     * The return condition record this claim rests on, when there is one.
     *
     * Attached whether or not it supports the claim. An owner who graded the item as expected and is
     * now claiming damage is not blocked - hidden faults are real - but the contradiction travels
     * with the claim to whoever resolves it, which is far more useful than a refusal.
     */
    const handoverId = booking.handovers[0]?.id ?? null;

    const filed = await prisma.$transaction(async (tx) => {
      await tx.damageClaim.create({
        data: {
          bookingId: booking.id,
          claimantId: booking.ownerId,
          // Derived, never supplied. This is the person the money is being asked from.
          respondentId: booking.renterId,
          reason,
          description,
          amountClaimed,
          ...(handoverId ? { handoverId } : {}),
          ...(photos.photos.length > 0
            ? {
                photos: {
                  create: photos.photos.map((photo) => ({
                    url: photo.url,
                    publicId: photo.publicId,
                    order: photo.order,
                    // Conditional: `exactOptionalPropertyTypes` refuses an explicit `undefined`.
                    ...(photo.hash ? { hash: photo.hash } : {}),
                    uploadedById: owner.id,
                  })),
                },
              }
            : {}),
        },
        select: { id: true },
      });

      const notifications = await createNotifications(
        tx,
        buildClaimNotifications({
          bookingId: booking.id,
          listingTitle: booking.listing.title,
          parties: { renterId: booking.renterId, ownerId: booking.ownerId },
          event: { event: "filed", amountClaimed },
        })
      );

      return notifications;
    });

    publishAfterCommit(filed);

    revalidateClaimPaths();

    return { success: true, data: undefined };
  } catch (error) {
    console.error("fileDamageClaim failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * The renter accepts or disputes a claim.
 *
 * Accepting SETTLES IT with no administrator involved - the two people agree, and there is nothing
 * left for a third to decide. Disputing sends it to the queue.
 */
export async function respondToDamageClaim(
  input: unknown
): Promise<ActionResult> {
  const parsed = respondToClaimSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check your reply.",
    };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`claim-respond:${user.id}`, CLAIM_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  const { claimId, accepted, note, photoIds } = parsed.data;

  try {
    const claim = await prisma.damageClaim.findFirst({
      // Membership enforced in the query: a stranger gets "not found", identical to a claim that
      // does not exist, so this cannot be used to probe ids.
      where: {
        id: claimId,
        booking: { OR: [{ ownerId: user.id }, { renterId: user.id }] },
      },
      select: {
        id: true,
        status: true,
        amountClaimed: true,
        respondentId: true,
        booking: {
          select: {
            id: true,
            ownerId: true,
            renterId: true,
            listing: { select: { title: true } },
          },
        },
      },
    });

    if (!claim) {
      return { success: false, error: "That claim was not found." };
    }

    const eligibility = canRespondToClaim(
      claim.status,
      claim.respondentId === user.id
    );

    if (!eligibility.allowed) {
      return { success: false, error: eligibility.reason };
    }

    const photos = await resolveOwnedPhotos(user.id, photoIds);

    if (!photos.ok) {
      return { success: false, error: photos.error };
    }

    const reuse = await claimPhotoReuseError(claim.booking.id, photos.photos);

    if (reuse) {
      return { success: false, error: reuse };
    }

    const created = await prisma.$transaction(async (tx) => {
      /**
       * Compare-and-swap on `OPEN`.
       *
       * The escalation sweep may have moved this claim to `DISPUTED` between the read above and this
       * write - it runs on the read paths - and without the guard a renter's late "I accept" would
       * settle a claim that had already gone to an administrator.
       *
       * `amountUpheld` is set only on acceptance: the renter agreeing to a figure is what settles it.
       * A dispute leaves it null, because nothing has been decided.
       */
      const claimed = await tx.damageClaim.updateMany({
        where: { id: claim.id, status: ClaimStatus.OPEN },
        data: {
          status: accepted ? ClaimStatus.ACCEPTED : ClaimStatus.DISPUTED,
          respondedAt: new Date(),
          ...(note ? { responseNote: note } : {}),
          ...(accepted ? { amountUpheld: claim.amountClaimed } : {}),
        },
      });

      if (claimed.count === 0) {
        return null;
      }

      if (photos.photos.length > 0) {
        await tx.claimPhoto.createMany({
          data: photos.photos.map((photo) => ({
            claimId: claim.id,
            url: photo.url,
            publicId: photo.publicId,
            ...(photo.hash ? { hash: photo.hash } : {}),
            // Ordered after the claimant's, so the two sets stay in the sequence they were added.
            order: 100 + photo.order,
            uploadedById: user.id,
          })),
        });
      }

      return createNotifications(
        tx,
        buildClaimNotifications({
          bookingId: claim.booking.id,
          listingTitle: claim.booking.listing.title,
          parties: {
            renterId: claim.booking.renterId,
            ownerId: claim.booking.ownerId,
          },
          event: {
            event: "answered",
            accepted,
            amountClaimed: claim.amountClaimed,
          },
        })
      );
    });

    if (!created) {
      return {
        success: false,
        error: "This claim has already moved on. Please refresh.",
      };
    }

    publishAfterCommit(created);

    revalidateClaimPaths();

    return { success: true, data: undefined };
  } catch (error) {
    console.error("respondToDamageClaim failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * The owner takes their claim back.
 *
 * Permitted right up until it is settled, including after it has reached an administrator: an owner
 * who has thought better of it, or been paid directly, should not have to wait for a ruling on a
 * claim nobody is pursuing. Withdrawing settles at nothing, so the whole deposit becomes owed again.
 */
export async function withdrawDamageClaim(
  input: unknown
): Promise<ActionResult> {
  const parsed = withdrawClaimSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: "That claim was not found." };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`claim-withdraw:${user.id}`, CLAIM_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  try {
    const claim = await prisma.damageClaim.findFirst({
      where: {
        id: parsed.data.claimId,
        booking: { OR: [{ ownerId: user.id }, { renterId: user.id }] },
      },
      select: {
        id: true,
        status: true,
        claimantId: true,
        booking: {
          select: {
            id: true,
            ownerId: true,
            renterId: true,
            listing: { select: { title: true } },
          },
        },
      },
    });

    if (!claim) {
      return { success: false, error: "That claim was not found." };
    }

    const eligibility = canWithdrawClaim(
      claim.status,
      claim.claimantId === user.id
    );

    if (!eligibility.allowed) {
      return { success: false, error: eligibility.reason };
    }

    const created = await prisma.$transaction(async (tx) => {
      const claimed = await tx.damageClaim.updateMany({
        // Both live states, so a claim escalated between the read and the write is still withdrawable.
        where: {
          id: claim.id,
          status: { in: [ClaimStatus.OPEN, ClaimStatus.DISPUTED] },
        },
        data: {
          status: ClaimStatus.WITHDRAWN,
          // Settled at nothing: the full deposit is owed again.
          amountUpheld: 0,
        },
      });

      if (claimed.count === 0) {
        return null;
      }

      return createNotifications(
        tx,
        buildClaimNotifications({
          bookingId: claim.booking.id,
          listingTitle: claim.booking.listing.title,
          parties: {
            renterId: claim.booking.renterId,
            ownerId: claim.booking.ownerId,
          },
          event: { event: "withdrawn" },
        })
      );
    });

    if (!created) {
      return {
        success: false,
        error: "This claim has already been settled.",
      };
    }

    publishAfterCommit(created);

    revalidateClaimPaths();

    return { success: true, data: undefined };
  } catch (error) {
    console.error("withdrawDamageClaim failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * Refreshes the surfaces a claim changes.
 *
 * Both dashboards, because a claim shows on the booking row for each party, and the notifications
 * feed. The admin queue too, since a dispute lands there immediately.
 */
function revalidateClaimPaths(): void {
  for (const path of [
    "/dashboard/bookings",
    "/dashboard/requests",
    "/dashboard/notifications",
    "/admin/claims",
  ]) {
    revalidatePath(path, "page");
  }

  revalidatePath("/dashboard", "layout");
}
