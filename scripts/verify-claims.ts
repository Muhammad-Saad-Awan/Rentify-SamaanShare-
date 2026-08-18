// Damage claims, verified against a real database.
//
// The unit tests cover the pure rules. This covers what they cannot: that one booking can only ever
// carry one claim, that the escalation sweep moves silence to a human without recording it as a
// dispute, that two administrators cannot decide the same claim twice, and - the one that matters
// most - that a claim only reduces the stated deposit obligation once it is actually settled.
//
// Creates its own throwaway rows and deletes them.

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  BookingStatus,
  ClaimReason,
  ClaimStatus,
  HandoverCondition,
  HandoverType,
} from "../src/generated/prisma/enums";
import { depositState } from "../src/lib/bookings/deposit";
import { escalateOverdueClaims } from "../src/lib/claims/escalate";
import {
  CLAIM_RESPONSE_DAYS,
  claimResponseDueAt,
  isClaimOpen,
  upheldAmount,
} from "../src/lib/claims/rules";

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
const DEPOSIT = 60_000;

/** The wiring `queries/bookings.ts` performs, reproduced so the same path is exercised. */
function stateFor(
  claim: {
    status: ClaimStatus;
    amountUpheld: number | null;
    amountClaimed: number;
    filedAt: Date;
  } | null,
  completedAt: Date,
  now: Date
) {
  return depositState({
    securityDeposit: DEPOSIT,
    completedAt,
    depositReturnedAt: null,
    claim: claim
      ? {
          amountUpheld: upheldAmount(claim.status, claim.amountUpheld),
          amountClaimed: claim.amountClaimed,
          pauseEndsAt: isClaimOpen(claim.status)
            ? claimResponseDueAt(claim.filedAt)
            : null,
        }
      : null,
    now,
  });
}

