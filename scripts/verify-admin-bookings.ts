// Booking oversight, verified against a real database.
//
// The unit tests cover the pure timeline: the ordering, and that a transition with no timestamp of
// its own is marked approximate. This covers what they cannot.
//
// The load-bearing property is that READING THIS SCREEN CHANGES NOTHING. Both parties' own booking
// queries deliberately sweep before reading - expiring stale requests, releasing reviews, escalating
// overdue claims - because a list that offers an action has to tell the truth at the moment it
// renders. This one offers no actions, and an oversight screen that mutates the thing it reports on
// cannot be read as evidence: an administrator would change a booking's history by looking at it.
// So the check is that a request already past its 48-hour window comes back still PENDING, flagged
// rather than expired, with no notifications written.
//
// Exercises the query layer and the database directly - there are no Server Actions here, by design.
//
// Creates its own throwaway rows and deletes them.

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  BookingStatus,
  ClaimReason,
  ClaimStatus,
  HandoverCondition,
  HandoverType,
  ListingStatus,
  PaymentMethod,
  PaymentStatus,
  ReviewType,
  UserStatus,
} from "../src/generated/prisma/enums";
import { PENDING_EXPIRY_HOURS } from "../src/lib/bookings/lifecycle";
import { buildBookingTimeline } from "../src/lib/bookings/timeline";
import {
  getAdminBookingDetail,
  searchAdminBookings,
} from "../src/lib/queries/admin-bookings";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}`, detail ?? "");
  }
}

const HOUR_MS = 3_600_000;
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function main() {
  const stamp = Date.now();
  const sub = await prisma.subcategory.findFirstOrThrow({
    select: { id: true, categoryId: true },
  });

  const owner = await prisma.user.create({
    data: { email: `ab-owner-${stamp}@example.test`, name: "AB Owner" },
    select: { id: true },
  });
  const renter = await prisma.user.create({
    data: { email: `ab-renter-${stamp}@example.test`, name: "AB Renter" },
    select: { id: true },
  });

  const listing = await prisma.listing.create({
    data: {
      ownerId: owner.id,
      categoryId: sub.categoryId,
      subcategoryId: sub.id,
      title: `AB Verify Drill Projector ${stamp}`,
      description: "Throwaway listing for booking-oversight verification.",
      condition: "GOOD",
      pricePerDay: 1200,
      securityDeposit: 20000,
      city: "lahore",
      status: ListingStatus.ACTIVE,
    },
    select: { id: true, title: true },
  });

  const bookingIds: string[] = [];

  const newBooking = async (data: {
    status: BookingStatus;
    startDate: Date;
    endDate: Date;
    createdAt?: Date;
    securityDeposit?: number;
  }) => {
    const booking = await prisma.booking.create({
      data: {
        listingId: listing.id,
        renterId: renter.id,
        ownerId: owner.id,
        totalPrice: 6000,
        securityDeposit: data.securityDeposit ?? 20000,
        status: data.status,
        startDate: data.startDate,
        endDate: data.endDate,
        ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      },
      select: { id: true },
    });

    bookingIds.push(booking.id);

    return booking;
  };

  // ------------------------------------------------------ 1. reading changes nothing
  console.log("\n=== a stale request is reported, never swept ===");

  const stale = await newBooking({
    status: BookingStatus.PENDING,
    startDate: day("2027-09-10"),
    endDate: day("2027-09-12"),
    // Comfortably past the window, so the sweep on a party's own screen would expire it.
    createdAt: new Date(Date.now() - (PENDING_EXPIRY_HOURS + 24) * HOUR_MS),
  });

  // The dates it holds, which a sweep would delete. Their survival is what proves nothing ran.
  await prisma.unavailableDate.createMany({
    data: [
      { listingId: listing.id, date: day("2027-09-10"), bookingId: stale.id },
      { listingId: listing.id, date: day("2027-09-11"), bookingId: stale.id },
    ],
  });

  const notificationsBefore = await prisma.notification.count({
    where: { userId: { in: [owner.id, renter.id] } },
  });

  const staleView = await searchAdminBookings({ userId: renter.id });
  const staleRow = staleView.items.find((row) => row.id === stale.id);

  check(
    "the queue flags it as past the 48-hour window",
    staleRow?.isPastPendingWindow === true,
    staleRow
  );

  const afterRead = await prisma.booking.findUniqueOrThrow({
    where: { id: stale.id },
    select: { status: true },
  });

  /**
   * The whole point. `getRenterBookings` would have expired this row before returning it; this
   * screen reports the row as it stands, so an administrator's lookup is an observation rather than
   * an event in the booking's history.
   */
  check(
    "and leaves it PENDING rather than expiring it",
    afterRead.status === BookingStatus.PENDING,
    afterRead
  );

  const heldAfterRead = await prisma.unavailableDate.count({
    where: { bookingId: stale.id },
  });

  check(
    "the dates it holds are still held",
    heldAfterRead === 2,
    heldAfterRead
  );

  const notificationsAfter = await prisma.notification.count({
    where: { userId: { in: [owner.id, renter.id] } },
  });

  check(
    "and nobody was notified by an administrator looking",
    notificationsAfter === notificationsBefore,
    { notificationsBefore, notificationsAfter }
  );

  // ------------------------------------------------------------------ 2. lookup
  console.log("\n=== finding a booking the way a support ticket arrives ===");

  const byId = await searchAdminBookings({ query: stale.id });

  check(
    "an exact booking id finds it",
    byId.total === 1 && byId.items[0]?.id === stale.id,
    byId.items.map((row) => row.id)
  );

  /**
   * Exact, not `contains`. A cuid fragment matches other bookings' ids by coincidence, and the whole
   * id is what a ticket carries - a partial match would bury the right row in noise.
   */
  const byFragment = await searchAdminBookings({
    query: stale.id.slice(0, 10),
  });

  check(
    "a partial id does not",
    !byFragment.items.some((row) => row.id === stale.id),
    byFragment.items.map((row) => row.id)
  );

  const byEmail = await searchAdminBookings({
    query: `ab-renter-${stamp}@example.test`,
  });

  check(
    "the renter's email address finds their bookings",
    byEmail.items.some((row) => row.id === stale.id),
    byEmail.total
  );

  const byOwnerName = await searchAdminBookings({ query: "AB Owner" });

  check(
    "so does the owner's name",
    byOwnerName.items.some((row) => row.id === stale.id),
    byOwnerName.total
  );

  const byTitle = await searchAdminBookings({
    query: `Projector ${stamp}`,
  });

  check(
    "and a fragment of the listing title",
    byTitle.items.some((row) => row.id === stale.id),
    byTitle.total
  );

  // ------------------------------------------------- 3. the dates are the rental period
  console.log("\n=== the date filter covers the rental, not the request ===");

  const summer = await newBooking({
    status: BookingStatus.COMPLETED,
    startDate: day("2027-08-10"),
    endDate: day("2027-08-15"),
    // Requested two months before the rental - the case a `createdAt` filter would lose.
    createdAt: day("2027-06-01"),
  });

  const inside = await searchAdminBookings({
    userId: renter.id,
    from: day("2027-08-12"),
    to: day("2027-08-12"),
  });

  /**
   * A single day inside the period matches, because the test is overlap rather than containment. The
   * support question is "the rental of the 12th", and the rental of the 12th started on the 10th.
   */
  check(
    "a day inside the rental matches it",
    inside.items.some((row) => row.id === summer.id),
    inside.items.map((row) => row.id)
  );

  const august = await searchAdminBookings({
    userId: renter.id,
    from: day("2027-08-01"),
    to: day("2027-08-31"),
  });

  check(
    "an August search finds a rental requested in June",
    august.items.some((row) => row.id === summer.id),
    august.items.map((row) => row.id)
  );

  const elsewhere = await searchAdminBookings({
    userId: renter.id,
    from: day("2027-08-20"),
    to: day("2027-08-25"),
  });

  check(
    "a range outside it does not",
    !elsewhere.items.some((row) => row.id === summer.id),
    elsewhere.items.map((row) => row.id)
  );

  // ------------------------------------------------------------- 4. status filters
  console.log("\n=== awaiting a party is three statuses, not one ===");

  const live = await newBooking({
    status: BookingStatus.ACTIVE,
    startDate: day("2027-07-01"),
    endDate: day("2027-07-05"),
  });

  const awaiting = await searchAdminBookings({
    userId: renter.id,
    awaitingOnly: true,
  });

  check(
    "a PENDING request is awaiting a party",
    awaiting.items.some((row) => row.id === stale.id),
    awaiting.items.map((row) => row.status)
  );

  /**
   * ACTIVE is excluded deliberately. An item out on rent is the system working, not a booking stuck
   * waiting for somebody - and a view that flagged every live rental would flag the healthy case.
   */
  check(
    "a live rental is not",
    !awaiting.items.some((row) => row.id === live.id),
    awaiting.items.map((row) => row.status)
  );

  const explicit = await searchAdminBookings({
    userId: renter.id,
    awaitingOnly: true,
    status: BookingStatus.ACTIVE,
  });

  check(
    "an explicit status wins over the awaiting filter rather than being overwritten",
    explicit.items.length > 0 &&
      explicit.items.every((row) => row.status === BookingStatus.ACTIVE),
    explicit.items.map((row) => row.status)
  );

  // ------------------------------------------------------- 5. both sides of a member
  console.log("\n=== one member, both sides of the booking ===");

  const asOwner = await searchAdminBookings({ userId: owner.id });

  check(
    "the owner's bookings include the ones they let out",
    asOwner.items.some((row) => row.id === live.id),
    asOwner.total
  );

  const asRenter = await searchAdminBookings({ userId: renter.id });

  check(
    "and the renter sees the same rental from their side",
    asRenter.items.some((row) => row.id === live.id),
    asRenter.total
  );

  // ---------------------------------------------------------------- 6. the detail
  console.log("\n=== the detail carries what a dispute turns on ===");

  const disputed = await newBooking({
    status: BookingStatus.COMPLETED,
    startDate: day("2027-05-01"),
    endDate: day("2027-05-04"),
    // Before every lifecycle timestamp set below. A default `createdAt` of now would put the request
    // *after* the collection, and the timeline would faithfully report that - which is the ordering
    // working, not failing.
    createdAt: new Date(Date.now() - 120 * HOUR_MS),
  });

  const payment = await prisma.payment.create({
    data: {
      method: PaymentMethod.BANK_TRANSFER,
      status: PaymentStatus.COMPLETED,
      amount: 6000,
      securityDeposit: 20000,
      // Ordered deliberately: requested 120h ago, paid 110h ago, collected 100h ago, back 60h ago.
      confirmedAt: new Date(Date.now() - 110 * HOUR_MS),
      confirmedById: owner.id,
    },
    select: { id: true },
  });

  await prisma.booking.update({
    where: { id: disputed.id },
    data: {
      paymentId: payment.id,
      startedAt: new Date(Date.now() - 100 * HOUR_MS),
      completedAt: new Date(Date.now() - 60 * HOUR_MS),
    },
  });

  const pickup = await prisma.handoverRecord.create({
    data: {
      bookingId: disputed.id,
      type: HandoverType.PICKUP,
      condition: HandoverCondition.AS_EXPECTED,
      notes: "Lens clean, no marks on the casing.",
      recordedById: owner.id,
    },
    select: { id: true },
  });

  await prisma.handoverRecord.create({
    data: {
      bookingId: disputed.id,
      type: HandoverType.RETURN,
      condition: HandoverCondition.DAMAGED,
      notes: "Crack across the lens housing.",
      recordedById: owner.id,
    },
    select: { id: true },
  });

  await prisma.damageClaim.create({
    data: {
      bookingId: disputed.id,
      claimantId: owner.id,
      respondentId: renter.id,
      reason: ClaimReason.DAMAGED,
      description: "The lens housing was cracked on return.",
      amountClaimed: 8000,
      handoverId: pickup.id,
      status: ClaimStatus.DISPUTED,
      respondedAt: new Date(Date.now() - 24 * HOUR_MS),
      responseNote: "It was already cracked when I collected it.",
    },
    select: { id: true },
  });

  // One review written and still withheld, because its counterpart never landed.
  await prisma.review.create({
    data: {
      bookingId: disputed.id,
      reviewerId: renter.id,
      revieweeId: owner.id,
      type: ReviewType.RENTER_TO_OWNER,
      rating: 2,
      comment: "Blamed me for damage that was already there.",
    },
    select: { id: true },
  });

  const detail = await getAdminBookingDetail(disputed.id);

  check(
    "both parties' email addresses are available for a support reply",
    detail?.renterEmail === `ab-renter-${stamp}@example.test` &&
      detail?.ownerEmail === `ab-owner-${stamp}@example.test`,
    { renter: detail?.renterEmail, owner: detail?.ownerEmail }
  );

  check(
    "both condition records are returned, pickup first",
    detail?.handovers.length === 2 &&
      detail.handovers[0]?.type === HandoverType.PICKUP,
    detail?.handovers.map((record) => record.type)
  );

  /**
   * The pickup record is the baseline the return is judged against, and the claims queue only shows
   * the return one - so a "it was already cracked" defence is only checkable from here.
   */
  check(
    "including the pickup baseline the claims queue does not show",
    detail?.handovers[0]?.condition === HandoverCondition.AS_EXPECTED,
    detail?.handovers[0]
  );

  check(
    "the claim and the renter's answer are both there",
    detail?.claim?.amountClaimed === 8000 &&
      detail.claim.responseNote?.includes("already cracked") === true,
    detail?.claim
  );

  /**
   * A live claim pauses the return clock and settles nothing. `upheldAmount` returns null while the
   * claim is open, so the platform is not acting on one party's demand.
   */
  check(
    "an undecided claim pauses the deposit clock rather than settling it",
    detail?.deposit.kind === "claimed" && detail.claim?.amountUpheld === null,
    detail?.deposit
  );

  /**
   * Reciprocal withholding is a rule between the two parties, not a secret from the platform - and
   * the review is the evidence in a dispute like this one. The moderation queue already hydrates
   * unpublished reviews for the same reason.
   */
  check(
    "a review still withheld from the other party is visible here",
    detail?.reviews.length === 1 && detail.reviews[0]?.publishedAt === null,
    detail?.reviews
  );

  const timeline = buildBookingTimeline({
    status: detail!.status,
    createdAt: detail!.createdAt,
    updatedAt: detail!.updatedAt,
    startedAt: detail!.startedAt,
    completedAt: detail!.completedAt,
    cancelledAt: detail!.cancelledAt,
    cancelledByRole: detail!.cancelledByRole,
    statusReason: detail!.statusReason,
    paymentConfirmedAt: detail!.paymentDetail?.confirmedAt ?? null,
    depositReturnedAt: detail!.paymentDetail?.depositReturnedAt ?? null,
  });

  check(
    "the timeline reads requested, paid, collected, returned",
    timeline.map((entry) => entry.kind).join(",") ===
      "requested,paid,started,completed",
    timeline.map((entry) => entry.kind)
  );

  // -------------------------------------------------- 7. who cancelled, by role
  console.log("\n=== a cancellation names the side, not just the person ===");

  const cancelled = await newBooking({
    status: BookingStatus.CANCELLED,
    startDate: day("2027-10-01"),
    endDate: day("2027-10-03"),
  });

  await prisma.booking.update({
    where: { id: cancelled.id },
    data: {
      cancelledAt: new Date(),
      cancelledById: renter.id,
      statusReason: "Plans changed.",
    },
  });

  const cancelledDetail = await getAdminBookingDetail(cancelled.id);

  check(
    "the renter's cancellation is attributed to the renter",
    cancelledDetail?.cancelledByRole === "renter" &&
      cancelledDetail.cancelledByName === "AB Renter",
    {
      role: cancelledDetail?.cancelledByRole,
      name: cancelledDetail?.cancelledByName,
    }
  );

  // ------------------------------------- 8. a suspended party does not hide the booking
  console.log("\n=== a suspended party does not hide the rental ===");

  await prisma.user.update({
    where: { id: renter.id },
    data: { status: UserStatus.SUSPENDED },
  });

  const afterSuspension = await searchAdminBookings({ userId: renter.id });
  const suspendedRow = afterSuspension.items.find((row) => row.id === live.id);

  /**
   * The booking is still there, and the row carries the standing so the screen can say why the
   * account looks odd. A deposit on a rental between two suspended accounts is still owed to
   * somebody, which is exactly when a support ticket arrives.
   */
  check(
    "the rental is still listed",
    suspendedRow !== undefined,
    afterSuspension.items.map((row) => row.id)
  );

  check(
    "and the row states the renter's standing",
    suspendedRow?.renter.status === UserStatus.SUSPENDED,
    suspendedRow?.renter
  );

  const unknown = await getAdminBookingDetail("no-such-booking-id");

  check(
    "an unknown id returns null, for a real 404",
    unknown === null,
    unknown
  );

  // ---------------------------------------------------------------- cleanup
  console.log("\n=== cleanup ===");

  await prisma.review.deleteMany({ where: { bookingId: { in: bookingIds } } });
  await prisma.damageClaim.deleteMany({
    where: { bookingId: { in: bookingIds } },
  });
  await prisma.handoverRecord.deleteMany({
    where: { bookingId: { in: bookingIds } },
  });
  await prisma.unavailableDate.deleteMany({
    where: { listingId: listing.id },
  });
  await prisma.notification.deleteMany({
    where: { userId: { in: [owner.id, renter.id] } },
  });
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await prisma.payment.deleteMany({ where: { id: payment.id } });
  await prisma.listing.deleteMany({ where: { id: listing.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [owner.id, renter.id] } },
  });

  console.log("  removed test rows");
  console.log(
    failures === 0
      ? "\nALL ADMIN BOOKING CHECKS PASSED\n"
      : `\n${failures} CHECK(S) FAILED\n`
  );

  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
