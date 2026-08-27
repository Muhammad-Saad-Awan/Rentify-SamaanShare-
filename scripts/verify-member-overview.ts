// The member dashboard's overview counts, verified against a real database.
//
// The load-bearing property is that "Live listings" means what the marketplace means by it. The count
// goes through VISIBLE_LISTING_WHERE, so a paused listing and a suspended owner both drop out - and
// the failure this prevents is a member being told they have three live listings while the browse page
// shows none of them. That is the AGENTS.md invariant applied to somebody's own dashboard, which is
// where being wrong about it is least forgivable.
//
// The second is that the wishlist count matches the wishlist page. `getSavedListings` filters through
// the same relation predicate, so an item whose owner was suspended has to leave both together or the
// tile promises a page that renders empty.
//
// ASSERTS EXACT COUNTS, not deltas: every figure is scoped to a member created by this script, so
// nothing in the surrounding database can contribute to it.
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
import { getMemberOverview } from "../src/lib/queries/member-overview";

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

  const member = await prisma.user.create({
    data: { email: `mo-member-${stamp}@example.test`, name: "MO Member" },
    select: { id: true },
  });
  const other = await prisma.user.create({
    data: { email: `mo-other-${stamp}@example.test`, name: "MO Other" },
    select: { id: true },
  });

  const newListing = (ownerId: string, status: ListingStatus, suffix: string) =>
    prisma.listing.create({
      data: {
        ownerId,
        categoryId: sub.categoryId,
        subcategoryId: sub.id,
        title: `MO Verify ${suffix} ${stamp}`,
        description: "Throwaway listing for overview verification.",
        condition: "GOOD",
        pricePerDay: 700,
        securityDeposit: 3000,
        city: "islamabad",
        status,
      },
      select: { id: true },
    });

  const mine = await newListing(member.id, ListingStatus.ACTIVE, "mine");
  const paused = await newListing(member.id, ListingStatus.PAUSED, "paused");
  const theirs = await newListing(other.id, ListingStatus.ACTIVE, "theirs");

  const listingIds = [mine.id, paused.id, theirs.id];
  const bookingIds: string[] = [];

  // ------------------------------------------------------------- 1. listings
  console.log("\n=== live means what the marketplace means by live ===");

  const base = await getMemberOverview(member.id);

  check(
    "only the member's ACTIVE listing is live",
    base.liveListings === 1,
    base
  );

  check(
    "the paused one is still counted as published",
    base.totalListings === 2,
    base
  );

  /**
   * Nobody else's inventory can leak in. The scoping by `ownerId` is the only thing between one
   * member's dashboard and another's, so it is worth asserting rather than assuming.
   */
  check(
    "another member's listing is not counted at all",
    base.liveListings === 1 && base.totalListings === 2,
    base
  );

  // ------------------------------------------------- 2. a suspension hides your own supply
  console.log("\n=== a suspended member is told zero, not three ===");

  await prisma.user.update({
    where: { id: member.id },
    data: { status: UserStatus.SUSPENDED },
  });

  const suspended = await getMemberOverview(member.id);

  /**
   * `VISIBLE_LISTING_WHERE` requires the OWNER to be active, so a suspended member's listings are
   * gone from the marketplace while the rows are untouched. Telling them "1 live listing" would be
   * the shared predicate's whole failure mode, on the one screen they check.
   */
  check(
    "the live count drops to zero while the listing still exists",
    suspended.liveListings === 0 && suspended.totalListings === 2,
    suspended
  );

  await prisma.user.update({
    where: { id: member.id },
    data: { status: UserStatus.ACTIVE },
  });

  // -------------------------------------------------------------- 3. bookings
  console.log("\n=== requests to answer are the ones on your listings ===");

  const newBooking = async (
    listingId: string,
    ownerId: string,
    renterId: string,
    status: BookingStatus,
    createdAt?: Date
  ) => {
    const booking = await prisma.booking.create({
      data: {
        listingId,
        ownerId,
        renterId,
        totalPrice: 2100,
        securityDeposit: 3000,
        status,
        startDate: day("2027-12-01"),
        endDate: day("2027-12-04"),
        ...(createdAt ? { createdAt } : {}),
      },
      select: { id: true },
    });

    bookingIds.push(booking.id);

    return booking;
  };

  // A request on the member's own listing: theirs to answer.
  await newBooking(mine.id, member.id, other.id, BookingStatus.PENDING);
  // A request the member made on somebody else's listing: NOT theirs to answer.
  await newBooking(theirs.id, other.id, member.id, BookingStatus.PENDING);
  // One live rental on each side.
  await newBooking(mine.id, member.id, other.id, BookingStatus.ACTIVE);
  await newBooking(
    theirs.id,
    other.id,
    member.id,
    BookingStatus.PAYMENT_PENDING
  );

  const withBookings = await getMemberOverview(member.id);

  /**
   * The distinction the tile depends on. A request the member *made* is not a request they answer -
   * counting both would put a permanent number on a card that has nothing behind it.
   */
  check(
    "only the request on their own listing counts as theirs to answer",
    withBookings.requestsToAnswer === 1,
    withBookings
  );

  check(
    "rentals in progress count both sides",
    withBookings.rentalsInProgress === 2,
    withBookings
  );

  // ----------------------------------------------- 4. the overview sweeps, on purpose
  console.log("\n=== the member's own screen expires their stale requests ===");

  const stale = await newBooking(
    mine.id,
    member.id,
    other.id,
    BookingStatus.PENDING,
    new Date(Date.now() - (PENDING_EXPIRY_HOURS + 24) * HOUR_MS)
  );

  const swept = await getMemberOverview(member.id);

  const staleAfter = await prisma.booking.findUniqueOrThrow({
    where: { id: stale.id },
    select: { status: true },
  });

  /**
   * THE OPPOSITE OF THE ADMIN SCREENS, deliberately. `searchAdminBookings` reports a stale request as
   * past its window and leaves it alone, because an administrator's lookup must not change a
   * booking's history. This is the owner's own dashboard: the tile links to the requests screen, which
   * sweeps on read, so without sweeping here the tile would count a request that the page it links to
   * would expire on arrival.
   */
  check(
    "reading the overview expires it",
    staleAfter.status === BookingStatus.EXPIRED,
    staleAfter
  );

  check(
    "so the count matches what the requests screen will show",
    swept.requestsToAnswer === 1,
    swept
  );

  // -------------------------------------------------------------- 5. wishlist
  console.log("\n=== the wishlist count matches the wishlist page ===");

  await prisma.savedListing.create({
    data: { userId: member.id, listingId: theirs.id },
    select: { id: true },
  });
  // A saved listing that is paused: invisible on the marketplace, so invisible in the count.
  await prisma.savedListing.create({
    data: { userId: member.id, listingId: paused.id },
    select: { id: true },
  });

  const withSaved = await getMemberOverview(member.id);

  check(
    "a paused item is not counted as available",
    withSaved.savedListings === 1,
    withSaved
  );

  await prisma.user.update({
    where: { id: other.id },
    data: { status: UserStatus.SUSPENDED },
  });

  const afterSuspension = await getMemberOverview(member.id);

  /**
   * The same relation predicate `getSavedListings` uses, so the item leaves the count and the page
   * together. Counted more loosely, the tile would promise a wishlist that renders empty.
   */
  check(
    "and an item whose owner was suspended leaves the count too",
    afterSuspension.savedListings === 0,
    afterSuspension
  );

  // ---------------------------------------------------------------- cleanup
  console.log("\n=== cleanup ===");

  const userIds = [member.id, other.id];

  await prisma.savedListing.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.unavailableDate.deleteMany({
    where: { listingId: { in: listingIds } },
  });
  await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
  await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  console.log("  removed test rows");
  console.log(
    failures === 0
      ? "\nALL MEMBER OVERVIEW CHECKS PASSED\n"
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
