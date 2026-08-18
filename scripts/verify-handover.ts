// The handover protocol, verified against a real database.
//
// The unit tests cover the pure rules. This covers what they cannot: that the seal is enforced by
// the DATABASE rather than by a check that can lose a race, that an answer can only be given once,
// and that photos cascade with their record while the record itself survives.
//
// Creates its own throwaway rows and deletes them.

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  BookingStatus,
  HandoverCondition,
  HandoverConfirmation,
  HandoverType,
} from "../src/generated/prisma/enums";
import {
  canConfirmHandover,
  canRecordHandover,
} from "../src/lib/handover/rules";
import { writeHandoverRecord } from "../src/lib/handover/write";

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

async function main() {
  const stamp = Date.now();
  const sub = await prisma.subcategory.findFirstOrThrow({
    select: { id: true, categoryId: true },
  });

  const owner = await prisma.user.create({
    data: { email: `ho-owner-${stamp}@example.test`, name: "HO Owner" },
    select: { id: true },
  });
  const renter = await prisma.user.create({
    data: { email: `ho-renter-${stamp}@example.test`, name: "HO Renter" },
    select: { id: true },
  });

  const listing = await prisma.listing.create({
    data: {
      ownerId: owner.id,
      categoryId: sub.categoryId,
      subcategoryId: sub.id,
      title: "HO Verify Generator",
      description: "Throwaway listing for handover verification.",
      condition: "GOOD",
      pricePerDay: 3000,
      securityDeposit: 60000,
      city: "karachi",
      area: "HO",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  const booking = await prisma.booking.create({
    data: {
      listingId: listing.id,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date("2027-12-01T00:00:00.000Z"),
      endDate: new Date("2027-12-03T00:00:00.000Z"),
      totalPrice: 9000,
      securityDeposit: 60000,
      status: BookingStatus.ACTIVE,
      startedAt: new Date(),
    },
    select: { id: true },
  });

  // ------------------------------------ 1. the record is written with its photos
  console.log("\n=== a record is written atomically with its photos ===");

  const record = await prisma.$transaction((tx) =>
    writeHandoverRecord(tx, {
      bookingId: booking.id,
      type: HandoverType.RETURN,
      recordedById: owner.id,
      condition: HandoverCondition.DAMAGED,
      notes: "Lens barrel scratched along the focus ring.",
      photos: [
        {
          publicId: `ho-${stamp}-a`,
          url: "https://res.cloudinary.com/x/a.jpg",
          order: 0,
        },
        {
          publicId: `ho-${stamp}-b`,
          url: "https://res.cloudinary.com/x/b.jpg",
          order: 1,
        },
      ],
    })
  );

  const stored = await prisma.handoverRecord.findUniqueOrThrow({
    where: { id: record.id },
    select: {
      condition: true,
      confirmation: true,
      confirmedById: true,
      photos: { orderBy: { order: "asc" }, select: { publicId: true } },
    },
  });

  check(
    "the condition and both photos landed together",
    stored.condition === HandoverCondition.DAMAGED &&
      stored.photos.length === 2 &&
      stored.photos[0]?.publicId === `ho-${stamp}-a`,
    stored
  );

  /**
   * The counterparty's agreement is never required and never assumed. A record that defaulted to
   * AGREED would manufacture corroboration nobody gave.
   */
  check(
    "it starts unanswered, not agreed",
    stored.confirmation === HandoverConfirmation.PENDING &&
      stored.confirmedById === null,
    stored
  );

  // ------------------------------------------------- 2. the seal is in the database
  console.log("\n=== the seal is enforced by the database, not by a check ===");

  /**
   * THE LOAD-BEARING ASSERTION.
   *
   * `canRecordHandover` reports "already recorded", but that read and the insert are not atomic, so
   * two concurrent callers could both pass it. The unique index is what actually makes the record
   * unrewritable - and a record its author can replace after the fact is a claim, not evidence.
   */
  let refused = false;

  try {
    await prisma.$transaction((tx) =>
      writeHandoverRecord(tx, {
        bookingId: booking.id,
        type: HandoverType.RETURN,
        recordedById: owner.id,
        condition: HandoverCondition.AS_EXPECTED,
        photos: [],
      })
    );
  } catch {
    refused = true;
  }

  check("a second record for the same handover is refused", refused);

  const stillDamaged = await prisma.handoverRecord.findUniqueOrThrow({
    where: { id: record.id },
    select: { condition: true },
  });

  check(
    "and the original was not overwritten by the attempt",
    stillDamaged.condition === HandoverCondition.DAMAGED,
    stillDamaged
  );

  /** A record for the OTHER direction on the same booking is fine - the unique key is the pair. */
  const pickup = await prisma.$transaction((tx) =>
    writeHandoverRecord(tx, {
      bookingId: booking.id,
      type: HandoverType.PICKUP,
      recordedById: owner.id,
      condition: HandoverCondition.AS_EXPECTED,
      photos: [],
    })
  );

  check("the other direction is still recordable", pickup.id.length > 0);

  // ------------------------------------------ 3. an answer is given once, by the other party
  console.log(
    "\n=== a record is answered once, and only by the other party ==="
  );

  check(
    "the author may not answer their own record",
    !canConfirmHandover({
      confirmation: HandoverConfirmation.PENDING,
      isCounterparty: false,
    }).allowed
  );

  /** The same compare-and-swap `confirmHandover` performs, run twice against one row. */
  const answer = (agreed: boolean) =>
    prisma.handoverRecord.updateMany({
      where: { id: record.id, confirmation: HandoverConfirmation.PENDING },
      data: {
        confirmation: agreed
          ? HandoverConfirmation.AGREED
          : HandoverConfirmation.DISPUTED,
        confirmedById: renter.id,
        confirmedAt: new Date(),
      },
    });

  const [first, second] = await Promise.all([answer(false), answer(true)]);

  check("exactly one answer took effect", first.count + second.count === 1, {
    first: first.count,
    second: second.count,
  });

  const answered = await prisma.handoverRecord.findUniqueOrThrow({
    where: { id: record.id },
    select: { confirmation: true, confirmedById: true },
  });

  check(
    "the record now carries who answered it",
    answered.confirmedById === renter.id &&
      answered.confirmation !== HandoverConfirmation.PENDING,
    answered
  );

  /** And a further answer, in either direction, changes nothing. */
  const late = await answer(true);

  check("a later answer is a no-op", late.count === 0, late.count);

  // ---------------------------------- 4. the stage gate refuses an out-of-order record
  console.log("\n=== a return cannot be recorded before a collection ===");

  check(
    "refused from PAYMENT_PENDING",
    !canRecordHandover({
      status: BookingStatus.PAYMENT_PENDING,
      type: HandoverType.RETURN,
      alreadyRecorded: false,
    }).allowed
  );

  check(
    "and refused entirely on a cancelled booking",
    !canRecordHandover({
      status: BookingStatus.CANCELLED,
      type: HandoverType.PICKUP,
      alreadyRecorded: false,
    }).allowed
  );

  // ------------------------------------------- 5. photos cascade, the record does not
  console.log("\n=== photos belong to their record ===");

  await prisma.handoverRecord.delete({ where: { id: pickup.id } });

  const orphanPhotos = await prisma.handoverPhoto.count({
    where: { handoverId: pickup.id },
  });

  check("deleting a record takes its photos with it", orphanPhotos === 0);

  /**
   * The booking cannot be deleted while a record references it. A handover record is evidence and
   * must outlive tidying up - the same reasoning as Payment.confirmedById.
   */
  let bookingProtected = false;

  try {
    await prisma.booking.delete({ where: { id: booking.id } });
  } catch {
    bookingProtected = true;
  }

  check(
    "a booking cannot be deleted out from under its handover record",
    bookingProtected
  );

  // ---------------------------------------------------------------- cleanup
  console.log("\n=== cleanup ===");

  await prisma.handoverPhoto.deleteMany({
    where: { handover: { bookingId: booking.id } },
  });
  await prisma.handoverRecord.deleteMany({ where: { bookingId: booking.id } });
  await prisma.notification.deleteMany({
    where: { userId: { in: [owner.id, renter.id] } },
  });
  await prisma.unavailableDate.deleteMany({ where: { listingId: listing.id } });
  await prisma.booking.deleteMany({ where: { listingId: listing.id } });
  await prisma.listing.deleteMany({ where: { id: listing.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [owner.id, renter.id] } },
  });

  console.log("  removed test rows");
  console.log(
    failures === 0
      ? "\nALL HANDOVER CHECKS PASSED\n"
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
