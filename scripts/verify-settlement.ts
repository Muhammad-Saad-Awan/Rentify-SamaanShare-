// ============================================================================
// SamaanShare - Settlement checks
// ============================================================================
// Phase 3 decides what a finished rental owes and records paying the owner. The
// arithmetic and the eligibility policy are pure and have unit tests; what is left is
// everything that only exists against a real Postgres:
//
//   THE RACE       - two administrators settling the same booking. Settlement guards
//                    itself with a unique index rather than a conditional update,
//                    because there is no prior row to put a condition on, and an index
//                    is only a guard if it actually rejects.
//   THE TWO STAMPS  - the owner payout and the deposit return, each of which must
//                    happen once. A timestamp that can move is not a record of when
//                    money left.
//   TWO MODELS AT ONCE - the offline flow stamps the payment, the custodial one stamps
//                    the settlement, and both kinds of booking exist while the interface
//                    still drives the old flow.
//   THE FREEZE     - the settlement is computed from the rate stored on the payment,
//                    not from today's configuration. Checked by settling at a rate the
//                    config does not hold.
//   CONSERVATION   - what the columns add up to after a real insert. The unit tests
//                    prove the function conserves; this proves the row does, which is
//                    the thing a bank statement is held against.
//   WHAT MUST NOT MOVE - the booking, and the payment. Settling is a money record.
//
// Exercises the same statements the actions issue rather than the actions themselves,
// which is what every other verify script here does - a Server Action needs a session
// and the Next action protocol, neither of which belongs in a script.
//
// Creates its own throwaway rows and deletes them.
//
//   npm run verify:settlement
// ============================================================================

import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  AdminActionType,
  BookingStatus,
  ClaimStatus,
  PaymentProvider,
  PaymentStatus,
  UserRole,
} from "../src/generated/prisma/enums";
import { writeAdminAction } from "../src/lib/admin/log";
import { createNotifications } from "../src/lib/notifications/create";
import { buildPaymentNotifications } from "../src/lib/notifications/payment-messages";
import { depositState } from "../src/lib/bookings/deposit";
import { refundReadiness } from "../src/lib/payments/refund";
import {
  computeSettlement,
  depositReturnedAtOf,
  settlementReadiness,
  settlementTransfers,
} from "../src/lib/payments/settlement";

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

/**
 * A rate the configuration does not hold.
 *
 * `COMMISSION_RATE_BPS` is 0, so a settlement that silently read the config instead of the frozen
 * value would produce a commission of zero here and the check below would catch it. Picked to
 * divide inexactly into the rental as well, so the rounding is exercised end to end.
 */
const FROZEN_RATE_BPS = 750;
const RENTAL = 4_999;
const DEPOSIT = 25_000;

