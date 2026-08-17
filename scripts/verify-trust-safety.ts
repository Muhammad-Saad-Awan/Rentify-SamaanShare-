// Trust & Safety - reporting and moderation, verified against a real database.
//
// The unit tests cover the pure rules: which reason fits which target, which action fits which
// report, and that no outcome copy names the consequence. This covers what they cannot.
//
// The load-bearing property is that removing a review takes its RATING with it. A removal that
// hides the words and leaves the score behind is the worst of both: the number on a listing page
// would keep reflecting a review nobody is allowed to read, and nothing would ever detect it.
//
// Exercises the library layer and the database directly rather than the Server Actions, which
// require a session - same approach as verify-phase5.
//
// Creates its own throwaway rows and deletes them.

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  BookingStatus,
  ReportReason,
  ReportStatus,
  ReportType,
  ReviewType,
  UserStatus,
} from "../src/generated/prisma/enums";
import { getReports } from "../src/lib/queries/reports";
import { getOwnerReviews } from "../src/lib/queries/reviews";
import { getPublicProfile } from "../src/lib/queries/user-profile";
import {
  publishReviews,
  recomputeUserRating,
} from "../src/lib/reviews/publish";
import { releaseDueReviews } from "../src/lib/reviews/release";
import { REVIEW_WINDOW_DAYS } from "../src/lib/reviews/rules";

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
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { ownerRatingAverage: true, ownerRatingCount: true },
  });
}

