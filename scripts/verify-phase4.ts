// Phase 4 end-to-end verification against the real database.
//
// The unit tests cover the pure rules. This covers what they cannot: the transactional
// behaviour - that a status change and its notification are atomic, that completing and
// cancelling actually release the held dates, that the compare-and-swap guard makes a
// concurrent transition lose, and that the timestamps land where the deposit clock reads them.
//
// Creates its own throwaway users and listing, and deletes everything at the end.

import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

import {
  BookingStatus,
  PaymentProvider,
  PaymentStatus,
} from "../src/generated/prisma/enums";
import { PrismaClient } from "../src/generated/prisma/client";
import { depositState } from "../src/lib/bookings/deposit";
import { releaseHeldDates, transitionBooking } from "../src/lib/bookings/guard";
import { emitBookingNotifications } from "../src/lib/notifications/create";

dotenv.config({ path: ".env.local" });

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

const TAG = "phase4-verify";

async function main() {
  console.log("\n=== setup ===");

  const subcategory = await prisma.subcategory.findFirst({
    select: { id: true, categoryId: true },
  });

  if (!subcategory) {
    throw new Error("No subcategory seeded - run npm run db:seed first.");
  }

  const owner = await prisma.user.create({
    data: {
      email: `${TAG}-owner-${Date.now()}@example.test`,
      name: "Verify Owner",
    },
    select: { id: true },
  });

  const renter = await prisma.user.create({
    data: {
      email: `${TAG}-renter-${Date.now()}@example.test`,
      name: "Verify Renter",
    },
    select: { id: true },
  });

  const listing = await prisma.listing.create({
    data: {
      ownerId: owner.id,
      categoryId: subcategory.categoryId,
      subcategoryId: subcategory.id,
      title: "Verify Camera",
      description: "Throwaway listing for Phase 4 verification.",
      condition: "GOOD",
      pricePerDay: 1500,
      securityDeposit: 10800,
      city: "karachi",
      area: "Verify",
      status: "ACTIVE",
    },
    select: { id: true, title: true },
  });

  console.log(`  owner=${owner.id} renter=${renter.id} listing=${listing.id}`);

  const days = ["2027-03-01", "2027-03-02", "2027-03-03"].map(
    (d) => new Date(`${d}T00:00:00.000Z`)
  );

  const parties = { renterId: renter.id, ownerId: owner.id };

  // ---------------------------------------------------------------- request
  console.log("\n=== request holds its dates and notifies the owner ===");

  const booking = await prisma.$transaction(async (tx) => {
    const created = await tx.booking.create({
      data: {
        listingId: listing.id,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: days[0]!,
        endDate: days[2]!,
        totalPrice: 4500,
        securityDeposit: 10800,
        status: BookingStatus.PENDING,
      },
      select: { id: true },
    });

    await tx.unavailableDate.createMany({
      data: days.map((date) => ({
        listingId: listing.id,
        date,
        reason: "booked",
        bookingId: created.id,
      })),
    });

    await emitBookingNotifications(tx, {
      event: "requested",
      bookingId: created.id,
      listingTitle: listing.title,
      parties,
      startDate: days[0]!,
      endDate: days[2]!,
    });

    return created;
  });

  const heldAfterRequest = await prisma.unavailableDate.count({
    where: { bookingId: booking.id },
  });
  check("3 dates held", heldAfterRequest === 3, heldAfterRequest);

  const ownerNotified = await prisma.notification.count({
    where: { userId: owner.id, type: "BOOKING_REQUESTED" },
  });
  check("owner notified once", ownerNotified === 1, ownerNotified);

  const renterNotifiedOnRequest = await prisma.notification.count({
    where: { userId: renter.id },
  });
  check(
    "renter not notified of their own request",
    renterNotifiedOnRequest === 0
  );

  // ------------------------------------------------- concurrency: the CAS guard
  console.log("\n=== compare-and-swap: only one concurrent approval wins ===");

  const [a, b] = await Promise.all([
    prisma.$transaction((tx) =>
      transitionBooking(tx, {
        bookingId: booking.id,
        from: BookingStatus.PENDING,
        to: BookingStatus.APPROVED,
      })
    ),
    prisma.$transaction((tx) =>
      transitionBooking(tx, {
        bookingId: booking.id,
        from: BookingStatus.PENDING,
        to: BookingStatus.DECLINED,
      })
    ),
  ]);

  check("exactly one transition applied", [a, b].filter(Boolean).length === 1, {
    a,
    b,
  });

  // Put it back on the approved path regardless of which won.
  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: BookingStatus.APPROVED },
  });

  // ------------------------------------------------------------ payment slice
  console.log(
    "\n=== payment: row created, booking moves, deposit kept separate ==="
  );

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: {
        provider: PaymentProvider.OFFLINE,
        method: "CASH",
        status: PaymentStatus.AWAITING_CONFIRMATION,
        amount: 4500,
        securityDeposit: 10800,
      },
      select: { id: true },
    });

    await transitionBooking(tx, {
      bookingId: booking.id,
      from: BookingStatus.APPROVED,
      to: BookingStatus.PAYMENT_PENDING,
      relations: { payment: { connect: { id: created.id } } },
    });

    return created;
  });

  const withPayment = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    select: {
      status: true,
      paymentId: true,
      payment: { select: { amount: true, securityDeposit: true } },
    },
  });

  check(
    "booking is PAYMENT_PENDING",
    withPayment.status === BookingStatus.PAYMENT_PENDING
  );
  check("payment linked", withPayment.paymentId === payment.id);
  check(
    "rental and deposit stored separately",
    withPayment.payment?.amount === 4500 &&
      withPayment.payment?.securityDeposit === 10800,
    withPayment.payment
  );

  // Confirm receipt.
  const confirmed = await prisma.payment.updateMany({
    where: { id: payment.id, status: PaymentStatus.AWAITING_CONFIRMATION },
    data: {
      status: PaymentStatus.COMPLETED,
      confirmedAt: new Date(),
      confirmedById: owner.id,
    },
  });
  check("payment confirmed once", confirmed.count === 1);

  const reconfirm = await prisma.payment.updateMany({
    where: { id: payment.id, status: PaymentStatus.AWAITING_CONFIRMATION },
    data: { status: PaymentStatus.COMPLETED, confirmedAt: new Date() },
  });
  check(
    "re-confirming is a no-op (timestamp cannot move)",
    reconfirm.count === 0
  );

  // -------------------------------------------------------------- pickup
  console.log("\n=== pickup: ACTIVE, startedAt stamped, dates still held ===");

  await prisma.$transaction(async (tx) => {
    await transitionBooking(tx, {
      bookingId: booking.id,
      from: BookingStatus.PAYMENT_PENDING,
      to: BookingStatus.ACTIVE,
      data: { startedAt: new Date() },
    });

    await emitBookingNotifications(tx, {
      event: "picked-up",
      bookingId: booking.id,
      listingTitle: listing.title,
      parties,
    });
  });

  const active = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    select: { status: true, startedAt: true },
  });

  check("status ACTIVE", active.status === BookingStatus.ACTIVE);
  check("startedAt stamped", active.startedAt !== null);

  const heldWhileActive = await prisma.unavailableDate.count({
    where: { bookingId: booking.id },
  });
  check(
    "dates still held while the item is out",
    heldWhileActive === 3,
    heldWhileActive
  );

  // -------------------------------------------------------------- completion
  console.log(
    "\n=== return: COMPLETED, dates released, both sides prompted ==="
  );

  await prisma.$transaction(async (tx) => {
    await transitionBooking(tx, {
      bookingId: booking.id,
      from: BookingStatus.ACTIVE,
      to: BookingStatus.COMPLETED,
      data: { completedAt: new Date() },
    });

    await releaseHeldDates(tx, booking.id);

    await emitBookingNotifications(tx, {
      event: "returned",
      bookingId: booking.id,
      listingTitle: listing.title,
      parties,
    });

    await emitBookingNotifications(tx, {
      event: "review-reminder",
      bookingId: booking.id,
      listingTitle: listing.title,
      parties,
    });
  });

  const completed = await prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    select: { status: true, completedAt: true },
  });

  check("status COMPLETED", completed.status === BookingStatus.COMPLETED);
  check("completedAt stamped", completed.completedAt !== null);

  const heldAfterComplete = await prisma.unavailableDate.count({
    where: { bookingId: booking.id },
  });
  check(
    "held dates released on completion",
    heldAfterComplete === 0,
    heldAfterComplete
  );

  const stillBookable = await prisma.unavailableDate.count({
    where: { listingId: listing.id, date: { in: days } },
  });
  check("those days are bookable again", stillBookable === 0, stillBookable);

  const reviewPrompts = await prisma.notification.count({
    where: { entityId: booking.id, type: "REVIEW_REMINDER" },
  });
  check("both parties prompted to review", reviewPrompts === 2, reviewPrompts);

  // ------------------------------------------------------------ deposit clock
  console.log("\n=== deposit window reads from completedAt ===");

  const due = depositState({
    securityDeposit: 10800,
    completedAt: completed.completedAt,
    depositReturnedAt: null,
    now: new Date(),
  });
  check("deposit is due right after completion", due.kind === "due", due);

  const overdue = depositState({
    securityDeposit: 10800,
    completedAt: completed.completedAt,
    depositReturnedAt: null,
    now: new Date(completed.completedAt!.getTime() + 50 * 3_600_000),
  });
  check("deposit is overdue 50h later", overdue.kind === "overdue", overdue);

  const returnedAt = new Date();
  const depositWrite = await prisma.payment.updateMany({
    where: { id: payment.id, depositReturnedAt: null },
    data: { depositReturnedAt: returnedAt },
  });
  check("deposit return recorded once", depositWrite.count === 1);

  const secondWrite = await prisma.payment.updateMany({
    where: { id: payment.id, depositReturnedAt: null },
    data: { depositReturnedAt: new Date() },
  });
  check("re-recording is a no-op", secondWrite.count === 0);

  // ------------------------------------------------- cancellation releases dates
  console.log("\n=== cancellation releases dates and records who did it ===");

  const second = await prisma.$transaction(async (tx) => {
    const created = await tx.booking.create({
      data: {
        listingId: listing.id,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: days[0]!,
        endDate: days[0]!,
        totalPrice: 1500,
        securityDeposit: 10800,
        status: BookingStatus.PENDING,
      },
      select: { id: true },
    });

    await tx.unavailableDate.createMany({
      data: [
        {
          listingId: listing.id,
          date: days[0]!,
          reason: "booked",
          bookingId: created.id,
        },
      ],
    });

    return created;
  });

  await prisma.$transaction(async (tx) => {
    await transitionBooking(tx, {
      bookingId: second.id,
      from: BookingStatus.PENDING,
      to: BookingStatus.CANCELLED,
      data: { cancelledAt: new Date(), statusReason: "Changed my mind" },
      relations: { cancelledBy: { connect: { id: renter.id } } },
    });

    await releaseHeldDates(tx, second.id);

    await emitBookingNotifications(tx, {
      event: "cancelled",
      by: "renter",
      bookingId: second.id,
      listingTitle: listing.title,
      parties,
      reason: "Changed my mind",
    });
  });

  const cancelled = await prisma.booking.findUniqueOrThrow({
    where: { id: second.id },
    select: { status: true, cancelledAt: true, cancelledById: true },
  });

  check("status CANCELLED", cancelled.status === BookingStatus.CANCELLED);
  check("cancelledAt stamped", cancelled.cancelledAt !== null);
  check(
    "cancelledById records the renter",
    cancelled.cancelledById === renter.id
  );

  const heldAfterCancel = await prisma.unavailableDate.count({
    where: { bookingId: second.id },
  });
  check(
    "dates released on cancellation",
    heldAfterCancel === 0,
    heldAfterCancel
  );

  const cancelNotice = await prisma.notification.findFirst({
    where: { entityId: second.id, type: "BOOKING_CANCELLED" },
    select: { userId: true, entityType: true },
  });
  check(
    "only the owner is told",
    cancelNotice?.userId === owner.id,
    cancelNotice
  );
  check(
    "and it points at the requests screen",
    cancelNotice?.entityType === "booking-request"
  );

  // --------------------------------------- owner block survives a booking release
  console.log("\n=== an owner's own manual block survives a release ===");

  const manualDay = new Date("2027-04-01T00:00:00.000Z");

  const third = await prisma.$transaction(async (tx) => {
    const created = await tx.booking.create({
      data: {
        listingId: listing.id,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: manualDay,
        endDate: manualDay,
        totalPrice: 1500,
        securityDeposit: 0,
        status: BookingStatus.PENDING,
      },
      select: { id: true },
    });

    await tx.unavailableDate.createMany({
      data: [
        {
          listingId: listing.id,
          date: manualDay,
          reason: "booked",
          bookingId: created.id,
        },
        // The owner's own block on a different day, with no bookingId.
        {
          listingId: listing.id,
          date: new Date("2027-04-02T00:00:00.000Z"),
          reason: "maintenance",
        },
      ],
    });

    return created;
  });

  await prisma.$transaction((tx) => releaseHeldDates(tx, third.id));

  const manualBlockSurvived = await prisma.unavailableDate.count({
    where: { listingId: listing.id, bookingId: null },
  });
  check(
    "manual block untouched",
    manualBlockSurvived === 1,
    manualBlockSurvived
  );

  // ---------------------------------------------------------------- cleanup
  console.log("\n=== cleanup ===");

  await prisma.notification.deleteMany({
    where: { userId: { in: [owner.id, renter.id] } },
  });
  await prisma.unavailableDate.deleteMany({ where: { listingId: listing.id } });
  await prisma.booking.deleteMany({ where: { listingId: listing.id } });
  await prisma.payment.deleteMany({ where: { id: payment.id } });
  await prisma.listing.deleteMany({ where: { id: listing.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [owner.id, renter.id] } },
  });

  console.log("  removed test rows");

  console.log(
    failures === 0 ? "\nALL CHECKS PASSED\n" : `\n${failures} CHECK(S) FAILED\n`
  );

  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