async function main(): Promise<void> {
  const stamp = Date.now();
  const tag = `verify-settlement-${stamp}`;

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
      title: "Verify Settlement Listing",
      description: "Created by npm run verify:settlement.",
      categoryId: category.id,
      condition: "GOOD",
      pricePerDay: 1_000,
      securityDeposit: DEPOSIT,
      city: "karachi",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  /** A verified payment: the state Phase 2 leaves behind, including the frozen rate. */
  const payment = await prisma.payment.create({
    data: {
      provider: PaymentProvider.OFFLINE,
      method: "BANK_TRANSFER",
      status: PaymentStatus.COMPLETED,
      amount: RENTAL,
      securityDeposit: DEPOSIT,
      transactionRef: `UTR-${stamp}`,
      submittedAt: new Date(),
      confirmedAt: new Date(),
      confirmedById: admin.id,
      commissionRateBps: FROZEN_RATE_BPS,
    },
    select: { id: true, status: true },
  });

  const booking = await prisma.booking.create({
    data: {
      listingId: listing.id,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(Date.now() - 5 * 864e5),
      endDate: new Date(Date.now() - 2 * 864e5),
      totalPrice: RENTAL,
      securityDeposit: DEPOSIT,
      status: BookingStatus.COMPLETED,
      completedAt: new Date(Date.now() - 864e5),
      paymentId: payment.id,
    },
    select: { id: true },
  });

  /** A second booking, used for the claim cases and for the payment-reuse constraint. */
  const otherPayment = await prisma.payment.create({
    data: {
      provider: PaymentProvider.OFFLINE,
      method: "BANK_TRANSFER",
      status: PaymentStatus.COMPLETED,
      amount: 2_000,
      securityDeposit: DEPOSIT,
      confirmedAt: new Date(),
      confirmedById: admin.id,
      commissionRateBps: FROZEN_RATE_BPS,
    },
    select: { id: true },
  });

  const claimedBooking = await prisma.booking.create({
    data: {
      listingId: listing.id,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(Date.now() - 5 * 864e5),
      endDate: new Date(Date.now() - 2 * 864e5),
      totalPrice: 2_000,
      securityDeposit: DEPOSIT,
      status: BookingStatus.COMPLETED,
      completedAt: new Date(Date.now() - 864e5),
      paymentId: otherPayment.id,
    },
    select: { id: true },
  });

  const claim = await prisma.damageClaim.create({
    data: {
      bookingId: claimedBooking.id,
      claimantId: owner.id,
      respondentId: renter.id,
      reason: "DAMAGED",
      description: "Created by npm run verify:settlement.",
      amountClaimed: 6_000,
      status: ClaimStatus.OPEN,
    },
    select: { id: true },
  });

  /** Verified, unsettled, and destined to be refunded rather than settled. */
  const refundPayment = await prisma.payment.create({
    data: {
      provider: PaymentProvider.OFFLINE,
      method: "BANK_TRANSFER",
      status: PaymentStatus.COMPLETED,
      amount: 3_000,
      securityDeposit: 5_000,
      confirmedAt: new Date(),
      confirmedById: admin.id,
      commissionRateBps: FROZEN_RATE_BPS,
    },
    select: { id: true },
  });

  const refundBooking = await prisma.booking.create({
    data: {
      listingId: listing.id,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(Date.now() - 5 * 864e5),
      endDate: new Date(Date.now() - 2 * 864e5),
      totalPrice: 3_000,
      securityDeposit: 5_000,
      status: BookingStatus.CANCELLED,
      paymentId: refundPayment.id,
    },
    select: { id: true },
  });

  const createdUserIds = [owner.id, renter.id, admin.id];
  const settlementIds: string[] = [];

  try {
    // ------------------------------------------------------------ readiness against real rows
    console.log("\nReadiness");

    const loaded = await prisma.booking.findUnique({
      where: { id: booking.id },
      select: {
        status: true,
        payment: {
          select: {
            status: true,
            amount: true,
            securityDeposit: true,
            commissionRateBps: true,
            refundedAt: true,
          },
        },
        claim: { select: { status: true, amountUpheld: true } },
        settlement: { select: { id: true } },
      },
    });

    const readiness = settlementReadiness({
      bookingStatus: loaded!.status,
      paymentStatus: loaded!.payment!.status,
      commissionRateBps: loaded!.payment!.commissionRateBps,
      refunded: loaded!.payment!.refundedAt !== null,
      settled: loaded!.settlement !== null,
      claim: loaded!.claim,
    });

    check(
      "a completed rental with a verified payment is ready to settle",
      readiness.ready,
      readiness.ready ? undefined : readiness.reason
    );

    check(
      "the frozen rate survives the round trip through the database",
      readiness.ready && readiness.commissionRateBps === FROZEN_RATE_BPS,
      `rate is ${loaded?.payment?.commissionRateBps}`
    );

    const claimedLoaded = await prisma.booking.findUnique({
      where: { id: claimedBooking.id },
      select: {
        status: true,
        payment: {
          select: {
            status: true,
            commissionRateBps: true,
            refundedAt: true,
          },
        },
        claim: { select: { status: true, amountUpheld: true } },
        settlement: { select: { id: true } },
      },
    });

    const blockedByClaim = settlementReadiness({
      bookingStatus: claimedLoaded!.status,
      paymentStatus: claimedLoaded!.payment!.status,
      commissionRateBps: claimedLoaded!.payment!.commissionRateBps,
      refunded: false,
      settled: false,
      claim: claimedLoaded!.claim,
    });

    check("an open claim blocks settlement", !blockedByClaim.ready);

    // ------------------------------------------------------------ the settlement row
    console.log("\nSettling");

    const breakdown = computeSettlement({
      rentalAmount: RENTAL,
      rateBps: FROZEN_RATE_BPS,
      securityDeposit: DEPOSIT,
      damageCompensationAmount: 0,
    });

    const settlement = await prisma.$transaction(async (tx) => {
      const created = await tx.settlement.create({
        data: {
          bookingId: booking.id,
          paymentId: payment.id,
          rentalAmount: breakdown.rentalAmount,
          commissionRateBps: breakdown.commissionRateBps,
          commissionAmount: breakdown.commissionAmount,
          ownerRentalAmount: breakdown.ownerRentalAmount,
          securityDeposit: breakdown.securityDeposit,
          damageCompensationAmount: breakdown.damageCompensationAmount,
          depositReturnedAmount: breakdown.depositReturnedAmount,
          settledById: admin.id,
        },
        select: { id: true },
      });

      await writeAdminAction(tx, {
        actorId: admin.id,
        subjectId: owner.id,
        type: AdminActionType.SETTLE_BOOKING,
        reason: "Settled by npm run verify:settlement.",
      });

      return created;
    });

    settlementIds.push(settlement.id);

    const stored = await prisma.settlement.findUnique({
      where: { id: settlement.id },
      select: {
        rentalAmount: true,
        commissionRateBps: true,
        commissionAmount: true,
        ownerRentalAmount: true,
        securityDeposit: true,
        damageCompensationAmount: true,
        depositReturnedAmount: true,
        ownerPaidAt: true,
        depositReturnedAt: true,
        settledById: true,
      },
    });

    check(
      "the commission is the frozen rate applied to the rental, rounded down",
      stored?.commissionAmount === 374,
      `commission is ${stored?.commissionAmount}` // 7.5% of 4,999 = 374.925
    );

    check(
      "commission + owner rental = rental, in the stored row",
      stored!.commissionAmount + stored!.ownerRentalAmount === RENTAL
    );

    check(
      "damage + returned = deposit, in the stored row",
      stored!.damageCompensationAmount + stored!.depositReturnedAmount ===
        DEPOSIT
    );

    check(
      "nothing is created or lost: in equals out",
      stored!.commissionAmount +
        stored!.ownerRentalAmount +
        stored!.damageCompensationAmount +
        stored!.depositReturnedAmount ===
        RENTAL + DEPOSIT
    );

    check(
      "the deposit is not commissioned",
      stored!.commissionAmount < RENTAL &&
        stored!.depositReturnedAmount === DEPOSIT
    );

    check("settling records who did it", stored?.settledById === admin.id);

    check(
      "neither transfer is stamped by settling alone",
      stored?.ownerPaidAt === null && stored.depositReturnedAt === null
    );

    // ------------------------------------------------------------ what must not move
    console.log("\nWhat settling must not touch");

    const afterSettle = await prisma.booking.findUnique({
      where: { id: booking.id },
      select: { status: true, completedAt: true },
    });

    check(
      "the booking does NOT move when it is settled",
      afterSettle?.status === BookingStatus.COMPLETED,
      `booking is ${afterSettle?.status}`
    );

    const paymentAfter = await prisma.payment.findUnique({
      where: { id: payment.id },
      select: { status: true, commissionRateBps: true },
    });

    check(
      "the payment is untouched by settling",
      paymentAfter?.status === PaymentStatus.COMPLETED &&
        paymentAfter.commissionRateBps === FROZEN_RATE_BPS
    );

    // ------------------------------------------------------------ the unique index as a CAS
    console.log("\nConcurrency");

    let secondSettlementRefused = false;

    try {
      await prisma.settlement.create({
        data: {
          bookingId: booking.id,
          paymentId: otherPayment.id,
          rentalAmount: RENTAL,
          commissionRateBps: 0,
          commissionAmount: 0,
          ownerRentalAmount: RENTAL,
          securityDeposit: DEPOSIT,
          depositReturnedAmount: DEPOSIT,
          settledById: admin.id,
        },
        select: { id: true },
      });
    } catch {
      secondSettlementRefused = true;
    }

    check(
      "a booking cannot be settled twice",
      secondSettlementRefused,
      "the unique index on bookingId did not reject"
    );

    let reusedPaymentRefused = false;

    try {
      await prisma.settlement.create({
        data: {
          bookingId: claimedBooking.id,
          paymentId: payment.id,
          rentalAmount: 2_000,
          commissionRateBps: 0,
          commissionAmount: 0,
          ownerRentalAmount: 2_000,
          securityDeposit: DEPOSIT,
          depositReturnedAmount: DEPOSIT,
          settledById: admin.id,
        },
        select: { id: true },
      });
    } catch {
      reusedPaymentRefused = true;
    }

    check(
      "one payment cannot be settled against two bookings",
      reusedPaymentRefused,
      "the unique index on paymentId did not reject"
    );

    // ------------------------------------------------------------ the payout stamp
    console.log("\nOwner payout");

    const payoutRef = `IBFT-${stamp}`;

    const paid = await prisma.settlement.updateMany({
      where: { id: settlement.id, ownerPaidAt: null },
      data: { ownerPaidAt: new Date(), ownerPayoutRef: payoutRef },
    });

    check("the payout stamp applies once", paid.count === 1);

    const paidTwice = await prisma.settlement.updateMany({
      where: { id: settlement.id, ownerPaidAt: null },
      data: { ownerPaidAt: new Date(), ownerPayoutRef: "IBFT-DUPLICATE" },
    });

    check(
      "recording the same payout twice affects nothing",
      paidTwice.count === 0
    );

    const afterPayout = await prisma.settlement.findUnique({
      where: { id: settlement.id },
      select: { ownerPayoutRef: true, depositReturnedAt: true },
    });

    check(
      "the first reference stands",
      afterPayout?.ownerPayoutRef === payoutRef
    );

    check(
      "paying the owner does not return the deposit",
      afterPayout?.depositReturnedAt === null
    );

    // ------------------------------------------------------------ a claim that was upheld
    console.log("\nAn upheld claim");

    await prisma.damageClaim.update({
      where: { id: claim.id },
      data: {
        status: ClaimStatus.RESOLVED,
        amountUpheld: 6_000,
        resolvedById: admin.id,
        resolvedAt: new Date(),
        resolution: "Upheld in full by npm run verify:settlement.",
      },
    });

    const resolved = await prisma.booking.findUnique({
      where: { id: claimedBooking.id },
      select: {
        status: true,
        payment: {
          select: {
            status: true,
            amount: true,
            securityDeposit: true,
            commissionRateBps: true,
          },
        },
        claim: { select: { status: true, amountUpheld: true } },
      },
    });

    const afterResolution = settlementReadiness({
      bookingStatus: resolved!.status,
      paymentStatus: resolved!.payment!.status,
      commissionRateBps: resolved!.payment!.commissionRateBps,
      refunded: false,
      settled: false,
      claim: resolved!.claim,
    });

    check(
      "a resolved claim unblocks settlement and carries its figure",
      afterResolution.ready &&
        afterResolution.damageCompensationAmount === 6_000
    );

    const withDamage = computeSettlement({
      rentalAmount: resolved!.payment!.amount,
      rateBps: FROZEN_RATE_BPS,
      securityDeposit: resolved!.payment!.securityDeposit,
      damageCompensationAmount: afterResolution.ready
        ? afterResolution.damageCompensationAmount
        : 0,
    });

    const claimSettlement = await prisma.settlement.create({
      data: {
        bookingId: claimedBooking.id,
        paymentId: otherPayment.id,
        rentalAmount: withDamage.rentalAmount,
        commissionRateBps: withDamage.commissionRateBps,
        commissionAmount: withDamage.commissionAmount,
        ownerRentalAmount: withDamage.ownerRentalAmount,
        securityDeposit: withDamage.securityDeposit,
        damageCompensationAmount: withDamage.damageCompensationAmount,
        depositReturnedAmount: withDamage.depositReturnedAmount,
        settledById: admin.id,
      },
      select: {
        id: true,
        commissionAmount: true,
        ownerRentalAmount: true,
        damageCompensationAmount: true,
        depositReturnedAmount: true,
      },
    });

    settlementIds.push(claimSettlement.id);

    check(
      "damage compensation comes out of the deposit, not the rental",
      claimSettlement.damageCompensationAmount === 6_000 &&
        claimSettlement.depositReturnedAmount === DEPOSIT - 6_000 &&
        claimSettlement.commissionAmount + claimSettlement.ownerRentalAmount ===
          2_000
    );

    check(
      "damage compensation is never commissioned",
      claimSettlement.commissionAmount === 150, // 7.5% of 2,000, and of nothing else
      `commission is ${claimSettlement.commissionAmount}`
    );

    /**
     * The two payout components stay separate in storage. There is no total column, on purpose -
     * this is the check that would fail if somebody added one and let it drift.
     */
    check(
      "the two payout components are stored separately",
      claimSettlement.ownerRentalAmount === 1_850 &&
        claimSettlement.damageCompensationAmount === 6_000
    );

    // ------------------------------------------------------------ the deposit going back
    console.log("\nDeposit return");

    const returnRef = `IBFT-DEP-${stamp}`;

    const returned = await prisma.settlement.updateMany({
      where: { id: settlement.id, depositReturnedAt: null },
      data: { depositReturnedAt: new Date(), depositReturnRef: returnRef },
    });

    check("the deposit return stamp applies once", returned.count === 1);

    const returnedTwice = await prisma.settlement.updateMany({
      where: { id: settlement.id, depositReturnedAt: null },
      data: { depositReturnedAt: new Date(), depositReturnRef: "IBFT-DUP" },
    });

    check(
      "returning the same deposit twice affects nothing",
      returnedTwice.count === 0
    );

    const settled = await prisma.settlement.findUnique({
      where: { id: settlement.id },
      select: {
        ownerRentalAmount: true,
        damageCompensationAmount: true,
        ownerPaidAt: true,
        ownerPayoutRef: true,
        depositReturnedAmount: true,
        depositReturnedAt: true,
        depositReturnRef: true,
      },
    });

    check(
      "the two references are kept apart",
      settled?.depositReturnRef === returnRef &&
        settled.ownerPayoutRef === payoutRef
    );

    const transfers = settlementTransfers(settled!);

    check(
      "both transfers report as sent, and the settlement is complete",
      transfers.ownerPayout.kind === "sent" &&
        transfers.depositReturn.kind === "sent" &&
        transfers.complete
    );

    const claimTransfers = settlementTransfers(
      (await prisma.settlement.findUnique({
        where: { id: claimSettlement.id },
        select: {
          ownerRentalAmount: true,
          damageCompensationAmount: true,
          ownerPaidAt: true,
          depositReturnedAmount: true,
          depositReturnedAt: true,
        },
      }))!
    );

    check(
      "an unsent settlement owes the owner rental plus damage, and the renter the rest",
      claimTransfers.ownerPayout.kind === "owed" &&
        claimTransfers.ownerPayout.amount === 7_850 &&
        claimTransfers.depositReturn.kind === "owed" &&
        claimTransfers.depositReturn.amount === DEPOSIT - 6_000 &&
        !claimTransfers.complete
    );

    // ------------------------------------------------------------ both models at once
    console.log("\nTwo models in one table");

    const custodial = await prisma.booking.findUnique({
      where: { id: booking.id },
      select: {
        payment: { select: { depositReturnedAt: true } },
        settlement: { select: { depositReturnedAt: true } },
      },
    });

    check(
      "a custodial booking reports the settlement's stamp",
      depositReturnedAtOf(custodial!)?.getTime() ===
        settled!.depositReturnedAt!.getTime() &&
        custodial!.payment!.depositReturnedAt === null
    );

    /** An offline booking: the owner stamped the payment and there is no settlement stamp. */
    const offlineReturnedAt = new Date();

    await prisma.payment.update({
      where: { id: otherPayment.id },
      data: { depositReturnedAt: offlineReturnedAt },
    });

    const offline = await prisma.booking.findUnique({
      where: { id: claimedBooking.id },
      select: {
        payment: { select: { depositReturnedAt: true } },
        settlement: { select: { depositReturnedAt: true } },
      },
    });

    check(
      "an offline booking still reports the payment's stamp",
      depositReturnedAtOf(offline!)?.getTime() === offlineReturnedAt.getTime()
    );

    // ------------------------------------------------------------ the renter's half
    console.log("\nRenter confirmation");

    const confirmed = await prisma.booking.updateMany({
      where: {
        id: booking.id,
        renterId: renter.id,
        depositConfirmedAt: null,
      },
      data: { depositConfirmedAt: new Date() },
    });

    check("the renter's confirmation applies once", confirmed.count === 1);

    const confirmedTwice = await prisma.booking.updateMany({
      where: { id: booking.id, renterId: renter.id, depositConfirmedAt: null },
      data: { depositConfirmedAt: new Date() },
    });

    check("confirming twice affects nothing", confirmedTwice.count === 0);

    /**
     * The owner must not be able to sign for the renter. The action loads as the renter, and the
     * write predicate carries `renterId` as well - this is that second guard, at the database.
     */
    const ownerAttempt = await prisma.booking.updateMany({
      where: {
        id: claimedBooking.id,
        renterId: owner.id,
        depositConfirmedAt: null,
      },
      data: { depositConfirmedAt: new Date() },
    });

    check(
      "the owner cannot confirm receipt on the renter's behalf",
      ownerAttempt.count === 0
    );

    const confirmedRow = await prisma.booking.findUnique({
      where: { id: booking.id },
      select: {
        completedAt: true,
        depositConfirmedAt: true,
        securityDeposit: true,
        payment: { select: { depositReturnedAt: true } },
        settlement: { select: { depositReturnedAt: true } },
      },
    });

    const custodialState = depositState({
      securityDeposit: confirmedRow!.securityDeposit,
      completedAt: confirmedRow!.completedAt,
      depositReturnedAt: depositReturnedAtOf(confirmedRow!),
      depositConfirmedAt: confirmedRow!.depositConfirmedAt,
    });

    check(
      "a custodial return the renter confirmed reports both halves",
      custodialState.kind === "returned" && custodialState.confirmedAt !== null,
      `state is ${custodialState.kind}`
    );

    /** The same confirmation, against the booking whose return was recorded the offline way. */
    await prisma.booking.updateMany({
      where: { id: claimedBooking.id, renterId: renter.id },
      data: { depositConfirmedAt: new Date() },
    });

    const offlineRow = await prisma.booking.findUnique({
      where: { id: claimedBooking.id },
      select: {
        completedAt: true,
        depositConfirmedAt: true,
        securityDeposit: true,
        payment: { select: { depositReturnedAt: true } },
        settlement: { select: { depositReturnedAt: true } },
      },
    });

    const offlineState = depositState({
      securityDeposit: offlineRow!.securityDeposit,
      completedAt: offlineRow!.completedAt,
      depositReturnedAt: depositReturnedAtOf(offlineRow!),
      depositConfirmedAt: offlineRow!.depositConfirmedAt,
    });

    check(
      "the same confirmation works off the offline flow's stamp",
      offlineState.kind === "returned" && offlineState.confirmedAt !== null,
      `state is ${offlineState.kind}`
    );

    // ------------------------------------------------------------ notifications
    console.log("\nNotifications");

    /**
     * The new enum values exist in THIS database, not only in the schema file.
     *
     * The copy has unit tests; what they cannot prove is that the migration adding
     * BOOKING_SETTLED and the rest has actually been applied wherever this runs. A Postgres enum
     * rejects an unknown label, so writing one is the check.
     */
    const written = await createNotifications(
      prisma,
      buildPaymentNotifications({
        bookingId: booking.id,
        listingTitle: "Verify Settlement Listing",
        parties: { renterId: renter.id, ownerId: owner.id },
        event: {
          event: "settled",
          ownerRentalAmount: 4_625,
          commissionAmount: 374,
          damageCompensationAmount: 0,
          depositReturnedAmount: DEPOSIT,
        },
      })
    );

    check(
      "a settlement notifies both parties",
      written.length === 2,
      String(written.length)
    );

    const settledNotices = await prisma.notification.findMany({
      where: { userId: { in: [renter.id, owner.id] }, type: "BOOKING_SETTLED" },
      select: { userId: true, title: true, body: true },
    });

    check("both rows landed", settledNotices.length === 2);

    const renterNotice = settledNotices.find((n) => n.userId === renter.id);

    check(
      "the renter is not shown the commission",
      renterNotice !== undefined &&
        !`${renterNotice.title} ${renterNotice.body ?? ""}`.includes("374")
    );

    const transferNotices = await createNotifications(
      prisma,
      buildPaymentNotifications({
        bookingId: booking.id,
        listingTitle: "Verify Settlement Listing",
        parties: { renterId: renter.id, ownerId: owner.id },
        event: { event: "owner-paid", amount: 4_625 },
      })
    );

    check("a payout notifies the owner only", transferNotices.length === 1);

    // ------------------------------------------------------------ the other terminal outcome
    console.log("\nRefunds");

    const refundable = await prisma.booking.findUnique({
      where: { id: refundBooking.id },
      select: {
        payment: {
          select: {
            status: true,
            amount: true,
            securityDeposit: true,
            refundedAt: true,
          },
        },
        settlement: { select: { id: true } },
      },
    });

    const canRefund = refundReadiness({
      paymentStatus: refundable!.payment!.status,
      amount: refundable!.payment!.amount,
      securityDeposit: refundable!.payment!.securityDeposit,
      refunded: refundable!.payment!.refundedAt !== null,
      settled: refundable!.settlement !== null,
    });

    check(
      "a verified, unsettled payment can be refunded in full",
      canRefund.ready && canRefund.refundAmount === 8_000,
      canRefund.ready ? undefined : canRefund.reason
    );

    /**
     * THE INVARIANT, FROM THE SETTLEMENT SIDE. `booking` was settled above, so it must not be
     * refundable - otherwise the same money pays the owner and comes back to the renter.
     */
    const settledBooking = await prisma.booking.findUnique({
      where: { id: booking.id },
      select: {
        payment: {
          select: {
            status: true,
            amount: true,
            securityDeposit: true,
            refundedAt: true,
          },
        },
        settlement: { select: { id: true } },
      },
    });

    const refundAfterSettle = refundReadiness({
      paymentStatus: settledBooking!.payment!.status,
      amount: settledBooking!.payment!.amount,
      securityDeposit: settledBooking!.payment!.securityDeposit,
      refunded: settledBooking!.payment!.refundedAt !== null,
      settled: settledBooking!.settlement !== null,
    });

    check("a settled booking cannot be refunded", !refundAfterSettle.ready);

    // The compare-and-swap the action issues.
    const refunded = await prisma.payment.updateMany({
      where: {
        id: refundPayment.id,
        status: PaymentStatus.COMPLETED,
        refundedAt: null,
      },
      data: {
        status: PaymentStatus.REFUNDED,
        refundedAt: new Date(),
        refundAmount: 8_000,
        refundRef: `RFND-${stamp}`,
      },
    });

    check("the refund applies once", refunded.count === 1);

    const refundedTwice = await prisma.payment.updateMany({
      where: {
        id: refundPayment.id,
        status: PaymentStatus.COMPLETED,
        refundedAt: null,
      },
      data: { status: PaymentStatus.REFUNDED, refundedAt: new Date() },
    });

    check("refunding twice affects nothing", refundedTwice.count === 0);

    /**
     * AND FROM THE REFUND SIDE. A refunded payment must not be settleable. This is the half that
     * `settlementReadiness` owns, checked here against a row that really was refunded rather
     * than against a flag somebody passed it.
     */
    const afterRefund = await prisma.booking.findUnique({
      where: { id: refundBooking.id },
      select: {
        status: true,
        payment: {
          select: {
            status: true,
            commissionRateBps: true,
            refundedAt: true,
          },
        },
        claim: { select: { status: true, amountUpheld: true } },
        settlement: { select: { id: true } },
      },
    });

    const settleAfterRefund = settlementReadiness({
      bookingStatus: afterRefund!.status,
      paymentStatus: afterRefund!.payment!.status,
      commissionRateBps: afterRefund!.payment!.commissionRateBps,
      refunded: afterRefund!.payment!.refundedAt !== null,
      settled: false,
      claim: afterRefund!.claim,
    });

    check("a refunded payment cannot be settled", !settleAfterRefund.ready);

    /**
     * The handover gate closes as a side effect, which is worth asserting rather than assuming:
     * `canStartBooking()` requires COMPLETED, and a refund moves the payment past it.
     */
    check(
      "a refunded payment is no longer COMPLETED, so the handover gate refuses it",
      afterRefund!.payment!.status === PaymentStatus.REFUNDED
    );

    // ------------------------------------------------------------ audit
    console.log("\nAudit");

    const auditTotal = await prisma.adminAction.count({
      where: { actorId: admin.id, type: AdminActionType.SETTLE_BOOKING },
    });

    check("settling left an audit row", auditTotal === 1);

    const subject = await prisma.adminAction.findFirst({
      where: { actorId: admin.id, type: AdminActionType.SETTLE_BOOKING },
      select: { subjectId: true },
    });

    check(
      "the subject of a settlement is the owner, not the renter",
      subject?.subjectId === owner.id
    );
  } finally {
    await prisma.adminAction.deleteMany({
      where: {
        OR: [{ actorId: admin.id }, { subjectId: { in: createdUserIds } }],
      },
    });
    await prisma.settlement.deleteMany({
      where: { id: { in: settlementIds } },
    });
    await prisma.damageClaim.deleteMany({ where: { id: claim.id } });
    await prisma.booking.deleteMany({
      where: { id: { in: [booking.id, claimedBooking.id, refundBooking.id] } },
    });
    await prisma.payment.deleteMany({
      where: { id: { in: [payment.id, otherPayment.id, refundPayment.id] } },
    });
    await prisma.listing.deleteMany({ where: { id: listing.id } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });

    await prisma.$disconnect();
  }

  console.log(
    failures === 0
      ? "\nAll settlement checks passed."
      : `\n${failures} check(s) FAILED.`
  );

  process.exitCode = failures === 0 ? 0 : 1;
}

// No top-level await: the package is CommonJS under tsx.
main().catch((error: unknown) => {
  console.error("Verification failed:", error);
  process.exitCode = 1;
});
