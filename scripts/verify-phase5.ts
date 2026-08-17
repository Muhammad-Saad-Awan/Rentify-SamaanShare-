// Phase 5 review lifecycle, verified against a real database.
//
// The unit tests cover the pure rules. This covers the property they cannot: that a WITHHELD review
// does not move the stored rating aggregate. That is the whole reason `publishedAt` is a column - if
// the average moved on submission, an owner watching it drop would learn the renter left a bad
// review before being able to read it, and could retaliate in their own. A test that only checked
// the final state would pass with that leak wide open.
//
// Creates its own throwaway rows and deletes them.

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { BookingStatus, ReviewType } from "../src/generated/prisma/enums";
import { getOwnerReviews } from "../src/lib/queries/reviews";
import { publishReviews } from "../src/lib/reviews/publish";
import { releaseDueReviews } from "../src/lib/reviews/release";
import { REVIEW_WINDOW_DAYS, releasesOnSubmit } from "../src/lib/reviews/rules";

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

const DAY_MS = 24 * 60 * 60 * 1000;

async function ratingOf(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      ownerRatingAverage: true,
      ownerRatingCount: true,
      renterRatingAverage: true,
      renterRatingCount: true,
    },
  });

  return u;
}

async function main() {
  const stamp = Date.now();
  const sub = await prisma.subcategory.findFirstOrThrow({
    select: { id: true, categoryId: true },
  });

  const owner = await prisma.user.create({
    data: { email: `p5-owner-${stamp}@example.test`, name: "P5 Owner" },
    select: { id: true },
  });
  const renter = await prisma.user.create({
    data: { email: `p5-renter-${stamp}@example.test`, name: "P5 Renter" },
    select: { id: true },
  });

  const listing = await prisma.listing.create({
    data: {
      ownerId: owner.id,
      categoryId: sub.categoryId,
      subcategoryId: sub.id,
      title: "P5 Verify Camera",
      description: "Throwaway listing for review verification.",
      condition: "GOOD",
      pricePerDay: 1000,
      securityDeposit: 0,
      city: "karachi",
      area: "P5",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  let day = 1;
  async function completedBooking(completedDaysAgo: number) {
    const date = new Date(
      `2027-09-${String(day++).padStart(2, "0")}T00:00:00.000Z`
    );

    return prisma.booking.create({
      data: {
        listingId: listing.id,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: date,
        endDate: date,
        totalPrice: 1000,
        securityDeposit: 0,
        status: BookingStatus.COMPLETED,
        startedAt: new Date(Date.now() - (completedDaysAgo + 1) * DAY_MS),
        completedAt: new Date(Date.now() - completedDaysAgo * DAY_MS),
      },
      select: { id: true },
    });
  }

  // ---------------------------------------------- 1. the first review is withheld
  console.log("\n=== first review is withheld and moves nothing ===");

  const b1 = await completedBooking(1);

  const renterReview = await prisma.review.create({
    data: {
      bookingId: b1.id,
      reviewerId: renter.id,
      revieweeId: owner.id,
      type: ReviewType.RENTER_TO_OWNER,
      rating: 2,
      comment: "Late and the battery was flat.",
      publishedAt: null,
    },
    select: { id: true, publishedAt: true },
  });

  check("written withheld", renterReview.publishedAt === null);

  const ownerRatingAfterFirst = await ratingOf(owner.id);

  /**
   * THE LOAD-BEARING ASSERTION OF THIS PHASE.
   *
   * A 2-star review exists against the owner. If the aggregate had moved, the owner could infer its
   * content from their own dashboard before it was readable - and answer it.
   */
  check(
    "owner's rating still null - the withheld review is invisible to the aggregate",
    ownerRatingAfterFirst.ownerRatingAverage === null &&
      ownerRatingAfterFirst.ownerRatingCount === 0,
    ownerRatingAfterFirst
  );

  check(
    "first submission does not trigger release",
    releasesOnSubmit(0) === false
  );

  // ------------------------------------------- 2. the second review releases both
  console.log("\n=== second review releases both, atomically ===");

  const ownerReview = await prisma.review.create({
    data: {
      bookingId: b1.id,
      reviewerId: owner.id,
      revieweeId: renter.id,
      type: ReviewType.OWNER_TO_RENTER,
      rating: 5,
      comment: "Careful renter, returned early.",
      publishedAt: null,
    },
    select: { id: true },
  });

  check("second submission triggers release", releasesOnSubmit(1) === true);

  const publishedCount = await prisma.$transaction((tx) =>
    publishReviews(tx, [ownerReview.id, renterReview.id])
  );

  check(
    "both reviews published in one call",
    publishedCount === 2,
    publishedCount
  );

  const bothPublished = await prisma.review.findMany({
    where: { bookingId: b1.id },
    select: { publishedAt: true },
  });

  check(
    "neither review is readable before the other",
    bothPublished.every((r) => r.publishedAt !== null)
  );

  const ownerRated = await ratingOf(owner.id);
  const renterRated = await ratingOf(renter.id);

  // Each lands in the direction that describes the role being rated, and in that one only: the
  // renter's 2-star review of the owner is an *owner* rating, the owner's 5-star review of the
  // renter is a *renter* rating, and neither shows up on the other half.
  check(
    "owner now rated 2 from 1 as an owner",
    ownerRated.ownerRatingAverage === 2 && ownerRated.ownerRatingCount === 1,
    ownerRated
  );
  check(
    "owner's renter-side rating untouched",
    ownerRated.renterRatingAverage === null &&
      ownerRated.renterRatingCount === 0,
    ownerRated
  );
  check(
    "renter now rated 5 from 1 as a renter",
    renterRated.renterRatingAverage === 5 &&
      renterRated.renterRatingCount === 1,
    renterRated
  );
  check(
    "renter's owner-side rating untouched",
    renterRated.ownerRatingAverage === null &&
      renterRated.ownerRatingCount === 0,
    renterRated
  );

  // ------------------------------------------------- 3. publishing is idempotent
  console.log("\n=== re-publishing is a no-op ===");

  const again = await prisma.$transaction((tx) =>
    publishReviews(tx, [ownerReview.id, renterReview.id])
  );

  check("already-published reviews are not re-stamped", again === 0, again);

  // ------------------------------- 4. concurrent publish: only one caller wins
  console.log("\n=== concurrent release of one review: exactly one wins ===");

  const b2 = await completedBooking(1);
  const solo = await prisma.review.create({
    data: {
      bookingId: b2.id,
      reviewerId: renter.id,
      revieweeId: owner.id,
      type: ReviewType.RENTER_TO_OWNER,
      rating: 4,
      publishedAt: null,
    },
    select: { id: true },
  });

  const [a, bWin] = await Promise.all([
    prisma.$transaction((tx) => publishReviews(tx, [solo.id])),
    prisma.$transaction((tx) => publishReviews(tx, [solo.id])),
  ]);

  check("exactly one publish took effect", a + bWin === 1, { a, b: bWin });

  const afterSolo = await ratingOf(owner.id);
  check(
    "aggregate recomputed from both published reviews (2 and 4 -> 3)",
    afterSolo.ownerRatingAverage === 3 && afterSolo.ownerRatingCount === 2,
    afterSolo
  );

  // ------------------------------- 5. the lazy sweep releases an unanswered review
  console.log("\n=== window close releases an unanswered review ===");

  const b3 = await completedBooking(REVIEW_WINDOW_DAYS + 2);
  const unanswered = await prisma.review.create({
    data: {
      bookingId: b3.id,
      reviewerId: renter.id,
      revieweeId: owner.id,
      type: ReviewType.RENTER_TO_OWNER,
      rating: 5,
      publishedAt: null,
    },
    select: { id: true },
  });

  const beforeSweep = await ratingOf(owner.id);
  check(
    "still 2 reviews before the sweep",
    beforeSweep.ownerRatingCount === 2,
    beforeSweep
  );

  const released = await releaseDueReviews(owner.id);
  check("sweep released the overdue review", released === 1, released);

  const sweptRow = await prisma.review.findUniqueOrThrow({
    where: { id: unanswered.id },
    select: { publishedAt: true },
  });
  check("it is now published", sweptRow.publishedAt !== null);

  const afterSweep = await ratingOf(owner.id);
  check(
    "aggregate includes it (2, 4, 5 -> 3.67)",
    afterSweep.ownerRatingAverage === 3.67 && afterSweep.ownerRatingCount === 3,
    afterSweep
  );

  // -------------------- 6. a review inside its window is NOT swept
  console.log("\n=== a review still inside its window is left alone ===");

  const b4 = await completedBooking(1);
  const fresh = await prisma.review.create({
    data: {
      bookingId: b4.id,
      reviewerId: renter.id,
      revieweeId: owner.id,
      type: ReviewType.RENTER_TO_OWNER,
      rating: 1,
      publishedAt: null,
    },
    select: { id: true },
  });

  const releasedFresh = await releaseDueReviews(owner.id);
  check("sweep released nothing", releasedFresh === 0, releasedFresh);

  const freshRow = await prisma.review.findUniqueOrThrow({
    where: { id: fresh.id },
    select: { publishedAt: true },
  });
  check("the fresh review is still withheld", freshRow.publishedAt === null);

  const unchanged = await ratingOf(owner.id);
  check(
    "a 1-star withheld review has not touched the average",
    unchanged.ownerRatingAverage === 3.67 && unchanged.ownerRatingCount === 3,
    unchanged
  );

  // -------------------- 7. the public query never returns a withheld review
  console.log("\n=== public reads expose published reviews only ===");

  const publicRows = await prisma.review.count({
    where: {
      revieweeId: owner.id,
      type: ReviewType.RENTER_TO_OWNER,
      publishedAt: { not: null },
    },
  });
  const allRows = await prisma.review.count({
    where: { revieweeId: owner.id, type: ReviewType.RENTER_TO_OWNER },
  });

  check(
    "one review exists that the public predicate excludes",
    allRows === publicRows + 1,
    { allRows, publicRows }
  );

  // ---------- 8. the two directions are separate aggregates and never mix
  console.log("\n=== a person rated in both directions keeps them apart ===");

  // The owner now borrows something themselves, and is reviewed as a renter. This is the exact
  // situation the single mixed aggregate got wrong: their listing page would have printed one number
  // over a list of reviews averaging another, with nothing to tell a reader which to believe.
  const renterOwnedListing = await prisma.listing.create({
    data: {
      ownerId: renter.id,
      categoryId: sub.categoryId,
      subcategoryId: sub.id,
      title: "P5 Verify Tripod",
      description: "Throwaway listing owned by the other party.",
      condition: "GOOD",
      pricePerDay: 500,
      securityDeposit: 0,
      city: "karachi",
      area: "P5",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  const reversed = await prisma.booking.create({
    data: {
      listingId: renterOwnedListing.id,
      // Roles swapped: the person who is an owner elsewhere is the renter here.
      renterId: owner.id,
      ownerId: renter.id,
      startDate: new Date("2027-10-01T00:00:00.000Z"),
      endDate: new Date("2027-10-01T00:00:00.000Z"),
      totalPrice: 500,
      securityDeposit: 0,
      status: BookingStatus.COMPLETED,
      startedAt: new Date(Date.now() - 2 * DAY_MS),
      completedAt: new Date(Date.now() - DAY_MS),
    },
    select: { id: true },
  });

  const asRenterReview = await prisma.review.create({
    data: {
      bookingId: reversed.id,
      reviewerId: renter.id,
      revieweeId: owner.id,
      type: ReviewType.OWNER_TO_RENTER,
      rating: 5,
      comment: "Model borrower.",
      publishedAt: null,
    },
    select: { id: true },
  });

  await prisma.$transaction((tx) => publishReviews(tx, [asRenterReview.id]));

  const bothDirections = await ratingOf(owner.id);

  check(
    "a 5-star renter-side review leaves the owner-side average at 3.67",
    bothDirections.ownerRatingAverage === 3.67 &&
      bothDirections.ownerRatingCount === 3,
    bothDirections
  );
  check(
    "and lands on the renter side as 5 from 1",
    bothDirections.renterRatingAverage === 5 &&
      bothDirections.renterRatingCount === 1,
    bothDirections
  );

  /**
   * THE REGRESSION THIS SPLIT EXISTS TO PREVENT.
   *
   * The listing page prints `average` above `items`. Before the split those came from different
   * sets - a mixed aggregate over a `RENTER_TO_OWNER`-only list - so this assertion would have read
   * 4.0 against a list averaging 3.67. Computing the expected value from the returned rows rather
   * than hardcoding it is the point: it checks the correspondence, not a number.
   */
  const summary = await getOwnerReviews(owner.id);
  const meanOfListed =
    Math.round(
      (summary.items.reduce((sum, item) => sum + item.rating, 0) /
        summary.items.length) *
        100
    ) / 100;

  check(
    "the published average describes exactly the reviews listed under it",
    summary.count === summary.items.length &&
      summary.total === summary.items.length &&
      summary.average === meanOfListed,
    {
      summary: { average: summary.average, count: summary.count },
      meanOfListed,
    }
  );

  // ---------------------------------------------------------------- cleanup
  console.log("\n=== cleanup ===");

  const listingIds = [listing.id, renterOwnedListing.id];

  await prisma.review.deleteMany({
    where: { booking: { listingId: { in: listingIds } } },
  });
  await prisma.unavailableDate.deleteMany({
    where: { listingId: { in: listingIds } },
  });
  await prisma.booking.deleteMany({ where: { listingId: { in: listingIds } } });
  await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.user.deleteMany({
    where: { id: { in: [owner.id, renter.id] } },
  });

  console.log("  removed test rows");
  console.log(
    failures === 0
      ? "\nALL PHASE 5 CHECKS PASSED\n"
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
