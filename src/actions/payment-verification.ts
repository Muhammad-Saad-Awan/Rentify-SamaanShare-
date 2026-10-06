"use server";

import { revalidatePath } from "next/cache";

import { COMMISSION_RATE_BPS } from "@/config/commission";
import {
  AdminActionType,
  BookingStatus,
  PaymentStatus,
} from "@/generated/prisma/enums";
import { writeAdminAction } from "@/lib/admin/log";
import { getActiveAdmin, getActiveUser } from "@/lib/auth/session";
import {
  LIFECYCLE_RATE_LIMIT,
  loadBookingForParty,
} from "@/lib/bookings/guard";
import { postBookingThreadLine } from "@/lib/chat/booking-events";
import { createNotifications } from "@/lib/notifications/create";
import { buildPaymentNotifications } from "@/lib/notifications/payment-messages";
import { computeCommission } from "@/lib/payments/commission";
import { publishAfterCommit } from "@/lib/realtime/publish";
import { prisma } from "@/lib/prisma";
import { resolveOwnedPhotos } from "@/lib/uploads/resolve-photos";
import { checkRateLimit } from "@/lib/rate-limit";
import { formatPKR } from "@/lib/utils/currency";
import {
  rejectPaymentSchema,
  reverseVerificationSchema,
  submitPaymentEvidenceSchema,
  verifyPaymentSchema,
} from "@/lib/validations/payment";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * Custodial payment verification: the renter pays SamaanShare, an administrator confirms it.
 *
 * A SEPARATE FILE FROM `payments.ts`, WHICH DESCRIBES A DIFFERENT MODEL. That one opens by saying
 * "nothing in this file moves money" - payment there is cash between two people and the owner
 * vouches for it. Here the platform holds the money and an administrator decides whether it
 * arrived. Both flows exist while the old one is retired; putting them in one file would leave a
 * module whose header contradicts half its contents.
 *
 * THE BOOKING LIFECYCLE IS NOT TOUCHED BY ANY OF THIS. Verifying money and starting a rental are
 * separate events, often days apart, and `canStartBooking()` already gates the handover on
 * `Payment.status === COMPLETED`. Every action here moves the payment and leaves the booking
 * exactly where it was, which is what keeps that gate meaningful rather than incidental.
 *
 * EVERY WRITE IS A COMPARE-AND-SWAP. `updateMany` with the expected status in its `where` decides
 * the race in the database rather than in a read-then-write that two administrators can both
 * pass. A count of zero means somebody else got there first, and that is reported rather than
 * overwritten.
 */

const CONCURRENT_CHANGE_ERROR =
  "This payment was just updated somewhere else. Please refresh and try again.";

const NOT_FOUND_ERROR = "That booking was not found.";

/**
 * Word-for-word the same as `NOT_FOUND_ERROR`, and named separately on purpose.
 *
 * A non-administrator must not be able to tell "no such booking" from "you may not touch this
 * one" - the second confirms the booking exists and that an admin surface acts on it. Two
 * constants with one string says that is intended, where a single shared one would look like
 * somebody had simply reused the nearest message.
 */
const ADMIN_ONLY_ERROR = NOT_FOUND_ERROR;

/**
 * Statuses a renter may still submit or correct evidence from.
 *
 * Deliberately includes `PENDING_VERIFICATION` - a renter who mistyped a reference must be able
 * to fix it while it sits in the queue - and `REJECTED`, because a refusal is the end of one
 * attempt rather than of the booking. `COMPLETED` is absent, which is the point: once an
 * administrator has verified it, the reference is a record of something that happened.
 */
const SUBMITTABLE_FROM: PaymentStatus[] = [
  PaymentStatus.AWAITING_CONFIRMATION,
  PaymentStatus.PENDING_VERIFICATION,
  PaymentStatus.REJECTED,
];

/**
 * Refreshes the surfaces a payment decision touches.
 *
 * Mirrors `revalidateBookingPaths` in `payments.ts`, plus the admin queue - which is the one
 * screen where a stale row means two administrators working the same payment.
 */
function revalidatePaymentPaths(): void {
  for (const path of [
    "/dashboard/bookings",
    "/dashboard/requests",
    "/admin/payments",
    "/admin/bookings",
  ]) {
    revalidatePath(path, "page");
  }

  revalidatePath("/dashboard", "layout");
}

/**
 * Loads a booking and its payment for an administrator.
 *
 * `loadBookingForParty` cannot serve this: it puts `ownerId` or `renterId` into the `where`,
 * which is exactly right for the two parties and wrong for an administrator, who is party to
 * nothing. Authorisation here is the `getActiveAdmin()` check at the top of each caller.
 */