async function main() {
  const stamp = Date.now();
  const sub = await prisma.subcategory.findFirstOrThrow({
    select: { id: true, categoryId: true },
  });

  const owner = await prisma.user.create({
    data: { email: `ts-owner-${stamp}@example.test`, name: "TS Owner" },
    select: { id: true },
  });
  const renter = await prisma.user.create({
    data: { email: `ts-renter-${stamp}@example.test`, name: "TS Renter" },
    select: { id: true },
  });
  const reporter = await prisma.user.create({
    data: { email: `ts-reporter-${stamp}@example.test`, name: "TS Reporter" },
    select: { id: true },
  });

  const listing = await prisma.listing.create({
    data: {
      ownerId: owner.id,
      categoryId: sub.categoryId,
      subcategoryId: sub.id,
      title: "TS Verify Drill",
      description: "Throwaway listing for moderation verification.",
      condition: "GOOD",
      pricePerDay: 800,
      securityDeposit: 0,
      city: "karachi",
      area: "TS",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  let day = 1;
  async function completedBooking(completedDaysAgo: number) {
    const date = new Date(
      `2027-11-${String(day++).padStart(2, "0")}T00:00:00.000Z`
    );

    return prisma.booking.create({
      data: {
        listingId: listing.id,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: date,
        endDate: date,
        totalPrice: 800,
        securityDeposit: 0,
        status: BookingStatus.COMPLETED,
        startedAt: new Date(Date.now() - (completedDaysAgo + 1) * DAY_MS),
        completedAt: new Date(Date.now() - completedDaysAgo * DAY_MS),
      },
      select: { id: true },
    });
  }

  /** A released review about the owner, so it counts towards their asOwner rating. */
  async function publishedReview(rating: number, comment: string) {
    const booking = await completedBooking(1);

    const review = await prisma.review.create({
      data: {
        bookingId: booking.id,
        reviewerId: renter.id,
        revieweeId: owner.id,
        type: ReviewType.RENTER_TO_OWNER,
        rating,
        comment,
        publishedAt: null,
      },
      select: { id: true },
    });

    await prisma.$transaction((tx) => publishReviews(tx, [review.id]));

    return review;
  }

  // ------------------------------- 1. removing a review takes its rating with it
  console.log("\n=== a removed review leaves the list AND the aggregate ===");

  const kept = await publishedReview(5, "Excellent, would rent again.");
  const abusive = await publishedReview(1, "Abusive text to be removed.");

  const before = await ratingOf(owner.id);
  check(
    "both reviews counted before removal (5 and 1 -> 3)",
    before.ownerRatingAverage === 3 && before.ownerRatingCount === 2,
    before
  );

  // What `applyReportAction` does for REMOVE_REVIEW: stamp the removal and recount, together.
  await prisma.$transaction(async (tx) => {
    await tx.review.update({
      where: { id: abusive.id },
      data: { removedAt: new Date() },
    });

    await recomputeUserRating(tx, owner.id);
  });

  const after = await ratingOf(owner.id);

  /**
   * THE LOAD-BEARING ASSERTION.
   *
   * Had the aggregate not been recomputed, the owner would still read 3 - a score dragged down by a
   * review no one can see, with no way to tell that from an honest one.
   */
  check(
    "the 1-star no longer counts (5 alone -> 5 from 1)",
    after.ownerRatingAverage === 5 && after.ownerRatingCount === 1,
    after
  );

  const summary = await getOwnerReviews(owner.id);

  check(
    "the removed review is gone from the public list",
    summary.items.every((item) => item.id !== abusive.id) &&
      summary.total === 1,
    { total: summary.total, ids: summary.items.map((i) => i.id) }
  );

  check(
    "and the average above the list still describes the list",
    summary.average === 5 && summary.count === 1,
    summary
  );

  check("the kept review is untouched", summary.items[0]?.id === kept.id);

  // ------------------- 2. a removed review is never resurrected by the sweep
  console.log("\n=== the release sweep will not publish a removed review ===");

  /**
   * Only a released review can be reported, so this row should not arise naturally. It is
   * constructed deliberately: if the sweep ignored `removedAt`, moderation would be undone by
   * waiting fourteen days, and nothing would report that it had happened.
   */
  const overdue = await completedBooking(REVIEW_WINDOW_DAYS + 3);
  const withheldAndRemoved = await prisma.review.create({
    data: {
      bookingId: overdue.id,
      reviewerId: renter.id,
      revieweeId: owner.id,
      type: ReviewType.RENTER_TO_OWNER,
      rating: 1,
      publishedAt: null,
      removedAt: new Date(),
    },
    select: { id: true },
  });

  const swept = await releaseDueReviews(owner.id);
  const stillWithheld = await prisma.review.findUniqueOrThrow({
    where: { id: withheldAndRemoved.id },
    select: { publishedAt: true },
  });

  check("the sweep released nothing", swept === 0, swept);
  check(
    "the removed review is still unpublished",
    stillWithheld.publishedAt === null
  );

  const unmoved = await ratingOf(owner.id);
  check(
    "and the rating did not move",
    unmoved.ownerRatingAverage === 5 && unmoved.ownerRatingCount === 1,
    unmoved
  );

  // ---------------------------- 3. a report is decided once, even under a race
  console.log("\n=== concurrent resolution: exactly one wins ===");

  const contested = await prisma.report.create({
    data: {
      reporterId: reporter.id,
      type: ReportType.LISTING,
      targetId: listing.id,
      reason: ReportReason.PROHIBITED_ITEM,
      description: "Contested report for the compare-and-swap check.",
    },
    select: { id: true },
  });

  /** The same compare-and-swap `closeReport` performs: guarded on `status: PENDING`. */
  const claim = () =>
    prisma.report.updateMany({
      where: { id: contested.id, status: ReportStatus.PENDING },
      data: {
        status: ReportStatus.RESOLVED,
        resolvedAt: new Date(),
      },
    });

  const [first, second] = await Promise.all([claim(), claim()]);

  check(
    "exactly one resolution took effect",
    first.count + second.count === 1,
    { first: first.count, second: second.count }
  );

  // ------------------------------------ 4. the queue shows what was reported
  console.log("\n=== the moderation queue hydrates every target kind ===");

  const reported = await Promise.all([
    prisma.report.create({
      data: {
        reporterId: reporter.id,
        type: ReportType.LISTING,
        targetId: listing.id,
        reason: ReportReason.UNSAFE_ITEM,
      },
      select: { id: true },
    }),
    prisma.report.create({
      data: {
        reporterId: reporter.id,
        type: ReportType.USER,
        targetId: owner.id,
        reason: ReportReason.NO_SHOW,
      },
      select: { id: true },
    }),
    prisma.report.create({
      data: {
        reporterId: reporter.id,
        type: ReportType.REVIEW,
        targetId: kept.id,
        reason: ReportReason.FAKE_REVIEW,
      },
      select: { id: true },
    }),
    // A second complaint about the same listing, from a different person, so the repeat counter
    // has something to count.
    prisma.report.create({
      data: {
        reporterId: renter.id,
        type: ReportType.LISTING,
        targetId: listing.id,
        reason: ReportReason.MISLEADING_DESCRIPTION,
      },
      select: { id: true },
    }),
    // A target that does not exist. A moderator must still be able to see and close this.
    prisma.report.create({
      data: {
        reporterId: reporter.id,
        type: ReportType.LISTING,
        targetId: `missing-${stamp}`,
        reason: ReportReason.SPAM,
      },
      select: { id: true },
    }),
  ]);

  const reportedIds = new Set(reported.map((r) => r.id));
  const queue = await getReports({
    status: ReportStatus.PENDING,
    pageSize: 50,
  });
  const mine = queue.items.filter((item) => reportedIds.has(item.id));

  check("all five appear in the pending queue", mine.length === 5, mine.length);

  const listingRow = mine.find(
    (item) => item.type === ReportType.LISTING && item.reason === "UNSAFE_ITEM"
  );
  const userRow = mine.find((item) => item.type === ReportType.USER);
  const reviewRow = mine.find((item) => item.type === ReportType.REVIEW);
  const missingRow = mine.find((item) => item.reason === "SPAM");

  check(
    "the listing target is hydrated with its title",
    listingRow?.target.kind === "listing" &&
      listingRow.target.title === "TS Verify Drill",
    listingRow?.target
  );

  check(
    "the user target is hydrated",
    userRow?.target.kind === "user" && userRow.target.name === "TS Owner",
    userRow?.target
  );

  check(
    "the review target is hydrated with its text",
    reviewRow?.target.kind === "review" && reviewRow.target.rating === 5,
    reviewRow?.target
  );

  /**
   * A deleted target must not break the row. Hiding these would leave reports that render nothing
   * and can never be closed, which is how a queue silently stops draining.
   */
  check(
    "a report whose target is gone renders as missing rather than failing",
    missingRow?.target.kind === "missing",
    missingRow?.target
  );

  /**
   * The pattern signal. Two people complaining about one listing is the thing a moderator is
   * looking for, and it is invisible without this count.
   */
  check(
    "the repeat counter sees the other report on the same listing",
    listingRow?.otherReportsOnTarget === 2,
    listingRow?.otherReportsOnTarget
  );

  check(
    "the reporter is named for the moderator",
    listingRow?.reporter.name === "TS Reporter",
    listingRow?.reporter
  );

  // ------------------------- 5. a profile is only public while the account is
  console.log("\n=== profile visibility follows account standing ===");

  /**
   * The same rule `VISIBLE_LISTING_WHERE` applies to listings. Users are never physically deleted
   * (D3), so without it a banned account would keep a public page complete with its rating and its
   * history - and moderation would visibly not have worked.
   *
   * The route turns each `null` into a real 404 from `users/[id]/layout.tsx`, which runs before the
   * first byte. That ordering is what stops it being a soft 404, and it is the reason the check
   * lives in a layout rather than in the page.
   */
  const visible = await getPublicProfile(owner.id);
  check("an active member has a public profile", visible !== null);
  check(
    "and it carries the split ratings the trust score needs",
    visible?.ownerRating.count === 1 && visible?.renterRating.count === 0,
    visible && {
      owner: visible.ownerRating,
      renter: visible.renterRating,
    }
  );

  await prisma.user.update({
    where: { id: owner.id },
    data: { status: UserStatus.SUSPENDED },
  });

  check(
    "a suspended member has no public profile",
    (await getPublicProfile(owner.id)) === null
  );

  await prisma.user.update({
    where: { id: owner.id },
    data: { status: UserStatus.ACTIVE, deletedAt: new Date() },
  });

  check(
    "a soft-deleted member has no public profile",
    (await getPublicProfile(owner.id)) === null
  );

  // Restored so the remaining cleanup reads normally.
  await prisma.user.update({
    where: { id: owner.id },
    data: { deletedAt: null },
  });

  // ---------------------------------------------------------------- cleanup
  console.log("\n=== cleanup ===");

  await prisma.report.deleteMany({
    where: { reporterId: { in: [reporter.id, renter.id] } },
  });
  await prisma.notification.deleteMany({
    where: { userId: { in: [owner.id, renter.id, reporter.id] } },
  });
  await prisma.review.deleteMany({
    where: { booking: { listingId: listing.id } },
  });
  await prisma.unavailableDate.deleteMany({ where: { listingId: listing.id } });
  await prisma.booking.deleteMany({ where: { listingId: listing.id } });
  await prisma.listing.deleteMany({ where: { id: listing.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [owner.id, renter.id, reporter.id] } },
  });

  console.log("  removed test rows");
  console.log(
    failures === 0
      ? "\nALL TRUST & SAFETY CHECKS PASSED\n"
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
