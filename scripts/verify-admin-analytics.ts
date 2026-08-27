// Platform analytics, verified against a real database.
//
// The load-bearing property is that the money figures mean what the screen says they mean. "GMV" on a
// dashboard is read as revenue, and here it is neither revenue nor money the platform has seen -
// payment is offline. So the checks pin the three ways the number could quietly become a lie: a
// request counted as a sale, a deposit counted as rent, and a failed booking counted at all.
//
// The second is that `live` listings goes through VISIBLE_LISTING_WHERE, so suspending an owner moves
// their supply out of the count the way it moves it out of the marketplace. A count computed with a
// looser predicate than the page it describes is the failure AGENTS.md records.
//
// ASSERTS DELTAS, NOT TOTALS. This runs against a database with real rows in it, so every check
// snapshots the aggregate first, creates its fixtures, and reads again - an absolute total would only
// pass on an empty database.
//
// Creates its own throwaway rows and deletes them.

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  BookingStatus,
  ListingStatus,
  UserStatus,
} from "../src/generated/prisma/enums";
import { PENDING_EXPIRY_HOURS } from "../src/lib/bookings/lifecycle";
import {
  ACTIVITY_PER_SOURCE,
  getCityDistribution,
  getPlatformTotals,
  getRecentActivity,
} from "../src/lib/queries/admin-analytics";

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

/** A city slug that is deliberately NOT in `PAKISTANI_CITIES`, to test the expansion case. */
const FRONTIER_CITY = "verify-frontier";

const RENT = 5_000;
const DEPOSIT = 20_000;

