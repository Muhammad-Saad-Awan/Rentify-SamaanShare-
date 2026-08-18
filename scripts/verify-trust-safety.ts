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
import {
  checkVerificationToken,
  createVerificationToken,
  verificationTokenExpiry,
} from "../src/lib/auth/email-verification";
import { getReports } from "../src/lib/queries/reports";
import { getOwnerReviews } from "../src/lib/queries/reviews";
import { getRenterAccessSignals } from "../src/lib/queries/renter-access";
import { getPublicProfile } from "../src/lib/queries/user-profile";
import {
  accessTierFor,
  checkRenterAccess,
  ELEVATED_DEPOSIT_PKR,
  ESTABLISHED_RENTAL_COUNT,
  HIGH_VALUE_DEPOSIT_PKR,
} from "../src/lib/trust/access";
import { assessTrust } from "../src/lib/trust/score";
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

  // ------------------- 6. identity verification is attributable, and reachable
  console.log("\n=== identity verification ===");

  /**
   * The badge was unreachable before this: `isVerified` has existed since the initial migration and
   * nothing ever wrote it, so `OwnerCard` rendered a "Verified" state no account could reach and the
   * trust score's top band was gated on a flag that could never be true.
   */
  await prisma.user.update({
    where: { id: renter.id },
    data: {
      isVerified: true,
      verifiedAt: new Date(),
      verifiedById: reporter.id,
    },
  });

  const granted = await prisma.user.findUniqueOrThrow({
    where: { id: renter.id },
    select: {
      isVerified: true,
      verifiedAt: true,
      verifiedBy: { select: { name: true } },
    },
  });

  check(
    "a grant records who decided it and when",
    granted.isVerified &&
      granted.verifiedAt !== null &&
      granted.verifiedBy?.name === "TS Reporter",
    granted
  );

  /**
   * The whole point of the gate. Same record, scored twice - the only difference is the flag.
   *
   * Everything else feeding the score is behaviour reported by other users, which a determined
   * person can manufacture; the strongest claim the platform makes should rest on something outside
   * the reputation system.
   */
  const strongRecord = {
    ownerRating: { average: 5, count: 40 },
    renterRating: { average: 5, count: 40 },
    completedRentals: 40,
    cancelledByThem: 0,
    emailVerified: true,
  };

  const unverified = assessTrust({ ...strongRecord, isVerified: false });
  const verified = assessTrust({ ...strongRecord, isVerified: true });

  check(
    "an identical record stops at 'trusted' while unverified",
    unverified.band === "trusted",
    unverified.band
  );
  check(
    "and reaches 'highly trusted' once verified",
    verified.band === "highly-trusted",
    verified.band
  );

  /** Withdrawing clears the timestamp too - a stale one would read as a current grant. */
  await prisma.user.update({
    where: { id: renter.id },
    data: { isVerified: false, verifiedAt: null, verifiedById: null },
  });

  const withdrawn = await prisma.user.findUniqueOrThrow({
    where: { id: renter.id },
    select: { isVerified: true, verifiedAt: true, verifiedById: true },
  });

  check(
    "withdrawing clears the flag and its audit trail together",
    !withdrawn.isVerified &&
      withdrawn.verifiedAt === null &&
      withdrawn.verifiedById === null,
    withdrawn
  );

  // ------------------- 7. an email confirmation link is single-use and bound
  console.log("\n=== email confirmation tokens ===");

  const { token, tokenHash } = createVerificationToken();

  await prisma.emailVerificationToken.create({
    data: {
      userId: renter.id,
      tokenHash,
      email: `ts-renter-${stamp}@example.test`,
      expiresAt: verificationTokenExpiry(),
    },
  });

  check(
    "the token is never stored in a form that could be replayed",
    (await prisma.emailVerificationToken.count({
      where: { tokenHash: token },
    })) === 0
  );

  /** The same compare-and-swap `verifyEmail` performs, run twice against one row. */
  const spend = () =>
    prisma.emailVerificationToken.updateMany({
      where: { tokenHash, usedAt: null },
      data: { usedAt: new Date() },
    });

  const [firstSpend, secondSpend] = await Promise.all([spend(), spend()]);

  check(
    "exactly one redemption takes effect",
    firstSpend.count + secondSpend.count === 1,
    { first: firstSpend.count, second: secondSpend.count }
  );

  const storedToken = await prisma.emailVerificationToken.findUniqueOrThrow({
    where: { tokenHash },
    select: { email: true, expiresAt: true, usedAt: true },
  });

  check(
    "a spent token is refused",
    checkVerificationToken(storedToken, storedToken.email) === "used"
  );

  /**
   * The check a reset token does not need. Without it, changing an email to an address you do not
   * control and clicking an older link would mark the new address confirmed.
   */
  check(
    "a token minted for another address is refused as stale",
    checkVerificationToken(
      { ...storedToken, usedAt: null },
      "someone-else@example.test"
    ) === "stale"
  );

  // ----------------------------- 8. value-gated access, against real signals
  console.log("\n=== value-gated access ===");

  /**
   * A fresh account, so the signals are known exactly. The `renter` above already has a pile of
   * completed bookings from the earlier sections and would clear every gate.
   */
  const newcomer = await prisma.user.create({
    data: { email: `ts-newcomer-${stamp}@example.test`, name: "TS Newcomer" },
    select: { id: true },
  });

  const asRead = () => getRenterAccessSignals(newcomer.id);

  check(
    "a brand-new account reads as unconfirmed with no history",
    JSON.stringify(await asRead()) ===
      JSON.stringify({
        emailVerified: false,
        isVerified: false,
        completedRentals: 0,
      }),
    await asRead()
  );

  check(
    "an everyday item is open to them",
    checkRenterAccess(accessTierFor(2_000), await asRead()).allowed
  );

  check(
    "a high-deposit item is not",
    !checkRenterAccess(accessTierFor(HIGH_VALUE_DEPOSIT_PKR), await asRead())
      .allowed
  );

  /**
   * `emailVerified` is a DateTime, not a boolean, and the query has to translate it. Getting that
   * wrong in either direction is silent: everyone gated out, or the gate open to everyone.
   */
  await prisma.user.update({
    where: { id: newcomer.id },
    data: { emailVerified: new Date() },
  });

  check(
    "confirming the address opens the elevated tier",
    checkRenterAccess(accessTierFor(ELEVATED_DEPOSIT_PKR), await asRead())
      .allowed
  );

  check(
    "but not the high-value tier on its own",
    !checkRenterAccess(accessTierFor(HIGH_VALUE_DEPOSIT_PKR), await asRead())
      .allowed
  );

  /**
   * The route that does not depend on an administrator. Identity verification is granted out of
   * band, so if it were the only way through, every high-value listing would be unbookable by
   * everyone at launch.
   *
   * REVIEWED counts as well as COMPLETED - it is the same finished rental with both reviews written.
   * Counting only COMPLETED would lock the most engaged members out of the tier they had earned.
   */
  const earned = await Promise.all(
    Array.from({ length: ESTABLISHED_RENTAL_COUNT }, (_, index) =>
      prisma.booking.create({
        data: {
          listingId: listing.id,
          renterId: newcomer.id,
          ownerId: owner.id,
          startDate: new Date(`2028-01-${String(index + 1).padStart(2, "0")}`),
          endDate: new Date(`2028-01-${String(index + 1).padStart(2, "0")}`),
          totalPrice: 800,
          securityDeposit: 0,
          // One of them REVIEWED, so the status filter is exercised in both states.
          status:
            index === 0 ? BookingStatus.REVIEWED : BookingStatus.COMPLETED,
          completedAt: new Date(),
        },
        select: { id: true },
      })
    )
  );

  const withHistory = await asRead();

  check(
    "completed and reviewed rentals both count towards the history",
    withHistory.completedRentals === ESTABLISHED_RENTAL_COUNT,
    withHistory
  );

  check(
    "a real track record opens the high-value tier without any admin action",
    checkRenterAccess(accessTierFor(HIGH_VALUE_DEPOSIT_PKR), withHistory)
      .allowed
  );

  await prisma.booking.deleteMany({
    where: { id: { in: earned.map((booking) => booking.id) } },
  });

  /** The other route: verification instead of history. */
  await prisma.user.update({
    where: { id: newcomer.id },
    data: { isVerified: true, verifiedAt: new Date(), verifiedById: owner.id },
  });

  const verifiedNewcomer = await asRead();

  check(
    "history was removed again, so this tests verification alone",
    verifiedNewcomer.completedRentals === 0,
    verifiedNewcomer
  );

  check(
    "a verified identity opens the high-value tier with no history at all",
    checkRenterAccess(accessTierFor(HIGH_VALUE_DEPOSIT_PKR), verifiedNewcomer)
      .allowed
  );

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
    where: { id: { in: [owner.id, renter.id, reporter.id, newcomer.id] } },
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
