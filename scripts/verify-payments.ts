// ============================================================================
// SamaanShare - Payment verification checks
// ============================================================================
// What Phase 2 added is a state machine guarded by compare-and-swap and two unique
// constraints, and none of that can be proved with Vitest. The pure parts - the schemas
// and the commission split - have unit tests; what is left is the behaviour that only
// exists against a real Postgres:
//
//   THE RACE      - two administrators verifying the same payment, or a renter
//                   resubmitting while one of them decides. A read-then-write passes
//                   review and loses money; only the database can settle it.
//   THE CONSTRAINT- a transaction reference or a receipt claimed twice. The application
//                   check and the insert are not atomic, so the index is the real rule.
//   THE FREEZE    - the commission rate recorded at verification, and cleared again on
//                   reversal.
//   WHAT MUST NOT MOVE - the booking. Verifying money is not starting a rental, and
//                   `canStartBooking()` depends on those staying separate.
//
// Exercises the same statements the actions issue rather than the actions themselves,
// which is what every other verify script here does - a Server Action needs a session
// and the Next action protocol, neither of which belongs in a script.
//
// Creates its own throwaway rows and deletes them.
//
//   npm run verify:payments
// ============================================================================

import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  AdminActionType,
  BookingStatus,
  PaymentProvider,
  PaymentStatus,
  UserRole,
} from "../src/generated/prisma/enums";
import { writeAdminAction } from "../src/lib/admin/log";
import { computeCommission } from "../src/lib/payments/commission";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let failures = 0;