async function main() {
  const stamp = Date.now();
  const sub = await prisma.subcategory.findFirstOrThrow({
    select: { id: true, categoryId: true },
  });

  const before = await getPlatformTotals();

  const owner = await prisma.user.create({
    data: { email: `an-owner-${stamp}@example.test`, name: "AN Owner" },
    select: { id: true },
  });
  const renter = await prisma.user.create({
    data: { email: `an-renter-${stamp}@example.test`, name: "AN Renter" },
    select: { id: true },
  });

  const newListing = (city: string, status: ListingStatus) =>
    prisma.listing.create({
      data: {
        ownerId: owner.id,
        categoryId: sub.categoryId,
        subcategoryId: sub.id,
        title: `AN Verify ${city} ${stamp}`,
        description: "Throwaway listing for analytics verification.",
        condition: "GOOD",
        pricePerDay: 1000,
        securityDeposit: DEPOSIT,
        city,
        status,
      },
      select: { id: true },
    });

  const live = await newListing(FRONTIER_CITY, ListingStatus.ACTIVE);
  const paused = await newListing(FRONTIER_CITY, ListingStatus.PAUSED);
  const removed = await newListing(FRONTIER_CITY, ListingStatus.DELETED);

  await prisma.listing.update({
    where: { id: removed.id },
    data: { deletedAt: new Date() },
  });

  const listingIds = [live.id, paused.id, removed.id];
  const bookingIds: string[] = [];

  const newBooking = async (status: BookingStatus, createdAt?: Date) => {
    const booking = await prisma.booking.create({
      data: {
        listingId: live.id,
        renterId: renter.id,
        ownerId: owner.id,
        totalPrice: RENT,
        securityDeposit: DEPOSIT,
        status,
        startDate: day("2027-11-01"),
        endDate: day("2027-11-05"),
        ...(createdAt ? { createdAt } : {}),
      },
      select: { id: true },
    });

    bookingIds.push(booking.id);

    return booking;
  };

  // ----------------------------------------------------------- 1. the listing counts
  console.log(
    "\n=== listings are counted the way the marketplace sees them ==="
  );

  const withListings = await getPlatformTotals();

  check(
    "three new listings appear in the total",
    withListings.listings.total - before.listings.total === 3,
    { before: before.listings.total, after: withListings.listings.total }
  );

  check(
    "only the ACTIVE one is live",
    withListings.listings.live - before.listings.live === 1,
    { before: before.listings.live, after: withListings.listings.live }
  );

  check(
    "the paused one is counted as paused",
    withListings.listings.paused - before.listings.paused === 1,
    withListings.listings.paused
  );

  check(
    "and the soft-deleted one as removed",
    withListings.listings.removed - before.listings.removed === 1,
    withListings.listings.removed
  );

  // ---------------------------------------------------- 2. GMV counts rent, once
  console.log("\n=== the money figures count rent, and only real rent ===");

  await newBooking(BookingStatus.PENDING);
  await newBooking(BookingStatus.APPROVED);
  await newBooking(BookingStatus.CANCELLED);
  const completed = await newBooking(BookingStatus.COMPLETED);

  const withBookings = await getPlatformTotals();

  /**
   * A PENDING request is a hope and a CANCELLED one never happened. Counting either as GMV is how a
   * marketplace dashboard ends up reporting demand as revenue.
   */
  check(
    "realised rent moves by exactly the completed booking's rent",
    withBookings.money.realisedGmv - before.money.realisedGmv === RENT,
    {
      before: before.money.realisedGmv,
      after: withBookings.money.realisedGmv,
      expectedDelta: RENT,
    }
  );

  check(
    "the approved booking lands in pipeline instead",
    withBookings.money.pipelineGmv - before.money.pipelineGmv === RENT,
    {
      before: before.money.pipelineGmv,
      after: withBookings.money.pipelineGmv,
    }
  );

  /**
   * The deposit is four times the rent here, deliberately. If deposits leaked into GMV the delta
   * would be 25,000 rather than 5,000, and the error would look like success.
   */
  check(
    "the deposit is excluded from rent and reported separately",
    withBookings.money.depositsAtStake - before.money.depositsAtStake ===
      DEPOSIT,
    {
      before: before.money.depositsAtStake,
      after: withBookings.money.depositsAtStake,
      expectedDelta: DEPOSIT,
    }
  );

  check(
    "the cancelled request is counted as failed, not hidden",
    withBookings.bookings.failed - before.bookings.failed === 1,
    withBookings.bookings.failed
  );

  check(
    "and the pending one is counted as pending",
    withBookings.bookings.pending - before.bookings.pending === 1,
    withBookings.bookings.pending
  );

  // ------------------------------------------- 3. a suspended owner leaves the market
  console.log("\n=== suspending an owner removes their supply from `live` ===");

  await prisma.user.update({
    where: { id: owner.id },
    data: { status: UserStatus.SUSPENDED },
  });

  const suspended = await getPlatformTotals();

  /**
   * `VISIBLE_LISTING_WHERE` requires the owner to be active - users are soft-deleted and
   * `Listing.owner` is `onDelete: Restrict`, so a suspended account keeps its listings. The gap
   * between `active` and `live` is exactly that supply, and the screen names it.
   */
  check(
    "the ACTIVE listing is no longer live",
    suspended.listings.live === before.listings.live,
    { before: before.listings.live, after: suspended.listings.live }
  );

  check(
    "but it is still ACTIVE, so the two numbers disagree on purpose",
    suspended.listings.active - before.listings.active === 1,
    { active: suspended.listings.active, live: suspended.listings.live }
  );

  check(
    "the suspension is counted in the members breakdown",
    suspended.users.suspended - before.users.suspended === 1,
    suspended.users.suspended
  );

  await prisma.user.update({
    where: { id: owner.id },
    data: { status: UserStatus.ACTIVE },
  });

  // ------------------------------------------------------- 4. the city distribution
  console.log("\n=== a city appears from the data, not from the config ===");

  const cities = await getCityDistribution();
  const frontier = cities.find((row) => row.city === FRONTIER_CITY);

  /**
   * `verify-frontier` is not in `PAKISTANI_CITIES`. Reading the configured launch cities would drop
   * it - and a city existing in the database ahead of the config is exactly what a launch looks like
   * from the inside.
   */
  check(
    "an unconfigured city is present",
    frontier !== undefined,
    cities.map((row) => row.city)
  );

  check(
    "with only its live listing counted",
    frontier?.liveListings === 1,
    frontier
  );

  check(
    "and only the completed rental's rent",
    frontier?.realisedGmv === RENT && frontier.realisedBookings === 1,
    frontier
  );

  check(
    "the rows are ordered by live supply",
    cities.every(
      (row, index) =>
        index === 0 || cities[index - 1]!.liveListings >= row.liveListings
    ),
    cities.map((row) => [row.city, row.liveListings])
  );

  // ------------------------------------------------------- 5. the activity feed
  console.log(
    "\n=== the activity feed is newest first, and admits its cap ==="
  );

  const activity = await getRecentActivity();

  check(
    "it is ordered newest first",
    activity.events.every(
      (event, index) =>
        index === 0 ||
        activity.events[index - 1]!.at.getTime() >= event.at.getTime()
    ),
    activity.events.map((event) => [event.kind, event.at])
  );

  check(
    "the new listing shows up in it",
    activity.events.some(
      (event) => event.kind === "listing" && event.id === live.id
    ),
    activity.events.filter((event) => event.kind === "listing")
  );

  check(
    "so does the new booking",
    activity.events.some(
      (event) => event.kind === "booking" && event.id === completed.id
    ),
    activity.events.filter((event) => event.kind === "booking")
  );

  /**
   * Four bookings were just created, which is half the per-source window - so with the rest of the
   * database's bookings the source is full and the feed has to say so. A feed that looked complete
   * while quietly truncating would have somebody conclude nothing else happened.
   */
  const bookingCount = await prisma.booking.count();

  check(
    "and it reports truncation when a source fills its window",
    bookingCount < ACTIVITY_PER_SOURCE || activity.truncated,
    {
      bookingCount,
      perSource: ACTIVITY_PER_SOURCE,
      truncated: activity.truncated,
    }
  );

  // -------------------------------------------------------- 6. reading changes nothing
  console.log("\n=== reading the analytics changes nothing ===");

  const stale = await newBooking(
    BookingStatus.PENDING,
    new Date(Date.now() - (PENDING_EXPIRY_HOURS + 24) * HOUR_MS)
  );

  await getPlatformTotals();
  await getCityDistribution();
  await getRecentActivity();

  const staleAfter = await prisma.booking.findUniqueOrThrow({
    where: { id: stale.id },
    select: { status: true },
  });

  /**
   * The same rule as the booking queue. A screen whose numbers are used to judge the platform must
   * not change the platform by being opened - otherwise the figures describe a state the act of
   * reading them created.
   */
  check(
    "a request past its window is still PENDING after three analytics reads",
    staleAfter.status === BookingStatus.PENDING,
    staleAfter
  );

  // ---------------------------------------------------------------- cleanup
  console.log("\n=== cleanup ===");

  const userIds = [owner.id, renter.id];

  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  const after = await getPlatformTotals();

  /**
   * The totals come back to where they started, which is the cleanup verifying itself. A verification
   * script that leaves rows behind quietly poisons every later reading of the very numbers it checks.
   */
  check(
    "every figure is back where it started",
    after.listings.total === before.listings.total &&
      after.bookings.total === before.bookings.total &&
      after.money.realisedGmv === before.money.realisedGmv &&
      after.money.depositsAtStake === before.money.depositsAtStake,
    { before, after }
  );

  console.log("  removed test rows");
  console.log(
    failures === 0
      ? "\nALL ANALYTICS CHECKS PASSED\n"
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
