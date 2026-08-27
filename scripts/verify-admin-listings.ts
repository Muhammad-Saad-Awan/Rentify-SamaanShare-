// Listing moderation, verified against a real database.
//
// The unit tests cover the pure rules - what counts as removed, that a restore does not republish.
// This covers what they cannot: that the audit row and the change it describes land together, that
// a second removal is refused rather than writing a record of a transition that never happened,
// that an edit preserves the text it overwrote, and that a removal issued through the report queue
// now produces the same shape of record as one issued by hand - with the report attached.
//
// The load-bearing property is that last one. Before this slice, REMOVE_LISTING through the queue
// wrote nothing at all: the Report row was the only evidence and the listing said nothing but
// DELETED. Both paths now call `removeListing`, so there is one definition of what taking a listing
// down means.
//
// Exercises the library layer and the database directly rather than the Server Actions, which
// require a session - same approach as verify-trust-safety.
//
// Creates its own throwaway rows and deletes them.

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  AdminActionType,
  ListingStatus,
  ReportReason,
  ReportStatus,
  ReportType,
  UserRole,
  UserStatus,
} from "../src/generated/prisma/enums";
import {
  editListing,
  removeListing,
  restoreListing,
} from "../src/lib/admin/listing-moderation";
import { RESTORED_LISTING_STATUS } from "../src/lib/admin/listing-rules";
import {
  getAdminListingDetail,
  searchAdminListings,
} from "../src/lib/queries/admin-listings";
import { VISIBLE_LISTING_WHERE } from "../src/lib/queries/visibility";

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

const ORIGINAL_TITLE = "AL Verify Drill Camera";
const ORIGINAL_DESCRIPTION =
  "Throwaway listing for listing-moderation verification. Call me on 0300 0000000.";

