import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";

import { newAccountCredentials, readAccount, writeAccount } from "./account";

/**
 * The database half of the end-to-end fixture, run through `tsx`.
 *
 * WHY A SEPARATE PROCESS instead of importing Prisma inside `auth.setup.ts`. Prisma 7 generates a
 * TypeScript client that uses `import.meta`, so it only loads as an ES module. Playwright
 * transpiles test files to CommonJS, where `import.meta` is a syntax error - the setup project
 * fails before it reaches its first line. Running this through `tsx` sidesteps the mismatch
 * entirely, and it is how every `verify:*` script in this project already talks to the database,
 * so it adds no new tooling.
 *
 * Usage: `tsx --env-file=.env.local tests/e2e/fixtures/db.ts <create|destroy>`
 */

async function create(): Promise<void> {
  const { email, password } = newAccountCredentials();

  const category = await prisma.category.findFirst({ select: { id: true } });

  if (!category) {
    throw new Error(
      "No categories found. Run `npm run db:seed` before the end-to-end suite."
    );
  }

  /**
   * Hashed with the application's own helper, not with bcrypt directly. If the project ever
   * changes cost factor or algorithm this follows automatically - a fixture that hard-codes the
   * hashing is one that can produce a login the real code would reject.
   */
  const user = await prisma.user.create({
    data: {
      email,
      name: "E2E Test Account",
      password: await hashPassword(password),
      // Confirmed on purpose: an unverified inbox is its own journey, and not the one under test.
      emailVerified: new Date(),
      city: "karachi",
    },
    select: { id: true },
  });

  /**
   * A listing this account owns, because the owner-side controls have nowhere to render without
   * one - the availability calendar in particular, which is where the `aria-disabled` work landed.
   *
   * NO IMAGES. `ListingImage` rows would have to point at Cloudinary URLs that do not exist, and
   * `next/image` refuses any host outside `remotePatterns`, so fabricating them would trade an
   * untested thing for a broken one.
   */
  const listing = await prisma.listing.create({
    data: {
      ownerId: user.id,
      title: "E2E Test Listing",
      description:
        "Created by the end-to-end suite. If you are reading this in a real database, a run was interrupted before its teardown.",
      categoryId: category.id,
      condition: "GOOD",
      pricePerDay: 500,
      securityDeposit: 2000,
      city: "karachi",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  /**
   * TWO PHOTOS, WRITTEN STRAIGHT TO THE DATABASE. **This suite does not upload to Cloudinary.**
   *
   * The decision, recorded because it was an open question: an end-to-end test that uploads real
   * bytes to a third party needs credentials in CI, leaves assets behind when it is killed, and
   * makes every run depend on somebody else's availability. None of that buys coverage of our own
   * code - the browser posts directly to Cloudinary, so the upload path is theirs, not ours.
   *
   * What we do need is a listing that HAS photos, because that is the state the gallery and the
   * uploader's reorder and delete behaviour only exist in. Rows are enough for that. The URLs
   * point at the Cloudinary host so `next/image` will accept them - `remotePatterns` allows
   * nothing else - and then 404, which renders a broken image and a perfectly real DOM. Every
   * control under test is present and correct.
   *
   * The public ids are deliberately unmistakable. Removing a photo in the UI asks the server to
   * destroy the asset, which for these will find nothing; `deletePendingImage` already treats a
   * failed destroy as somebody else's problem and only logs it, so the flow completes exactly as
   * it does in production.
   */
  await prisma.listingImage.createMany({
    data: [
      {
        listingId: listing.id,
        url: `https://res.cloudinary.com/demo/image/upload/e2e-fixture-${listing.id}-1.jpg`,
        publicId: `e2e-fixture-does-not-exist/${listing.id}-1`,
        order: 0,
      },
      {
        listingId: listing.id,
        url: `https://res.cloudinary.com/demo/image/upload/e2e-fixture-${listing.id}-2.jpg`,
        publicId: `e2e-fixture-does-not-exist/${listing.id}-2`,
        order: 1,
      },
    ],
  });

  /**
   * A second account and a request from it, because the owner-side booking panels - the ones the
   * focus handoff lives in - render only when there is a booking to act on. Nobody signs in as
   * this one; it exists to be the other party.
   */
  const renterCredentials = newAccountCredentials();

  const renter = await prisma.user.create({
    data: {
      email: renterCredentials.email,
      name: "E2E Test Renter",
      password: await hashPassword(renterCredentials.password),
      emailVerified: new Date(),
      city: "karachi",
    },
    select: { id: true },
  });

  /** Well into the future, so no overlap rule or past-date guard can refuse it. */
  const startDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const endDate = new Date(Date.now() + 33 * 24 * 60 * 60 * 1000);

  const booking = await prisma.booking.create({
    data: {
      listingId: listing.id,
      renterId: renter.id,
      ownerId: user.id,
      startDate,
      endDate,
      totalPrice: 1500,
      securityDeposit: 2000,
      status: "PENDING",
    },
    select: { id: true },
  });

  writeAccount({
    userId: user.id,
    listingId: listing.id,
    email,
    password,
    renterId: renter.id,
    bookingId: booking.id,
  });
}

/**
 * A HARD DELETE, which is the one place in this codebase where that is right.
 *
 * Users are soft-deleted everywhere else - `Listing.owner` is `onDelete: Restrict` precisely so a
 * banned account keeps its listings - but a fixture is not a person, and a row marked deleted
 * would still count against user totals and sit in the admin tables forever. The listing goes
 * first, which is what satisfies `Restrict`.
 *
 * Relations are listed explicitly rather than left to cascades: which relations cascade is a
 * schema decision that can change, and a teardown that quietly stops working leaves rows in a
 * shared database without telling anyone.
 */
async function destroy(): Promise<void> {
  const account = readAccount();

  if (!account) {
    return;
  }

  /**
   * Order matters: a booking references both accounts and the listing, and `Listing.owner` is
   * `onDelete: Restrict`. `ListingImage` cascades with its listing, so it is not listed.
   */
  await prisma.booking.deleteMany({ where: { id: account.bookingId } });
  await prisma.unavailableDate.deleteMany({
    where: { listingId: account.listingId },
  });
  await prisma.savedListing.deleteMany({
    where: { userId: { in: [account.userId, account.renterId] } },
  });
  await prisma.listing.deleteMany({ where: { id: account.listingId } });
  await prisma.user.deleteMany({
    where: { id: { in: [account.userId, account.renterId] } },
  });
}

const command = process.argv[2];

async function main(): Promise<void> {
  if (command === "create") {
    await create();
  } else if (command === "destroy") {
    await destroy();
  } else {
    throw new Error(`Unknown command: ${String(command)}. Use create|destroy.`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
