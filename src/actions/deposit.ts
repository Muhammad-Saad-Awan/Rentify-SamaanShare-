"use server";

import { revalidatePath } from "next/cache";

import { getActiveUser } from "@/lib/auth/session";
import {
  LIFECYCLE_RATE_LIMIT,
  loadBookingForParty,
} from "@/lib/bookings/guard";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { bookingActionSchema } from "@/lib/validations/booking";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * The renter's half of the deposit-return record.
 *
 * Returning the deposit was recorded by exactly one person: the owner under the offline flow, an
 * administrator under the custodial one. Both are the SENDER saying they sent it, and a transfer
 * reference only ever proves money left an account. Whether it arrived is a fact only the renter
 * has, and until this there was nowhere for them to state it - the renter's booking card said
 * "the owner recorded your deposit as returned" and offered nothing to do about it.
 *
 * ON `Booking`, NOT ON `Settlement`, and the reason has outlived the one it was written for.
 * It went there so a single column could serve the offline and the custodial flow while both
 * existed; the offline one is gone now, and it stays because a renter's acknowledgement is a
 * fact about the rental rather than about the row that happens to record the transfer.
 *
 * WHAT THIS IS NOT. It is not a release, an approval, or a condition on anything: the money has
 * already moved, and nothing downstream waits on this. It is a record, and its value is entirely
 * in the case where it is ABSENT while a return has been recorded - see the note on silence
 * below, and `describeDepositState`, which is careful to say the record is one-sided rather than
 * to say the deposit came back.
 *
 * THERE IS NO "I DID NOT RECEIVE IT" HERE, and its absence is deliberate rather than overlooked.
 * A dispute is not the opposite of a confirmation - it is a claim that needs somewhere to be
 * read, somebody accountable for answering it, and a way for the renter to hear back. That is the
 * damage-claim machinery in reverse, and stubbing it as a boolean would offer a button that
 * silently does nothing for the person who most needs it to work.
 */

const NOT_FOUND_ERROR = "That booking was not found.";

/**
 * The renter confirms the security deposit reached them.
 *
 * IDEMPOTENT, AND THE TIMESTAMP NEVER MOVES. It records when the renter said so, and a second
 * press - or a stale page - must not rewrite that. The compare-and-swap carries `renterId` as
 * well as the null check, so authorisation is in the write predicate and not only in the read
 * that preceded it.
 */
export async function confirmDepositReturn(
  input: unknown
): Promise<ActionResult<{ confirmedAt: Date }>> {
  const parsed = bookingActionSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  const renter = await getActiveUser();

  if (!renter) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(
    `deposit-confirm:${renter.id}`,
    LIFECYCLE_RATE_LIMIT
  );

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many changes just now. Please try again shortly.",
    };
  }

  /**
   * Loaded as the RENTER, so an owner - or anybody else - cannot confirm receipt on their
   * behalf. That is the whole point of the record: it is worth nothing if the person who sent
   * the money can also be the one who says it arrived.
   */
  const booking = await loadBookingForParty({
    bookingId: parsed.data.bookingId,
    userId: renter.id,
    side: "renter",
  });

  if (!booking) {
    return { success: false, error: NOT_FOUND_ERROR };
  }

  if (booking.depositConfirmedAt) {
    return { success: true, data: { confirmedAt: booking.depositConfirmedAt } };
  }

  /**
   * Nothing to confirm until a return has been recorded.
   *
   * This single check covers the cases that would otherwise each need one: a rental still
   * running, a booking with no deposit, and a claim that consumed the whole deposit all reach
   * here with no stamp on either side, because nothing records a return in any of them.
   */
  if (!booking.settlement?.depositReturnedAt) {
    return {
      success: false,
      error:
        "No deposit return has been recorded for this booking yet, so there is nothing to confirm.",
    };
  }

  const confirmedAt = new Date();

  const applied = await prisma.booking.updateMany({
    where: {
      id: booking.id,
      renterId: renter.id,
      depositConfirmedAt: null,
    },
    data: { depositConfirmedAt: confirmedAt },
  });

  if (applied.count !== 1) {
    return {
      success: false,
      error:
        "This booking was just updated somewhere else. Please refresh and try again.",
    };
  }

  /**
   * No notification. Telling the owner "the renter agrees you paid them" is the expected outcome
   * of something they already know they did, and a notification for the expected path is the
   * noise that makes an unread badge untrustworthy - the same reasoning that keeps an AGREED
   * handover silent. The case worth hearing about is the opposite one, and that is the dispute
   * path this deliberately does not fake.
   */
  for (const path of [
    "/dashboard/bookings",
    "/dashboard/requests",
    "/admin/bookings",
  ]) {
    revalidatePath(path, "page");
  }

  revalidatePath("/dashboard", "layout");

  return { success: true, data: { confirmedAt } };
}