async function main() {
  const stamp = Date.now();
  const sub = await prisma.subcategory.findFirstOrThrow({
    select: { id: true, categoryId: true },
  });

  const owner = await prisma.user.create({
    data: { email: `dc-owner-${stamp}@example.test`, name: "DC Owner" },
    select: { id: true },
  });
  const renter = await prisma.user.create({
    data: { email: `dc-renter-${stamp}@example.test`, name: "DC Renter" },
    select: { id: true },
  });

  const listing = await prisma.listing.create({
    data: {
      ownerId: owner.id,
      categoryId: sub.categoryId,
      subcategoryId: sub.id,
      title: "DC Verify Generator",
      description: "Throwaway listing for claim verification.",
      condition: "GOOD",
      pricePerDay: 3000,
      securityDeposit: DEPOSIT,
      city: "karachi",
      area: "DC",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  const completedAt = new Date(Date.now() - DAY_MS);

  async function completedBooking(day: number) {
    const date = new Date(
      `2028-03-${String(day).padStart(2, "0")}T00:00:00.000Z`
    );

    return prisma.booking.create({
      data: {
        listingId: listing.id,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: date,
        endDate: date,
        totalPrice: 9000,
        securityDeposit: DEPOSIT,
        status: BookingStatus.COMPLETED,
        startedAt: new Date(Date.now() - 2 * DAY_MS),
        completedAt,
      },
      select: { id: true },
    });
  }

  const booking = await completedBooking(1);

  // The return record the claim will point at.
  const handover = await prisma.handoverRecord.create({
    data: {
      bookingId: booking.id,
      type: HandoverType.RETURN,
      recordedById: owner.id,
      condition: HandoverCondition.DAMAGED,
      notes: "Casing cracked, pull cord frayed.",
    },
    select: { id: true },
  });

  // ---------------------------------------- 1. one claim per booking, enforced by the database
  console.log("\n=== a booking can carry only one claim ===");

  const claim = await prisma.damageClaim.create({
    data: {
      bookingId: booking.id,
      claimantId: owner.id,
      respondentId: renter.id,
      reason: ClaimReason.DAMAGED,
      description: "Casing cracked and the pull cord is frayed beyond use.",
      amountClaimed: 15_000,
      handoverId: handover.id,
    },
    select: { id: true, status: true, filedAt: true },
  });

  check("it starts OPEN and undecided", claim.status === ClaimStatus.OPEN);

  let secondRefused = false;

  try {
    await prisma.damageClaim.create({
      data: {
        bookingId: booking.id,
        claimantId: owner.id,
        respondentId: renter.id,
        reason: ClaimReason.OTHER,
        description: "A second bite at the same rental.",
        amountClaimed: 5_000,
      },
    });
  } catch {
    secondRefused = true;
  }

  /**
   * The unique index, not the application check. The read in `canFileClaim` and the insert are not
   * atomic, so two concurrent filings could both pass it - this is what actually holds.
   */
  check("a second claim on the same booking is refused", secondRefused);

  // ------------------------------- 2. an unsettled claim reduces nothing but pauses the clock
  console.log(
    "\n=== an unsettled claim states nothing and pauses the clock ==="
  );

  const live = stateFor(
    { ...claim, amountUpheld: null, amountClaimed: 15_000 },
    completedAt,
    new Date()
  );

  check(
    "the clock is paused while the claim is live",
    live.kind === "claimed",
    live
  );

  /**
   * THE LOAD-BEARING ASSERTION. The platform does not act on one party's demand: until the renter
   * accepts or an administrator rules, the full deposit is still what is owed.
   */
  const lapsed = stateFor(
    { ...claim, amountUpheld: null, amountClaimed: 15_000 },
    completedAt,
    // Past the pause, so the clock has resumed and the amount is visible.
    new Date(claim.filedAt.getTime() + (CLAIM_RESPONSE_DAYS + 1) * DAY_MS)
  );

  check(
    "and once the pause lapses the FULL deposit is still owed",
    lapsed.kind === "overdue" && lapsed.owed === DEPOSIT,
    lapsed
  );

  // ------------------------------------------- 3. silence escalates, and is not a dispute
  console.log("\n=== silence goes to a human, and is recorded as silence ===");

  await prisma.damageClaim.update({
    where: { id: claim.id },
    data: {
      filedAt: new Date(Date.now() - (CLAIM_RESPONSE_DAYS + 1) * DAY_MS),
    },
  });

  const escalated = await escalateOverdueClaims(booking.id);

  check("the sweep escalated it", escalated === 1, escalated);

  const afterSweep = await prisma.damageClaim.findUniqueOrThrow({
    where: { id: claim.id },
    select: { status: true, respondedAt: true, amountUpheld: true },
  });

  check(
    "it is now DISPUTED",
    afterSweep.status === ClaimStatus.DISPUTED,
    afterSweep
  );

  /**
   * `respondedAt` stays null, which is how an administrator tells an absence from a disagreement.
   * And nothing was upheld by the escalation - silence is not acceptance.
   */
  check(
    "with no response recorded and nothing upheld",
    afterSweep.respondedAt === null && afterSweep.amountUpheld === null,
    afterSweep
  );

  const swept = await escalateOverdueClaims(booking.id);
  check("re-sweeping is a no-op", swept === 0, swept);

  // ----------------------------------------- 4. a determination is made once
  console.log("\n=== a claim is decided once ===");

  const decide = (amountUpheld: number) =>
    prisma.damageClaim.updateMany({
      where: { id: claim.id, status: ClaimStatus.DISPUTED },
      data: {
        status: ClaimStatus.RESOLVED,
        amountUpheld,
        resolution: "Decided on the photographs and the return record.",
        resolvedAt: new Date(),
      },
    });

  const [first, second] = await Promise.all([decide(5_000), decide(15_000)]);

  check(
    "exactly one determination took effect",
    first.count + second.count === 1,
    {
      first: first.count,
      second: second.count,
    }
  );

  const decided = await prisma.damageClaim.findUniqueOrThrow({
    where: { id: claim.id },
    select: {
      status: true,
      amountUpheld: true,
      filedAt: true,
      amountClaimed: true,
    },
  });

  // ------------------------------- 5. a settled claim reduces the stated obligation
  console.log(
    "\n=== a settled claim reduces what the platform says is owed ==="
  );

  const settled = stateFor(decided, completedAt, new Date());

  check(
    "the clock is running again once settled",
    settled.kind === "due" || settled.kind === "overdue",
    settled
  );

  check(
    `the obligation dropped by the upheld amount (${decided.amountUpheld})`,
    (settled.kind === "due" || settled.kind === "overdue") &&
      settled.owed === DEPOSIT - (decided.amountUpheld ?? 0),
    settled
  );

  // ------------------------------------------- 6. a withdrawn claim settles at nothing
  console.log("\n=== a withdrawn claim leaves the whole deposit owed ===");

  const second_booking = await completedBooking(2);
  const withdrawn = await prisma.damageClaim.create({
    data: {
      bookingId: second_booking.id,
      claimantId: owner.id,
      respondentId: renter.id,
      reason: ClaimReason.LATE_RETURN,
      description: "Returned two days late and I lost the next booking.",
      amountClaimed: 9_000,
      status: ClaimStatus.WITHDRAWN,
      amountUpheld: 0,
    },
    select: {
      status: true,
      amountUpheld: true,
      amountClaimed: true,
      filedAt: true,
    },
  });

  const afterWithdrawal = stateFor(withdrawn, completedAt, new Date());

  check(
    "the full deposit is owed again",
    (afterWithdrawal.kind === "due" || afterWithdrawal.kind === "overdue") &&
      afterWithdrawal.owed === DEPOSIT,
    afterWithdrawal
  );

  check(
    "and the clock is not paused by a settled claim",
    afterWithdrawal.kind !== "claimed"
  );

  // ---------------------------------------------------------------- cleanup
  console.log("\n=== cleanup ===");

  const bookingIds = [booking.id, second_booking.id];

  await prisma.claimPhoto.deleteMany({
    where: { claim: { bookingId: { in: bookingIds } } },
  });
  await prisma.damageClaim.deleteMany({
    where: { bookingId: { in: bookingIds } },
  });
  await prisma.handoverPhoto.deleteMany({
    where: { handover: { bookingId: { in: bookingIds } } },
  });
  await prisma.handoverRecord.deleteMany({
    where: { bookingId: { in: bookingIds } },
  });
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
      ? "\nALL DAMAGE CLAIM CHECKS PASSED\n"
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
