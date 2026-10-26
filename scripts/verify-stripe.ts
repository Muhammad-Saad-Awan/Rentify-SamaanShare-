// ============================================================================
// SamaanShare - Stripe webhook verification (TEST MODE)
// ============================================================================
// The pure decision has unit tests (`src/lib/payments/stripe.test.ts`). What is
// left only exists against a running app and a real Postgres:
//
//   THE SIGNATURE  - a request with no signature, or a wrong one, is refused
//                    before anything is read. Proved over HTTP against the real
//                    route, with payloads signed by the SDK's own test helper
//                    and the real STRIPE_WEBHOOK_SECRET.
//   THE COMPLETION - a paid session marks the payment COMPLETED exactly as an
//                    administrator's verification would: frozen rate, both
//                    notifications, booking left where it was.
//   IDEMPOTENCY    - a replayed event, and the same event delivered five times
//                    at once, complete the payment once and notify once.
//   THE REFUSALS   - a wrong amount, an unpaid session, a second collection,
//                    an async failure, and a payment for a cancelled booking.
//
// Sends no request to Stripe: events are constructed and signed locally, the
// way `stripe trigger` would deliver them, so this runs with no network and no
// test-mode charges. The real Checkout round trip is the manual step in the
// summary (`stripe listen` + a 4242 card).
//
// REQUIRES THE APP RUNNING (`npm run dev`) with STRIPE_SECRET_KEY and
// STRIPE_WEBHOOK_SECRET set in .env.local. Creates its own throwaway rows and
// deletes them.
//
//   npm run verify:stripe            (VERIFY_BASE_URL defaults to localhost:3000)
// ============================================================================