async function main() {
  const stamp = Date.now();
  const sub = await prisma.subcategory.findFirstOrThrow({
    select: { id: true, categoryId: true },
  });

  const admin = await prisma.user.create({
    data: {
      email: `al-admin-${stamp}@example.test`,
      name: "AL Admin",
      role: UserRole.ADMIN,
    },
    select: { id: true },
  });
  const owner = await prisma.user.create({
    data: { email: `al-owner-${stamp}@example.test`, name: "AL Owner" },
    select: { id: true },
  });
  const reporter = await prisma.user.create({
    data: { email: `al-reporter-${stamp}@example.test`, name: "AL Reporter" },
    select: { id: true },
  });

  const newListing = () =>
    prisma.listing.create({
      data: {
        ownerId: owner.id,
        categoryId: sub.categoryId,
        subcategoryId: sub.id,
        title: ORIGINAL_TITLE,
        description: ORIGINAL_DESCRIPTION,
        condition: "GOOD",
        pricePerDay: 900,
        securityDeposit: 5000,
        city: "karachi",
        area: "AL",
        status: ListingStatus.ACTIVE,
      },
      select: { id: true },
    });

  const listing = await newListing();
  const listingIds: string[] = [listing.id];

  // -------------------------------- 1. the removal and its record land together
  console.log(
    "\n=== a removal writes its audit row in the same transaction ==="
  );

  const removal = await prisma.$transaction((tx) =>
    removeListing(tx, {
      listingId: listing.id,
      adminId: admin.id,
      reason: "Prohibited item: the description offers an off-platform sale.",
    })
  );

  check("the removal reported no error", !removal.error, removal);

  const removed = await prisma.listing.findUniqueOrThrow({
    where: { id: listing.id },
    select: { status: true, deletedAt: true },
  });

  /**
   * BOTH COLUMNS, TOGETHER. Decision D3 pairs them and every visibility filter reads both; a row
   * with the status and no timestamp would be hidden but undateable, and one with the timestamp and
   * a live status would be invisible while looking active on every admin screen.
   */
  check(
    "the listing is DELETED and carries a deletion timestamp",
    removed.status === ListingStatus.DELETED && removed.deletedAt !== null,
    removed
  );

  const removalRows = await prisma.adminAction.findMany({
    where: { listingId: listing.id },
    select: {
      type: true,
      subjectId: true,
      actorId: true,
      previousValue: true,
      newValue: true,
      reportId: true,
      reason: true,
    },
  });

  /**
   * THE SUBJECT IS THE OWNER, not the listing. That is what makes "this account has had three
   * listings taken down" visible on the members screen, which is the question a moderator deciding
   * about a person actually has.
   */
  check(
    "one audit row, attributed to the admin, about the owner",
    removalRows.length === 1 &&
      removalRows[0]?.type === AdminActionType.REMOVE_LISTING &&
      removalRows[0]?.subjectId === owner.id &&
      removalRows[0]?.actorId === admin.id,
    removalRows
  );

  check(
    "it records the transition it made",
    removalRows[0]?.previousValue === ListingStatus.ACTIVE &&
      removalRows[0]?.newValue === ListingStatus.DELETED,
    removalRows[0]
  );

  check(
    "no report is attached to a removal made by hand",
    removalRows[0]?.reportId === null,
    removalRows[0]
  );

  // --------------------------------------------- 2. a second removal is refused
  console.log("\n=== a listing already removed cannot be removed again ===");

  const second = await prisma.$transaction((tx) =>
    removeListing(tx, {
      listingId: listing.id,
      adminId: admin.id,
      reason: "Second attempt, which must not produce a second record.",
    })
  );

  check("the second removal is refused", Boolean(second.error), second);

  const afterSecond = await prisma.adminAction.count({
    where: { listingId: listing.id },
  });

  /**
   * The point of refusing rather than being idempotent. A second removal that "succeeded" would
   * write a second row claiming ACTIVE to DELETED - a transition that never happened - and would
   * re-stamp `deletedAt`, misdating when the listing actually came down.
   */
  check("and writes no second row", afterSecond === 1, afterSecond);

  // ------------------------------------- 3. a removed listing stays inspectable
  console.log("\n=== moderation can still see what it removed ===");

  const detail = await getAdminListingDetail(listing.id);

  check(
    "the admin detail query returns a removed listing",
    detail !== null && detail.isDeleted,
    detail === null ? "null" : detail.status
  );

  check(
    "and its history is readable through listingId",
    (detail?.history.length ?? 0) === 1,
    detail?.history
  );

  const publicView = await prisma.listing.findFirst({
    where: { ...VISIBLE_LISTING_WHERE, id: listing.id },
    select: { id: true },
  });

  check(
    "while the public cannot see it at all",
    publicView === null,
    publicView
  );

  const removedFilter = await searchAdminListings({
    status: ListingStatus.DELETED,
    ownerId: owner.id,
  });

  check(
    "the Removed filter finds it",
    removedFilter.items.some((row) => row.id === listing.id),
    removedFilter.items.map((row) => row.status)
  );

  const activeFilter = await searchAdminListings({
    status: ListingStatus.ACTIVE,
    ownerId: owner.id,
  });

  check(
    "and the Active filter does not",
    !activeFilter.items.some((row) => row.id === listing.id),
    activeFilter.items.map((row) => row.id)
  );

  // ------------------------------------------------- 4. a restore does not republish
  console.log(
    "\n=== a restore hands the listing back, it does not repost it ==="
  );

  const restored = await prisma.$transaction((tx) =>
    restoreListing(tx, {
      listingId: listing.id,
      adminId: admin.id,
      reason:
        "Removed in error; the number was in a quoted message, not an offer.",
    })
  );

  check("the restore reported no error", !restored.error, restored);

  const back = await prisma.listing.findUniqueOrThrow({
    where: { id: listing.id },
    select: { status: true, deletedAt: true },
  });

  /**
   * PAUSED, NOT ACTIVE. Republishing on the owner's behalf makes a commercial decision for them, and
   * a listing removed while ACTIVE would otherwise go straight back onto the market the moment a
   * removal is reversed - including when the reversal is itself the mistake.
   */
  check(
    `it comes back as ${RESTORED_LISTING_STATUS} with the timestamp cleared`,
    back.status === RESTORED_LISTING_STATUS && back.deletedAt === null,
    back
  );

  const stillHidden = await prisma.listing.findFirst({
    where: { ...VISIBLE_LISTING_WHERE, id: listing.id },
    select: { id: true },
  });

  check(
    "so it is still not on the marketplace until the owner resumes it",
    stillHidden === null,
    stillHidden
  );

  // ------------------------------------------------ 5. an edit preserves what it overwrote
  console.log("\n=== an edit records the text it destroyed ===");

  const NEW_TITLE = "AL Verify Drill Camera";
  const NEW_DESCRIPTION =
    "Throwaway listing for listing-moderation verification. Contact details removed by moderation.";

  // The listing has to be live to be editable - a removed one is refused, deliberately.
  await prisma.listing.update({
    where: { id: listing.id },
    data: { status: ListingStatus.ACTIVE },
  });

  const edit = await prisma.$transaction((tx) =>
    editListing(tx, {
      listingId: listing.id,
      adminId: admin.id,
      reason:
        "Removed a phone number from the description under the contact policy.",
      title: NEW_TITLE,
      description: NEW_DESCRIPTION,
    })
  );

  check("the edit reported no error", !edit.error, edit);

  const editRow = await prisma.adminAction.findFirstOrThrow({
    where: { listingId: listing.id, type: AdminActionType.EDIT_LISTING },
    select: { previousValue: true, newValue: true },
  });

  /**
   * The only remaining copy of the owner's words. Every other action here changes a flag that the
   * enum can reconstruct; this one destroys a sentence, and an owner disputing the edit has nothing
   * else to point at.
   */
  check(
    "the previous description is recorded verbatim",
    editRow.previousValue?.includes(ORIGINAL_DESCRIPTION) === true,
    editRow.previousValue
  );

  check(
    "and so is the replacement",
    editRow.newValue?.includes(NEW_DESCRIPTION) === true,
    editRow.newValue
  );

  const noop = await prisma.$transaction((tx) =>
    editListing(tx, {
      listingId: listing.id,
      adminId: admin.id,
      reason:
        "Saving the form untouched, which must not be recorded as an edit.",
      title: NEW_TITLE,
      description: NEW_DESCRIPTION,
    })
  );

  /**
   * A no-op edit is refused rather than recorded. Otherwise saving an untouched form writes a
   * permanent row asserting that moderation rewrote somebody's listing.
   */
  check("an edit that changes nothing is refused", Boolean(noop.error), noop);

  // ----------------------------------------- 6. an edit is refused on a removed listing
  console.log("\n=== a removed listing is restored before it is edited ===");

  await prisma.listing.update({
    where: { id: listing.id },
    data: { status: ListingStatus.DELETED, deletedAt: new Date() },
  });

  const editRemoved = await prisma.$transaction((tx) =>
    editListing(tx, {
      listingId: listing.id,
      adminId: admin.id,
      reason: "Editing something nobody can see, which achieves nothing.",
      title: "AL Verify Drill Camera, renamed",
      description: NEW_DESCRIPTION,
    })
  );

  check(
    "editing a removed listing is refused and says to restore it",
    editRemoved.error?.includes("Restore it") === true,
    editRemoved
  );

  // ------------------------- 7. the report queue produces the same shape of record
  console.log(
    "\n=== a removal through the report queue records the same thing ==="
  );

  const reported = await newListing();
  listingIds.push(reported.id);

  const report = await prisma.report.create({
    data: {
      reporterId: reporter.id,
      type: ReportType.LISTING,
      targetId: reported.id,
      reason: ReportReason.PROHIBITED_ITEM,
      description: "This is not a rental, it is a sale.",
      status: ReportStatus.PENDING,
    },
    select: { id: true },
  });

  const viaQueue = await prisma.$transaction((tx) =>
    removeListing(tx, {
      listingId: reported.id,
      adminId: admin.id,
      reason: "Prohibited item, confirmed from the description.",
      reportId: report.id,
    })
  );

  check("the queue's removal reported no error", !viaQueue.error, viaQueue);

  const queueRow = await prisma.adminAction.findFirstOrThrow({
    where: { listingId: reported.id },
    select: { type: true, subjectId: true, reportId: true },
  });

  /**
   * THE LINK IS THE POINT. It is what keeps the two paths from producing different kinds of
   * evidence: a removal through the queue and one by hand are now the same row, distinguished only
   * by whether a report caused it.
   */
  check(
    "it is the same row shape, with the report attached",
    queueRow.type === AdminActionType.REMOVE_LISTING &&
      queueRow.subjectId === owner.id &&
      queueRow.reportId === report.id,
    queueRow
  );

  const ownerHistory = await prisma.adminAction.count({
    where: { subjectId: owner.id, type: AdminActionType.REMOVE_LISTING },
  });

  check(
    "and both removals read back on the owner's account",
    ownerHistory === 2,
    ownerHistory
  );

  // --------------------- 8. a suspended owner's listing is visible to moderation
  console.log(
    "\n=== a suspended owner does not hide their listings from moderation ==="
  );

  const live = await newListing();
  listingIds.push(live.id);

  await prisma.user.update({
    where: { id: owner.id },
    data: { status: UserStatus.SUSPENDED },
  });

  const hiddenFromPublic = await prisma.listing.findFirst({
    where: { ...VISIBLE_LISTING_WHERE, id: live.id },
    select: { id: true },
  });

  check(
    "an ACTIVE listing owned by a suspended account is invisible publicly",
    hiddenFromPublic === null,
    hiddenFromPublic
  );

  const visibleToAdmin = await searchAdminListings({ ownerId: owner.id });

  /**
   * Hiding a listing the moment its owner is hidden would make "get suspended" a way to take your
   * inventory out of moderation's reach, and would make a mistaken suspension unreviewable.
   */
  check(
    "but moderation still lists it",
    visibleToAdmin.items.some((row) => row.id === live.id),
    visibleToAdmin.items.map((row) => row.id)
  );

  const summary = visibleToAdmin.items.find((row) => row.id === live.id);

  check(
    "and the row carries the owner's standing, so the screen can say why",
    summary?.owner.status === UserStatus.SUSPENDED,
    summary?.owner
  );

  // ---------------------------------------------------------------- cleanup
  console.log("\n=== cleanup ===");

  const userIds = [admin.id, owner.id, reporter.id];

  await prisma.adminAction.deleteMany({
    where: { subjectId: { in: userIds } },
  });
  await prisma.report.deleteMany({ where: { id: report.id } });
  await prisma.listingImage.deleteMany({
    where: { listingId: { in: listingIds } },
  });
  await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  console.log("  removed test rows");
  console.log(
    failures === 0
      ? "\nALL ADMIN LISTING CHECKS PASSED\n"
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
