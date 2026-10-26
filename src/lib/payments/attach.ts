import { BookingStatus } from "@/generated/prisma/enums";
import { transitionBooking } from "@/lib/bookings/guard";
import { emitBookingEvent } from "@/lib/chat/booking-events";

import type { Prisma } from "@/generated/prisma/client";
import type {
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from "@/generated/prisma/enums";
import type { BookingForAction } from "@/lib/bookings/guard";
import type { CreatedNotification } from "@/lib/notifications/create";

/**
 * Creates a booking's `Payment` and moves the booking to PAYMENT_PENDING, in the caller's
 * transaction.
 *
 * SHARED BY THE BANK-TRANSFER AND CARD PATHS, which differ only in the three values passed in.
 * The lock and the comparison below are the part that has to be identical, and two copies of them
 * is how one path ends up without the check the other was given.
 *
 * Returns the notifications to publish, or `null` when the booking moved underneath the caller -
 * which the caller reports as a concurrent change.
 */
export async function attachPaymentToBooking(
  tx: Prisma.TransactionClient,
  booking: BookingForAction,
  payment: {
    provider: PaymentProvider;
    method: PaymentMethod;
    status: PaymentStatus;
  },
  actorId: string
): Promise<CreatedNotification[] | null> {
  /**
   * The terms being copied must still be the booking's terms.
   *
   * Chat made rent and deposit renegotiable while a booking is APPROVED, and the caller read the
   * booking before this transaction. Locking the row and comparing closes the gap: an offer
   * accepted in between makes this a concurrent change, and one accepted after waits on the lock
   * and then finds a payment attached, which ends renegotiation. The `bookings` trigger refuses a
   * mismatched payment regardless; this turns that into a message the renter can act on.
   */
  const [current] = await tx.$queryRaw<
    { totalPrice: number; securityDeposit: number }[]
  >`SELECT "totalPrice", "securityDeposit" FROM "bookings" WHERE "id" = ${booking.id} FOR UPDATE`;

  if (
    !current ||
    current.totalPrice !== booking.totalPrice ||
    current.securityDeposit !== booking.securityDeposit
  ) {
    return null;
  }

  const created = await tx.payment.create({
    data: {
      provider: payment.provider,
      method: payment.method,
      status: payment.status,
      // Copied from the booking, which captured them at request time - not re-read from the
      // listing, whose prices may have changed since.
      amount: booking.totalPrice,
      securityDeposit: booking.securityDeposit,
    },
    select: { id: true },
  });

  const moved = await transitionBooking(tx, {
    bookingId: booking.id,
    from: booking.status,
    to: BookingStatus.PAYMENT_PENDING,
    relations: { payment: { connect: { id: created.id } } },
  });

  if (!moved) {
    return null;
  }

  return emitBookingEvent(
    tx,
    {
      event: "payment-selected",
      bookingId: booking.id,
      listingTitle: booking.listing.title,
      parties: { renterId: booking.renterId, ownerId: booking.ownerId },
      method: payment.method,
      amount: booking.totalPrice,
    },
    { actorId }
  );
}