import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";
import Stripe from "stripe";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  BookingStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from "../src/generated/prisma/enums";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const BASE_URL = (
  process.env.VERIFY_BASE_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");
const ENDPOINT = `${BASE_URL}/api/webhooks/stripe`;
const SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";

let failures = 0;

function check(label: string, passed: boolean, detail?: string): void {
  if (passed) {
    console.log(`  ok    ${label}`);

    return;
  }

  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ""}`);
}

let eventCounter = 0;

/** A Checkout event as Stripe would deliver it, reduced to the fields the handler reads. */
function checkoutEvent(
  type: string,
  session: {
    id: string;
    paymentStatus: "paid" | "unpaid";
    amountTotal: number;
    currency?: string;
    metadata: Record<string, string>;
    paymentIntent: string | null;
  },
  eventId = `evt_verify_${Date.now()}_${(eventCounter += 1)}`
): string {
  return JSON.stringify({
    id: eventId,
    object: "event",
    type,
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    api_version: "2026-09-30.endive",
    data: {
      object: {
        id: session.id,
        object: "checkout.session",
        mode: "payment",
        status: "complete",
        payment_status: session.paymentStatus,
        amount_total: session.amountTotal,
        currency: session.currency ?? "pkr",
        metadata: session.metadata,
        payment_intent: session.paymentIntent,
        livemode: false,
      },
    },
  });
}

async function deliver(
  payload: string,
  signature: string | null = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: SECRET,
  })
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(signature ? { "stripe-signature": signature } : {}),
    },
    body: payload,
    redirect: "manual",
  });

  let body: Record<string, unknown> = {};

  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON - reported through the status check.
  }

  return { status: response.status, body };
}

async function main(): Promise<void> {
  if (!SECRET || !process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in .env.local, restart `npm run dev`, then run this again."
    );
  }

  try {
    await fetch(BASE_URL, { method: "HEAD" });
  } catch {
    throw new Error(
      `Nothing is listening on ${BASE_URL}. Start the app with \`npm run dev\` first.`
    );
  }

  const stamp = Date.now();
  const tag = `verify-stripe-${stamp}`;

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

  const listing = await prisma.listing.create({
    data: {
      ownerId: owner.id,
      title: "Verify Stripe Listing",
      description: "Created by npm run verify:stripe.",
      categoryId: category.id,
      condition: "GOOD",
      pricePerDay: 400,
      securityDeposit: 1500,
      city: "karachi",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  const createdUserIds = [owner.id, renter.id];
  const paymentIds: string[] = [];
  const bookingIds: string[] = [];

  /** A booking waiting on a card payment, as `startCardCheckout` leaves it. */
  async function cardBooking(
    offsetDays: number,
    status: BookingStatus = BookingStatus.PAYMENT_PENDING
  ) {
    const payment = await prisma.payment.create({
      data: {
        provider: PaymentProvider.STRIPE,
        method: PaymentMethod.CREDIT_CARD,
        status: PaymentStatus.PROCESSING,
        amount: 4_999,
        securityDeposit: 1_500,
      },
      select: { id: true },
    });

    const booking = await prisma.booking.create({
      data: {
        listingId: listing.id,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: new Date(Date.now() + offsetDays * 864e5),
        endDate: new Date(Date.now() + (offsetDays + 3) * 864e5),
        totalPrice: 4_999,
        securityDeposit: 1_500,
        status,
        paymentId: payment.id,
      },
      select: { id: true },
    });

    paymentIds.push(payment.id);
    bookingIds.push(booking.id);

    return {
      paymentId: payment.id,
      bookingId: booking.id,
      metadata: {
        bookingId: booking.id,
        paymentId: payment.id,
        renterId: renter.id,
      },
    };
  }

  // (4,999 + 1,500) rupees in paisa - what `chargeTotal` computes.
  const TOTAL = 649_900;

  const notificationsFor = (bookingId: string) =>
    prisma.notification.count({
      where: { entityId: bookingId, userId: { in: createdUserIds } },
    });

  try {
    const primary = await cardBooking(30);

    // ------------------------------------------------------------ signature
    console.log("\nSignature verification");

    const paidPayload = checkoutEvent("checkout.session.completed", {
      id: `cs_test_${stamp}_a`,
      paymentStatus: "paid",
      amountTotal: TOTAL,
      metadata: primary.metadata,
      paymentIntent: `pi_test_${stamp}_a`,
    });

    const unsigned = await deliver(paidPayload, null);

    check(
      "a request with no signature is refused (400)",
      unsigned.status === 400,
      `got ${unsigned.status}`
    );

    const forged = await deliver(
      paidPayload,
      Stripe.webhooks.generateTestHeaderString({
        payload: paidPayload,
        secret: "whsec_not_the_real_secret",
      })
    );

    check(
      "a request signed with the wrong secret is refused (400)",
      forged.status === 400,
      `got ${forged.status}`
    );

    const tampered = await deliver(
      paidPayload.replace(String(TOTAL), String(TOTAL + 100)),
      Stripe.webhooks.generateTestHeaderString({
        payload: paidPayload,
        secret: SECRET,
      })
    );

    check(
      "a body altered after signing is refused (400)",
      tampered.status === 400,
      `got ${tampered.status}`
    );

    const afterForgeries = await prisma.payment.findUniqueOrThrow({
      where: { id: primary.paymentId },
      select: { status: true },
    });

    check(
      "none of them touched the payment",
      afterForgeries.status === PaymentStatus.PROCESSING,
      afterForgeries.status
    );

    // ------------------------------------------------------------ refusals before completion
    console.log("\nRefusals");

    const wrongAmount = await deliver(
      checkoutEvent("checkout.session.completed", {
        id: `cs_test_${stamp}_wrong`,
        paymentStatus: "paid",
        amountTotal: 100,
        metadata: primary.metadata,
        paymentIntent: `pi_test_${stamp}_wrong`,
      })
    );

    check(
      "a session for the wrong amount is acknowledged but refused",
      wrongAmount.status === 200 && wrongAmount.body.outcome === "reject",
      JSON.stringify(wrongAmount.body)
    );

    const unpaid = await deliver(
      checkoutEvent("checkout.session.completed", {
        id: `cs_test_${stamp}_unpaid`,
        paymentStatus: "unpaid",
        amountTotal: TOTAL,
        metadata: primary.metadata,
        paymentIntent: null,
      })
    );

    check(
      "a completed but unpaid session (delayed method) is not fulfilled",
      unpaid.status === 200 && unpaid.body.outcome === "ignore",
      JSON.stringify(unpaid.body)
    );

    const expired = await deliver(
      checkoutEvent("checkout.session.expired", {
        id: `cs_test_${stamp}_exp`,
        paymentStatus: "unpaid",
        amountTotal: TOTAL,
        metadata: primary.metadata,
        paymentIntent: null,
      })
    );

    check(
      "an expired session is acknowledged and ignored",
      expired.status === 200 &&
        expired.body.ignored === "checkout.session.expired",
      JSON.stringify(expired.body)
    );

    const stillProcessing = await prisma.payment.findUniqueOrThrow({
      where: { id: primary.paymentId },
      select: { status: true },
    });

    check(
      "the payment is still waiting after all of them",
      stillProcessing.status === PaymentStatus.PROCESSING,
      stillProcessing.status
    );

    // ------------------------------------------------------------ completion
    console.log("\nCompletion");

    const completed = await deliver(paidPayload);

    check(
      "a paid, matching session completes the payment",
      completed.status === 200 && completed.body.outcome === "complete",
      JSON.stringify(completed.body)
    );

    const done = await prisma.payment.findUniqueOrThrow({
      where: { id: primary.paymentId },
      select: {
        status: true,
        provider: true,
        transactionRef: true,
        confirmedAt: true,
        confirmedById: true,
        commissionRateBps: true,
        metadata: true,
      },
    });

    check(
      "status is COMPLETED",
      done.status === PaymentStatus.COMPLETED,
      done.status
    );
    check("provider is STRIPE", done.provider === PaymentProvider.STRIPE);
    check(
      "transactionRef is the PaymentIntent",
      done.transactionRef === `pi_test_${stamp}_a`,
      String(done.transactionRef)
    );
    check("confirmedAt is set", done.confirmedAt !== null);
    check(
      "confirmedById is null - Stripe, not an administrator",
      done.confirmedById === null
    );
    check("the commission rate is frozen", done.commissionRateBps !== null);
    check(
      "the session and event are recorded in metadata",
      JSON.stringify(done.metadata).includes(`cs_test_${stamp}_a`)
    );

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: primary.bookingId },
      select: { status: true },
    });

    check(
      "the booking is NOT moved - verifying money is not starting a rental",
      booking.status === BookingStatus.PAYMENT_PENDING,
      booking.status
    );

    const notified = await notificationsFor(primary.bookingId);

    check(
      "renter and owner are both notified",
      notified === 2,
      `got ${notified}`
    );

    // ------------------------------------------------------------ idempotency
    console.log("\nIdempotency");

    const replay = await deliver(paidPayload);

    check(
      "replaying the same event is a no-op",
      replay.status === 200 && replay.body.outcome === "duplicate",
      JSON.stringify(replay.body)
    );

    check(
      "no second set of notifications",
      (await notificationsFor(primary.bookingId)) === 2
    );

    const race = await cardBooking(40);
    const racePayload = checkoutEvent("checkout.session.completed", {
      id: `cs_test_${stamp}_race`,
      paymentStatus: "paid",
      amountTotal: TOTAL,
      metadata: race.metadata,
      paymentIntent: `pi_test_${stamp}_race`,
    });

    const burst = await Promise.all(
      Array.from({ length: 5 }, () => deliver(racePayload))
    );

    check(
      "five concurrent deliveries are all acknowledged",
      burst.every((result) => result.status === 200),
      burst.map((result) => result.status).join(",")
    );

    const raced = await prisma.payment.findUniqueOrThrow({
      where: { id: race.paymentId },
      select: { status: true },
    });

    check("the payment completed", raced.status === PaymentStatus.COMPLETED);
    check(
      "and was notified exactly once",
      (await notificationsFor(race.bookingId)) === 2,
      `got ${await notificationsFor(race.bookingId)}`
    );

    // ------------------------------------------------------------ after completion
    console.log("\nAfter completion");

    const second = await deliver(
      checkoutEvent("checkout.session.completed", {
        id: `cs_test_${stamp}_second`,
        paymentStatus: "paid",
        amountTotal: TOTAL,
        metadata: primary.metadata,
        paymentIntent: `pi_test_${stamp}_second`,
      })
    );

    check(
      "a second paid session for a completed payment is not applied",
      second.status === 200 && second.body.outcome === "unapplied",
      JSON.stringify(second.body)
    );

    const afterSecond = await prisma.payment.findUniqueOrThrow({
      where: { id: primary.paymentId },
      select: { transactionRef: true, metadata: true },
    });

    check(
      "the original PaymentIntent is kept",
      afterSecond.transactionRef === `pi_test_${stamp}_a`
    );
    check(
      "the second collection is recorded for a refund",
      JSON.stringify(afterSecond.metadata).includes(`cs_test_${stamp}_second`)
    );

    // ------------------------------------------------------------ async failure
    console.log("\nAsync failure");

    const failing = await cardBooking(50);
    const failed = await deliver(
      checkoutEvent("checkout.session.async_payment_failed", {
        id: `cs_test_${stamp}_fail`,
        paymentStatus: "unpaid",
        amountTotal: TOTAL,
        metadata: failing.metadata,
        paymentIntent: `pi_test_${stamp}_fail`,
      })
    );

    const failedRow = await prisma.payment.findUniqueOrThrow({
      where: { id: failing.paymentId },
      select: { status: true },
    });

    check(
      "an async failure marks the payment FAILED so the renter can retry",
      failed.status === 200 && failedRow.status === PaymentStatus.FAILED,
      `${failed.status} ${failedRow.status}`
    );

    // ------------------------------------------------------------ cancelled booking
    console.log("\nCancelled booking");

    const cancelled = await cardBooking(60, BookingStatus.CANCELLED);
    const late = await deliver(
      checkoutEvent("checkout.session.completed", {
        id: `cs_test_${stamp}_late`,
        paymentStatus: "paid",
        amountTotal: TOTAL,
        metadata: cancelled.metadata,
        paymentIntent: `pi_test_${stamp}_late`,
      })
    );

    const lateRow = await prisma.payment.findUniqueOrThrow({
      where: { id: cancelled.paymentId },
      select: { status: true },
    });

    check(
      "money taken for a cancelled booking is still recorded (so it can be refunded)",
      late.status === 200 && lateRow.status === PaymentStatus.COMPLETED,
      `${late.status} ${lateRow.status}`
    );
    check(
      "but nobody is told to hand the item over",
      (await notificationsFor(cancelled.bookingId)) === 0
    );
  } finally {
    await prisma.notification.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    await prisma.listing.deleteMany({ where: { id: listing.id } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });

    await prisma.$disconnect();
  }

  console.log(
    failures === 0
      ? "\nAll Stripe webhook checks passed."
      : `\n${failures} check(s) FAILED.`
  );

  process.exitCode = failures === 0 ? 0 : 1;
}

// No top-level await: the package is CommonJS under tsx.
main().catch((error: unknown) => {
  console.error("Verification failed:", error);
  process.exitCode = 1;
});