async function loadBookingForAdmin(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      renterId: true,
      ownerId: true,
      // For the notification copy - see `buildPaymentNotifications`.
      listing: { select: { title: true } },
      payment: {
        select: {
          id: true,
          status: true,
          method: true,
          amount: true,
          transactionRef: true,
          commissionRateBps: true,
        },
      },
    },
  });
}

/**
 * The renter records that they have paid, and how it can be found.
 *
 * Moves the payment into the verification queue. It does NOT move the booking: the rental is not
 * closer to starting because somebody said they paid, only because an administrator agreed.
 */
export async function submitPaymentEvidence(
  input: unknown
): Promise<ActionResult<{ paymentStatus: PaymentStatus }>> {
  const parsed = submitPaymentEvidenceSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? NOT_FOUND_ERROR,
    };
  }

  const renter = await getActiveUser();

  if (!renter) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(
    `payment-evidence:${renter.id}`,
    LIFECYCLE_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many attempts. Please wait a moment and try again.",
    };
  }

  const { bookingId, transactionRef, proofPublicId } = parsed.data;

  /**
   * Loaded as the RENTER, so a booking belonging to somebody else is indistinguishable from one
   * that does not exist - the authorisation is in the query predicate, not in a comparison
   * afterwards. See the note on `loadBookingForParty`.
   */
  const booking = await loadBookingForParty({
    bookingId,
    userId: renter.id,
    side: "renter",
  });

  if (!booking) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  if (booking.status !== BookingStatus.PAYMENT_PENDING) {
    return {
      success: false,
      error:
        booking.status === BookingStatus.APPROVED
          ? "Choose how you will pay before recording a payment."
          : "This booking is not waiting for a payment.",
    };
  }

  if (!booking.payment) {
    return { success: false, error: "This booking has no payment to record." };
  }

  const payment = booking.payment;

  if (payment.status === PaymentStatus.COMPLETED) {
    // Idempotent rather than an error: the renter is looking at a stale page, not doing anything wrong.
    return {
      success: true,
      data: { paymentStatus: PaymentStatus.COMPLETED },
    };
  }

  /**
   * The receipt, resolved rather than accepted.
   *
   * `resolveOwnedPhotos` checks the id is in THIS member's own upload folder and returns
   * Cloudinary's URL and checksum from the Admin API. Both used to arrive from the browser, and
   * the checksum is the thing the duplicate-receipt constraint rests on - see the note on the
   * schema. Resolved outside the transaction, because it makes an outbound HTTP request.
   */
  let proof: { publicId: string; url: string; hash: string | null } | null =
    null;

  if (proofPublicId) {
    const resolved = await resolveOwnedPhotos(renter.id, [proofPublicId]);

    if (!resolved.ok || !resolved.photos[0]) {
      return { success: false, error: "That receipt could not be attached." };
    }

    proof = {
      // Carried through rather than closed over, so the write below narrows without an assertion.
      publicId: proofPublicId,
      url: resolved.photos[0].url,
      hash: resolved.photos[0].hash,
    };
  }

  try {
    const applied = await prisma.payment.updateMany({
      where: { id: payment.id, status: { in: SUBMITTABLE_FROM } },
      data: {
        status: PaymentStatus.PENDING_VERIFICATION,
        transactionRef,
        submittedAt: new Date(),
        /**
         * A resubmission clears the previous refusal. Leaving `rejectionReason` in place would
         * show the renter why their last attempt failed next to the one they just made.
         */
        rejectedAt: null,
        rejectionReason: null,
        ...(proof
          ? {
              proofUrl: proof.url,
              proofPublicId: proof.publicId,
              // Null when Cloudinary sent no etag - unverifiable, not suspect. See `ResolvedPhoto`.
              ...(proof.hash ? { proofHash: proof.hash } : {}),
            }
          : {}),
      },
    });

    if (applied.count !== 1) {
      return { success: false, error: CONCURRENT_CHANGE_ERROR };
    }
  } catch {
    /**
     * The likely failure is a unique violation: this reference, or this screenshot, already
     * belongs to another payment. Reported as what it is rather than as a generic error, because
     * the honest cause is almost always a renter pasting the wrong booking's receipt.
     */
    return {
      success: false,
      error:
        "That transaction reference or receipt is already recorded against another booking.",
    };
  }

  revalidatePaymentPaths();

  return {
    success: true,
    data: { paymentStatus: PaymentStatus.PENDING_VERIFICATION },
  };
}