function check(label: string, passed: boolean, detail?: string): void {
  if (passed) {
    console.log(`  ok    ${label}`);

    return;
  }

  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ""}`);
}

/** Mirrors `SUBMITTABLE_FROM` in the action. COMPLETED is absent on purpose. */
const SUBMITTABLE_FROM = [
  PaymentStatus.AWAITING_CONFIRMATION,
  PaymentStatus.PENDING_VERIFICATION,
  PaymentStatus.REJECTED,
];

const RATE_BPS = 750;

async function main(): Promise<void> {
  const stamp = Date.now();
  const tag = `verify-payments-${stamp}`;

  const category = await prisma.category.findFirst({ select: { id: true } });

  if (!category) {
    throw new Error("No categories. Run `npm run db:seed` first.");
  }

  const owner = await prisma.user.create({
    data: { email: `${tag}-owner@samaanshare.test`, name: "Verify Owner" },
    select: { id: true },
  });

  const renter = await prisma.user.create({
    data: { email: `${tag}-renter@samaanshare.test`, name: "Verify Renter" },
    select: { id: true },
  });

  const admin = await prisma.user.create({
    data: {
      email: `${tag}-admin@samaanshare.test`,
      name: "Verify Admin",
      role: UserRole.ADMIN,
    },
    select: { id: true },
  });

  const listing = await prisma.listing.create({
    data: {
      ownerId: owner.id,
      title: "Verify Payments Listing",
      description: "Created by npm run verify:payments.",
      categoryId: category.id,
      condition: "GOOD",
      pricePerDay: 400,
      securityDeposit: 1500,
      city: "karachi",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  const RENTAL = 4_999;

  const payment = await prisma.payment.create({
    data: {
      provider: PaymentProvider.OFFLINE,
      method: "BANK_TRANSFER",
      status: PaymentStatus.AWAITING_CONFIRMATION,
      amount: RENTAL,
      securityDeposit: 1500,
    },
    select: { id: true },
  });

  const booking = await prisma.booking.create({
    data: {
      listingId: listing.id,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(Date.now() + 30 * 864e5),
      endDate: new Date(Date.now() + 33 * 864e5),
      totalPrice: RENTAL,
      securityDeposit: 1500,
      status: BookingStatus.PAYMENT_PENDING,
      paymentId: payment.id,
    },
    select: { id: true, status: true },
  });

  const otherPayment = await prisma.payment.create({
    data: {
      provider: PaymentProvider.OFFLINE,
      method: "BANK_TRANSFER",
      status: PaymentStatus.AWAITING_CONFIRMATION,
      amount: 1_000,
      securityDeposit: 0,
    },
    select: { id: true },
  });

  const createdUserIds = [owner.id, renter.id, admin.id];

  try {
    // ------------------------------------------------------------ submission
    console.log("\nEvidence submission");

    const REF = `UTR-${stamp}`;
    const HASH = stamp.toString(16).padStart(64, "0").slice(0, 64);

    const submitted = await prisma.payment.updateMany({
      where: { id: payment.id, status: { in: SUBMITTABLE_FROM } },
      data: {
        status: PaymentStatus.PENDING_VERIFICATION,
        transactionRef: REF,
        proofHash: HASH,
        submittedAt: new Date(),
      },
    });

    check("evidence moves the payment into the queue", submitted.count === 1);

    const afterSubmit = await prisma.booking.findUnique({
      where: { id: booking.id },
      select: { status: true },
    });

    check(
      "the booking does NOT move when evidence is submitted",
      afterSubmit?.status === BookingStatus.PAYMENT_PENDING,
      `booking is ${afterSubmit?.status}`
    );

    // ------------------------------------------------------------ constraints
    console.log("\nConstraints");

    let duplicateRefRefused = false;

    try {
      await prisma.payment.update({
        where: { id: otherPayment.id },
        data: { transactionRef: REF },
      });
    } catch {
      duplicateRefRefused = true;
    }

    check(
      "the same transaction reference cannot be claimed twice",
      duplicateRefRefused
    );

    let duplicateProofRefused = false;

    try {
      await prisma.payment.update({
        where: { id: otherPayment.id },
        data: { proofHash: HASH },
      });
    } catch {
      duplicateProofRefused = true;
    }

    check("the same receipt cannot be reused", duplicateProofRefused);

    // ------------------------------------------------------------ rejection
    console.log("\nRejection and resubmission");

    const rejected = await prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING_VERIFICATION },
      data: {
        status: PaymentStatus.REJECTED,
        rejectedAt: new Date(),
        rejectionReason: "No matching transfer in the account.",
      },
    });

    check("a queued payment can be rejected", rejected.count === 1);

    const rejectedTwice = await prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING_VERIFICATION },
      data: { status: PaymentStatus.REJECTED },
    });

    check(
      "rejecting twice is refused by the compare-and-swap",
      rejectedTwice.count === 0
    );

    const resubmitted = await prisma.payment.updateMany({
      where: { id: payment.id, status: { in: SUBMITTABLE_FROM } },
      data: {
        status: PaymentStatus.PENDING_VERIFICATION,
        transactionRef: `${REF}-corrected`,
        submittedAt: new Date(),
        rejectedAt: null,
        rejectionReason: null,
      },
    });

    check(
      "a rejected payment can be corrected and resubmitted",
      resubmitted.count === 1
    );

    const cleared = await prisma.payment.findUnique({
      where: { id: payment.id },
      select: { rejectionReason: true },
    });

    check(
      "resubmission clears the previous refusal",
      cleared?.rejectionReason === null
    );

    // ------------------------------------------------------------ verification
    console.log("\nVerification");

    const { commissionAmount, ownerRentalAmount } = computeCommission({
      rentalAmount: RENTAL,
      rateBps: RATE_BPS,
    });

    const verified = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING_VERIFICATION },
        data: {
          status: PaymentStatus.COMPLETED,
          confirmedAt: new Date(),
          confirmedById: admin.id,
          commissionRateBps: RATE_BPS,
        },
      });

      if (updated.count !== 1) {
        return false;
      }

      await writeAdminAction(tx, {
        actorId: admin.id,
        subjectId: renter.id,
        type: AdminActionType.VERIFY_PAYMENT,
        reason: `Verified against reference. Commission ${RATE_BPS}bps.`,
        previousValue: PaymentStatus.PENDING_VERIFICATION,
        newValue: PaymentStatus.COMPLETED,
      });

      return true;
    });

    check("a queued payment can be verified", verified);

    const frozen = await prisma.payment.findUnique({
      where: { id: payment.id },
      select: { commissionRateBps: true, confirmedById: true, status: true },
    });

    check(
      "verification freezes the commission rate",
      frozen?.commissionRateBps === RATE_BPS,
      `stored ${frozen?.commissionRateBps}`
    );

    check(
      "verification records who decided",
      frozen?.confirmedById === admin.id
    );

    check(
      "the split adds up exactly",
      commissionAmount + ownerRentalAmount === RENTAL,
      `${commissionAmount} + ${ownerRentalAmount} != ${RENTAL}`
    );

    const verifiedTwice = await prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING_VERIFICATION },
      data: { status: PaymentStatus.COMPLETED },
    });

    check(
      "a second administrator cannot verify the same payment",
      verifiedTwice.count === 0
    );

    const submitAfterVerify = await prisma.payment.updateMany({
      where: { id: payment.id, status: { in: SUBMITTABLE_FROM } },
      data: { transactionRef: "should-not-apply" },
    });

    check(
      "the renter cannot change the reference after verification",
      submitAfterVerify.count === 0
    );

    const auditVerify = await prisma.adminAction.count({
      where: { actorId: admin.id, type: AdminActionType.VERIFY_PAYMENT },
    });

    check("verification writes an audit row", auditVerify === 1);

    const afterVerify = await prisma.booking.findUnique({
      where: { id: booking.id },
      select: { status: true },
    });

    check(
      "the booking STILL does not move when payment is verified",
      afterVerify?.status === BookingStatus.PAYMENT_PENDING,
      `booking is ${afterVerify?.status}`
    );

    // ------------------------------------------------------------ reversal
    console.log("\nReversal");

    const reversed = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.COMPLETED },
        data: {
          status: PaymentStatus.PENDING_VERIFICATION,
          confirmedAt: null,
          confirmedById: null,
          commissionRateBps: null,
        },
      });

      if (updated.count !== 1) {
        return false;
      }

      await writeAdminAction(tx, {
        actorId: admin.id,
        subjectId: renter.id,
        type: AdminActionType.REVERSE_PAYMENT_VERIFICATION,
        reason: "Verified against the wrong booking.",
        previousValue: PaymentStatus.COMPLETED,
        newValue: PaymentStatus.PENDING_VERIFICATION,
      });

      return true;
    });

    check("a verification can be reversed", reversed);

    const afterReversal = await prisma.payment.findUnique({
      where: { id: payment.id },
      select: {
        commissionRateBps: true,
        confirmedById: true,
        confirmedAt: true,
      },
    });

    check(
      "reversal clears the frozen rate, so the next verification re-freezes",
      afterReversal?.commissionRateBps === null
    );

    check(
      "reversal clears who verified it",
      afterReversal?.confirmedById === null &&
        afterReversal.confirmedAt === null
    );

    const reversedTwice = await prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.COMPLETED },
      data: { status: PaymentStatus.PENDING_VERIFICATION },
    });

    check("reversing twice is refused", reversedTwice.count === 0);

    const auditTotal = await prisma.adminAction.count({
      where: { actorId: admin.id },
    });

    check("every administrator decision left an audit row", auditTotal === 2);
  } finally {
    await prisma.adminAction.deleteMany({
      where: {
        OR: [{ actorId: admin.id }, { subjectId: { in: createdUserIds } }],
      },
    });
    await prisma.booking.deleteMany({ where: { id: booking.id } });
    await prisma.payment.deleteMany({
      where: { id: { in: [payment.id, otherPayment.id] } },
    });
    await prisma.listing.deleteMany({ where: { id: listing.id } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });

    await prisma.$disconnect();
  }

  console.log(
    failures === 0
      ? "\nAll payment checks passed."
      : `\n${failures} check(s) FAILED.`
  );

  process.exitCode = failures === 0 ? 0 : 1;
}

// No top-level await: the package is CommonJS under tsx.
main().catch((error: unknown) => {
  console.error("Verification failed:", error);
  process.exitCode = 1;
});
