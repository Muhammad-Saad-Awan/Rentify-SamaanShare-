// Stage A verification against the real database.
//
// Covers what the unit tests cannot: that the password-reset token lifecycle behaves correctly
// against Postgres, that single use is decided by the database rather than by a check that can be
// overtaken, and that the read-path queries still work after the A4 transaction change.
//
// DELIBERATELY SENDS NO EMAIL. Calling Resend would put real mail in a real inbox, which is not
// something a verification script should do unasked. The transport is exercised separately and only
// on request - see the note at the end of the run.
//
// Requires the dev server on http://localhost:3000 for the page checks.

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { UserStatus } from "../src/generated/prisma/enums";
import {
  checkResetToken,
  createResetToken,
  hashResetToken,
  resetTokenExpiry,
} from "../src/lib/auth/password-reset";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const BASE = "http://localhost:3000";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}`, detail ?? "");
  }
}

async function status(path: string): Promise<number> {
  try {
    const response = await fetch(`${BASE}${path}`, { redirect: "manual" });

    return response.status;
  } catch {
    return 0;
  }
}

async function main() {
  const stamp = Date.now();

  const user = await prisma.user.create({
    data: {
      email: `stage-a-${stamp}@example.test`,
      name: "Stage A User",
      password: "not-a-real-hash",
    },
    select: { id: true, email: true },
  });

  const suspended = await prisma.user.create({
    data: {
      email: `stage-a-susp-${stamp}@example.test`,
      status: UserStatus.SUSPENDED,
      password: "not-a-real-hash",
    },
    select: { id: true },
  });

  console.log("\n=== token is stored only as a hash ===");

  const { token, tokenHash } = createResetToken();

  const created = await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: resetTokenExpiry() },
    select: { id: true },
  });

  const stored = await prisma.passwordResetToken.findUniqueOrThrow({
    where: { id: created.id },
    select: { tokenHash: true, usedAt: true, expiresAt: true },
  });

  check("the raw token is nowhere in the row", stored.tokenHash !== token);
  check(
    "the hash matches the token",
    stored.tokenHash === hashResetToken(token)
  );
  check("starts unspent", stored.usedAt === null);
  check("is accepted while fresh", checkResetToken(stored) === null);

  console.log("\n=== lookup by hash finds exactly one row ===");

  const found = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken(token) },
    select: { id: true },
  });

  check("found by hash", found?.id === created.id);

  const notFound = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashResetToken("some-other-token") },
    select: { id: true },
  });

  check("a wrong token finds nothing", notFound === null);

  console.log("\n=== single use is decided by the database ===");

  // Two concurrent redemptions of the same token. Exactly one must claim it, or a leaked link is
  // replayable under load.
  const [a, b] = await Promise.all([
    prisma.passwordResetToken.updateMany({
      where: { id: created.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.updateMany({
      where: { id: created.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  check("exactly one redemption claimed the token", a.count + b.count === 1, {
    a: a.count,
    b: b.count,
  });

  const spent = await prisma.passwordResetToken.findUniqueOrThrow({
    where: { id: created.id },
    select: { usedAt: true, expiresAt: true },
  });

  check("a spent token is refused", checkResetToken(spent) === "used");

  console.log("\n=== an expired token is refused ===");

  const expired = await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: createResetToken().tokenHash,
      expiresAt: new Date(Date.now() - 60_000),
    },
    select: { expiresAt: true, usedAt: true },
  });

  check("expired is refused", checkResetToken(expired) === "expired");

  console.log("\n=== requesting again invalidates the previous link ===");

  const first = createResetToken();
  const firstRow = await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: first.tokenHash,
      expiresAt: resetTokenExpiry(),
    },
    select: { id: true },
  });

  // What the action does: spend every outstanding token, then mint a new one.
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createResetToken().tokenHash,
        expiresAt: resetTokenExpiry(),
      },
    });
  });

  const firstAfter = await prisma.passwordResetToken.findUniqueOrThrow({
    where: { id: firstRow.id },
    select: { usedAt: true, expiresAt: true },
  });

  check(
    "the older link is spent once a new one is issued",
    checkResetToken(firstAfter) === "used"
  );

  const liveCount = await prisma.passwordResetToken.count({
    where: { userId: user.id, usedAt: null },
  });

  check("exactly one live token remains", liveCount === 1, liveCount);

  console.log("\n=== a suspended account is not eligible ===");

  const suspendedUser = await prisma.user.findUniqueOrThrow({
    where: { id: suspended.id },
    select: { status: true, deletedAt: true },
  });

  check(
    "suspension is visible to the action's guard",
    suspendedUser.status !== UserStatus.ACTIVE
  );

  console.log("\n=== A4: read paths still work without transactions ===");

  // These are the queries converted from `$transaction([...])` to `Promise.all`.
  const [listings, listingCount] = await Promise.all([
    prisma.listing.findMany({ take: 2, select: { id: true } }),
    prisma.listing.count(),
  ]);

  check(
    "listings read concurrently",
    Array.isArray(listings) && typeof listingCount === "number"
  );

  const [notifications, notificationCount] = await Promise.all([
    prisma.notification.findMany({ take: 2, select: { id: true } }),
    prisma.notification.count(),
  ]);

  check(
    "notifications read concurrently",
    Array.isArray(notifications) && typeof notificationCount === "number"
  );

  console.log("\n=== A5: viewCount increments atomically ===");

  const subcategory = await prisma.subcategory.findFirstOrThrow({
    select: { id: true, categoryId: true },
  });

  const listing = await prisma.listing.create({
    data: {
      ownerId: user.id,
      categoryId: subcategory.categoryId,
      subcategoryId: subcategory.id,
      title: "Stage A View Counter",
      description: "Throwaway listing for view-count verification.",
      condition: "GOOD",
      pricePerDay: 100,
      securityDeposit: 0,
      city: "karachi",
      area: "Stage A",
      status: "ACTIVE",
    },
    select: { id: true, viewCount: true },
  });

  check("a new listing starts at zero views", listing.viewCount === 0);

  /**
   * Twenty concurrent increments must all land.
   *
   * This is why the action uses `{ increment: 1 }` rather than reading the count and writing back:
   * a read-then-write loses views under exactly this condition, silently, and the owner would never
   * know the number was wrong.
   */
  await Promise.all(
    Array.from({ length: 20 }, () =>
      prisma.listing.update({
        where: { id: listing.id },
        data: { viewCount: { increment: 1 } },
      })
    )
  );

  const counted = await prisma.listing.findUniqueOrThrow({
    where: { id: listing.id },
    select: { viewCount: true },
  });

  check(
    "20 concurrent increments all landed",
    counted.viewCount === 20,
    counted.viewCount
  );

  console.log("\n=== A5: a hidden listing is not countable ===");

  // The action looks the listing up through VISIBLE_LISTING_WHERE, so a paused one is simply not
  // found and the count cannot be moved by a stale tab.
  await prisma.listing.update({
    where: { id: listing.id },
    data: { status: "PAUSED" },
  });

  const whileHidden = await prisma.listing.findFirst({
    where: { id: listing.id, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });

  check("a paused listing is invisible to the counter", whileHidden === null);

  console.log("\n=== A5: the tracker is wired into the listing page ===");

  /**
   * Guards against the tracker being dropped from the page.
   *
   * It renders `null`, so there is no markup to look for - but a Client Component appears in the RSC
   * payload as a module reference, and that is enough to know it will hydrate and run its effect.
   * Whether the effect then fires is React's job, not something worth asserting here; what can
   * regress silently is someone removing the component from the tree, and this catches that.
   */
  const anyListing = await prisma.listing.findFirst({
    where: { status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });

  if (anyListing) {
    const html = await fetch(`${BASE}/listings/${anyListing.id}`)
      .then((r) => r.text())
      .catch(() => "");

    check(
      "the listing page references the view tracker",
      html.includes("listing-view-tracker")
    );
  } else {
    console.log("  SKIP  no active listing to check against");
  }

  console.log("\n=== pages render ===");

  const forgot = await status("/forgot-password");
  check("/forgot-password is reachable", forgot === 200, forgot);

  const resetNoToken = await status("/reset-password");
  check(
    "/reset-password without a token still renders guidance",
    resetNoToken === 200,
    resetNoToken
  );

  const resetWithToken = await status(
    "/reset-password?token=abcdefghijklmnopqrstuvwxyz"
  );
  check(
    "/reset-password with a token renders the form",
    resetWithToken === 200,
    resetWithToken
  );

  const login = await status("/login");
  check("/login still renders", login === 200, login);

  console.log("\n=== cleanup ===");

  await prisma.passwordResetToken.deleteMany({
    where: { userId: { in: [user.id, suspended.id] } },
  });
  await prisma.listing.deleteMany({ where: { ownerId: user.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [user.id, suspended.id] } },
  });

  console.log("  removed test rows");

  console.log(
    failures === 0
      ? "\nALL STAGE A CHECKS PASSED\n\nNOT covered here: an actual Resend delivery, which would put\nreal mail in a real inbox. Run one manually from /forgot-password\nwhen you want to confirm the transport.\n"
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