/**
 * An administrator confirms the money arrived.
 *
 * FREEZES THE COMMISSION RATE. From here the owner can be told what they will receive, and that
 * figure must not move because somebody edited `COMMISSION_RATE_BPS` afterwards. Settlement reads
 * the frozen value, never the current one - which is what makes the constant safe to change.
 *
 * Does not move the booking. `canStartBooking()` reads `Payment.status`, so this is what unblocks
 * the handover, and keeping the two separate is what lets an owner confirm money on Monday and
 * hand the item over on Wednesday without the record claiming otherwise.
 */
export async function verifyPayment(
  input: unknown
): Promise<
  ActionResult<{ paymentStatus: PaymentStatus; commissionRateBps: number }>
> {
  const parsed = verifyPaymentSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  const admin = await getActiveAdmin();

  if (!admin) {
    return { success: false, error: ADMIN_ONLY_ERROR };
  }

  const booking = await loadBookingForAdmin(parsed.data.bookingId);

  if (!booking?.payment) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  const payment = booking.payment;

  if (payment.status === PaymentStatus.COMPLETED) {
    return {
      success: true,
      data: {
        paymentStatus: PaymentStatus.COMPLETED,
        commissionRateBps: payment.commissionRateBps ?? COMMISSION_RATE_BPS,
      },
    };
  }

  if (payment.status !== PaymentStatus.PENDING_VERIFICATION) {
    return {
      success: false,
      error: "This payment is not waiting to be verified.",
    };
  }

  const rateBps = COMMISSION_RATE_BPS;

  /**
   * Computed here only so the audit line can state it. The figures are not stored on the payment:
   * settlement recomputes them from the frozen rate when it writes the `Settlement` row, and two
   * copies of the same arithmetic is two places for it to disagree.
   */
  const { commissionAmount, ownerRentalAmount } = computeCommission({
    rentalAmount: payment.amount,
    rateBps,
  });

  const verifiedAt = new Date();

  const created = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING_VERIFICATION },
      data: {
        status: PaymentStatus.COMPLETED,
        confirmedAt: verifiedAt,
        confirmedById: admin.id,
        commissionRateBps: rateBps,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    /**
     * The subject is the RENTER: this is a decision about their payment, and it is their account
     * history a later reviewer would be reading. Settlement, when it lands, is about the owner.
     *
     * `AdminAction.reason` is required, and a verification's reason is genuinely in the data - the
     * reference, the amount, the split it implies. Synthesising it from those is more useful than
     * demanding prose that would read "ok".
     */
    await writeAdminAction(tx, {
      actorId: admin.id,
      subjectId: booking.renterId,
      type: AdminActionType.VERIFY_PAYMENT,
      reason:
        `Verified ${formatPKR(payment.amount)} by ${payment.method}` +
        `${payment.transactionRef ? ` against reference ${payment.transactionRef}` : ""}` +
        `. Commission ${rateBps}bps = ${formatPKR(commissionAmount)}, owner rental ${formatPKR(ownerRentalAmount)}.` +
        `${parsed.data.note ? ` ${parsed.data.note}` : ""}`,
      previousValue: PaymentStatus.PENDING_VERIFICATION,
      newValue: PaymentStatus.COMPLETED,
    });

    /**
     * Both parties, in the same transaction as the decision - the house rule for every
     * notification here. The owner's copy is the one that matters most: the handover is gated on
     * this payment, so this is what tells them they may hand the item over.
     */
    // Into the thread too: the owner may now hand over, and both are usually arranging it there.
    await postBookingThreadLine(tx, {
      bookingId: booking.id,
      event: { event: "payment-verified" },
      actorId: null,
    });

    return createNotifications(
      tx,
      buildPaymentNotifications({
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
        event: { event: "verified", amount: payment.amount },
      })
    );
  });

  if (!created) {
    return { success: false, error: CONCURRENT_CHANGE_ERROR };
  }

  publishAfterCommit(created);

  revalidatePaymentPaths();

  return {
    success: true,
    data: {
      paymentStatus: PaymentStatus.COMPLETED,
      commissionRateBps: rateBps,
    },
  };
}

/**
 * An administrator could not match the payment.
 *
 * NOT TERMINAL FOR THE BOOKING. The renter may correct the reference and submit again - a wrong
 * digit is the common case, and closing the booking over one would be a punishment for a typo.
 * The booking stays in `PAYMENT_PENDING` and expires on its own schedule if nothing follows.
 */
