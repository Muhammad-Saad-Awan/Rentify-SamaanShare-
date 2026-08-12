// ============================================================================
// SamaanShare - Remove demo seed data
// ============================================================================
// Stage A6 removed the `picsum.photos` entry from `next.config.ts` before the
// first public deploy: every host in `images.remotePatterns` is one `next/image`
// will proxy and cache arbitrary bytes from, so that list is a security boundary
// rather than a convenience.
//
// The consequence is not cosmetic. `next/image` THROWS during server render for an
// unconfigured host - it does not fall back to a broken image - so any page that
// renders a demo listing now returns a 500. The config comment always said the
// entry and the demo data had to go together; this is the second half.
//
// WHAT IT DELETES. Only rows the demo seed created, identified by their `demo-`
// id prefix, plus any ListingImage still pointing at picsum.photos. Nothing else
// is touched, and no real listing can match - real ids are cuids.
//
// DRY RUN BY DEFAULT, like `cleanup:uploads`. Pass --delete to actually remove.
// Deleting is irreversible, so the default is the safe one.
//
//   npm run clean:demo              # report only
//   npm run clean:demo -- --delete  # remove
// ============================================================================

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const shouldDelete = process.argv.includes("--delete");

/** The seed's id prefix. Real ids are cuids and can never collide with this. */
const DEMO_PREFIX = "demo-";

async function main() {
  const demoListings = await prisma.listing.findMany({
    where: { id: { startsWith: DEMO_PREFIX } },
    select: { id: true, title: true },
  });

  const demoUsers = await prisma.user.findMany({
    where: { id: { startsWith: DEMO_PREFIX } },
    select: { id: true, email: true },
  });

  const picsumImages = await prisma.listingImage.count({
    where: { url: { contains: "picsum.photos" } },
  });

  const listingIds = demoListings.map((listing) => listing.id);
  const userIds = demoUsers.map((user) => user.id);

  /**
   * Anything real attached to demo rows stops the run.
   *
   * A booking or a review against a demo listing means someone has been using this data as if it
   * were real, and deleting it would take their record with it. `Listing.owner` is
   * `onDelete: Restrict`, so the database would refuse anyway - but failing here says why, instead
   * of surfacing a foreign-key error.
   */
  const bookings = await prisma.booking.count({
    where: {
      OR: [
        { listingId: { in: listingIds } },
        { renterId: { in: userIds } },
        { ownerId: { in: userIds } },
      ],
    },
  });

  console.log(`\ndemo listings : ${demoListings.length}`);
  console.log(`demo users    : ${demoUsers.length}`);
  console.log(`picsum images : ${picsumImages}`);
  console.log(`bookings tied to them: ${bookings}`);

  if (demoListings.length === 0 && demoUsers.length === 0) {
    console.log("\nNothing to do.\n");

    return;
  }

  if (bookings > 0) {
    console.log(
      "\nREFUSING: there are bookings attached to demo rows. Deleting would destroy real\nbooking history. Remove those bookings first, or delete the rows by hand.\n"
    );

    process.exitCode = 1;

    return;
  }

  if (!shouldDelete) {
    console.log("\nDRY RUN. Nothing was deleted.");
    console.log("Re-run with --delete to remove the rows above.\n");

    for (const listing of demoListings.slice(0, 5)) {
      console.log(`  would delete listing ${listing.id} - ${listing.title}`);
    }

    if (demoListings.length > 5) {
      console.log(`  ... and ${demoListings.length - 5} more`);
    }

    console.log("");

    return;
  }

  /**
   * Ordered by dependency, in one transaction.
   *
   * Images, saved-listing rows and unavailable dates reference the listings; the listings reference
   * the users. Doing it in one transaction means a failure part-way leaves the database as it was
   * rather than half-cleaned.
   */
  await prisma.$transaction(async (tx) => {
    await tx.listingImage.deleteMany({
      where: {
        OR: [
          { listingId: { in: listingIds } },
          { url: { contains: "picsum.photos" } },
        ],
      },
    });

    await tx.savedListing.deleteMany({
      where: {
        OR: [{ listingId: { in: listingIds } }, { userId: { in: userIds } }],
      },
    });

    await tx.unavailableDate.deleteMany({
      where: { listingId: { in: listingIds } },
    });

    await tx.notification.deleteMany({ where: { userId: { in: userIds } } });

    await tx.passwordResetToken.deleteMany({
      where: { userId: { in: userIds } },
    });

    await tx.listing.deleteMany({ where: { id: { in: listingIds } } });

    await tx.user.deleteMany({ where: { id: { in: userIds } } });
  });

  console.log(
    `\nDeleted ${demoListings.length} listings and ${demoUsers.length} users.`
  );
  console.log(
    "Categories and subcategories are untouched - `npm run db:seed` owns those.\n"
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