export async function rejectPayment(
  input: unknown
): Promise<ActionResult<{ paymentStatus: PaymentStatus }>> {
  const parsed = rejectPaymentSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? NOT_FOUND_ERROR,
    };
  }

  const admin = await getActiveAdmin();

  if (!admin) {
    return { success: false, error: ADMIN_ONLY_ERROR };
  }

  const booking = await loadBookingForAdmin(parsed.data.bookingId);

  if (!booking?.payment) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  const payment = booking.payment;

  if (payment.status !== PaymentStatus.PENDING_VERIFICATION) {
    return {
      success: false,
      error:
        payment.status === PaymentStatus.COMPLETED
          ? "This payment is already verified. Reverse the verification instead."
          : "This payment is not waiting to be verified.",
    };
  }

  const rejectedAt = new Date();

  const created = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING_VERIFICATION },
      data: {
        status: PaymentStatus.REJECTED,
        rejectedAt,
        rejectionReason: parsed.data.reason,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    await writeAdminAction(tx, {
      actorId: admin.id,
      subjectId: booking.renterId,
      type: AdminActionType.REJECT_PAYMENT,
      reason: parsed.data.reason,
      previousValue: PaymentStatus.PENDING_VERIFICATION,
      newValue: PaymentStatus.REJECTED,
    });

    // The renter alone, carrying the reason - without it this is "open the app and guess".
    return createNotifications(
      tx,
      buildPaymentNotifications({
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
        event: { event: "rejected", reason: parsed.data.reason },
      })
    );
  });

  if (!created) {
    return { success: false, error: CONCURRENT_CHANGE_ERROR };
  }

  publishAfterCommit(created);

  revalidatePaymentPaths();

  return { success: true, data: { paymentStatus: PaymentStatus.REJECTED } };
}

/**
 * An administrator undoes a verification they should not have made.
 *
 * ONLY WHILE THE BOOKING HAS NOT MOVED. Once the rental is `ACTIVE` the owner has handed over an
 * item on the strength of this verification, and quietly retracting it would leave them holding
 * nothing and owed nothing on a record that says the money never arrived. Past that point the
 * remedy is a refund or a claim, both of which are somebody deciding what to do - not a status
 * being rolled back.
 *
 * Returns the payment to the queue rather than rejecting it outright, because the usual cause is
 * "verified the wrong row", which deserves another look rather than a refusal. The frozen
 * commission rate is cleared with it: nothing has been promised to the owner yet, so the next
 * verification should freeze whatever rate is current then.
 */
export async function reverseVerification(
  input: unknown
): Promise<ActionResult<{ paymentStatus: PaymentStatus }>> {
  const parsed = reverseVerificationSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? NOT_FOUND_ERROR,
    };
  }

  const admin = await getActiveAdmin();

  if (!admin) {
    return { success: false, error: ADMIN_ONLY_ERROR };
  }

  const booking = await loadBookingForAdmin(parsed.data.bookingId);

  if (!booking?.payment) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  const payment = booking.payment;

  if (payment.status !== PaymentStatus.COMPLETED) {
    return {
      success: false,
      error: "This payment is not verified, so there is nothing to reverse.",
    };
  }

  if (booking.status !== BookingStatus.PAYMENT_PENDING) {
    return {
      success: false,
      error:
        "The rental has already moved on from payment. Record a refund or open a claim instead.",
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.COMPLETED },
      data: {
        status: PaymentStatus.PENDING_VERIFICATION,
        confirmedAt: null,
        confirmedById: null,
        commissionRateBps: null,
      },
    });

    if (updated.count !== 1) {
      return null;
    }

    await writeAdminAction(tx, {
      actorId: admin.id,
      subjectId: booking.renterId,
      type: AdminActionType.REVERSE_PAYMENT_VERIFICATION,
      reason: parsed.data.reason,
      previousValue: PaymentStatus.COMPLETED,
      newValue: PaymentStatus.PENDING_VERIFICATION,
    });

    /**
     * The renter was already told their payment was confirmed. Undoing that silently and leaving
     * them to notice the status had moved backwards would be worse than the mistake being fixed.
     */
    return createNotifications(
      tx,
      buildPaymentNotifications({
        bookingId: booking.id,
        listingTitle: booking.listing.title,
        parties: { renterId: booking.renterId, ownerId: booking.ownerId },
        event: {
          event: "verification-reversed",
          reason: parsed.data.reason,
        },
      })
    );
  });

  if (!created) {
    return { success: false, error: CONCURRENT_CHANGE_ERROR };
  }

  publishAfterCommit(created);

  revalidatePaymentPaths();

  return {
    success: true,
    data: { paymentStatus: PaymentStatus.PENDING_VERIFICATION },
  };
}
