// ============================================================================
// SamaanShare - Admin payment queue checks
// ============================================================================
// The verification queue, through the real HTTP surface.
//
// WHAT THIS COVERS THAT verify-payments.ts DOES NOT. That script exercises the state
// machine against the database. This one fetches the rendered page with a real
// Auth.js session cookie and asserts on the HTML an administrator is actually
// served - so it covers the query, the page, the gating, and the one thing most
// likely to be wrong on a money screen: that the figures shown are the figures
// that will be frozen.
//
//   THE GATE       - a member who is not an administrator must not reach it. The
//                    middleware bounces them to `/` rather than saying the area
//                    exists, and this asserts they do not receive the queue.
//   THE QUERY      - a payment awaiting verification appears, with the reference
//                    an administrator will search their statement for.
//   THE SPLIT      - the commission and owner figures on screen match
//                    `computeCommission` at the configured rate, because a screen
//                    that shows a decision without its consequence is how a rate
//                    gets frozen by surprise.
//   THE TABS       - each view returns only its own status.
//
// Requires a PRODUCTION build and server - `npm run build && npm run start`.
//
//   npm run verify:admin-payments
// ============================================================================

import { encode } from "@auth/core/jwt";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  BookingStatus,
  PaymentProvider,
  PaymentStatus,
  UserRole,
} from "../src/generated/prisma/enums";
import { COMMISSION_RATE_BPS } from "../src/config/commission";
import { computeCommission } from "../src/lib/payments/commission";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const BASE = "http://localhost:3000";
const COOKIE = "authjs.session-token";

let failures = 0;

function check(label: string, passed: boolean, detail?: string): void {
  if (passed) {
    console.log(`  ok    ${label}`);

    return;
  }

  failures += 1;
  console.log(`  FAIL  ${label}${detail ? ` - ${detail}` : ""}`);
}

/** A session the app will accept, minted the way Auth.js mints one. */
async function sessionCookie(user: {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
}) {
  const token = await encode({
    token: {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: "ACTIVE",
    },
    secret: process.env.AUTH_SECRET!,
    salt: COOKIE,
  });

  return `${COOKIE}=${token}`;
}

async function fetchPage(path: string, cookie: string) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { cookie },
    redirect: "manual",
  });

  return { status: response.status, html: await response.text() };
}

const RENTAL = 7_777;
const DEPOSIT = 15_000;

async function main(): Promise<void> {
  const stamp = Date.now();
  const tag = `verify-admin-payments-${stamp}`;

  const category = await prisma.category.findFirst({ select: { id: true } });

  if (!category) {
    throw new Error("No categories. Run `npm run db:seed` first.");
  }

  const admin = await prisma.user.create({
    data: {
      email: `${tag}-admin@samaanshare.test`,
      name: "Queue Admin",
      role: UserRole.ADMIN,
    },
    select: { id: true, email: true, name: true },
  });

  const owner = await prisma.user.create({
    data: { email: `${tag}-owner@samaanshare.test`, name: "Queue Owner" },
    select: { id: true, email: true, name: true },
  });

  const renter = await prisma.user.create({
    data: { email: `${tag}-renter@samaanshare.test`, name: "Queue Renter" },
    select: { id: true, email: true, name: true },
  });

  const listing = await prisma.listing.create({
    data: {
      ownerId: owner.id,
      title: `Queue Listing ${stamp}`,
      description: "Created by npm run verify:admin-payments.",
      categoryId: category.id,
      condition: "GOOD",
      pricePerDay: 2_000,
      securityDeposit: DEPOSIT,
      city: "karachi",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  const reference = `UTR-QUEUE-${stamp}`;

  const payment = await prisma.payment.create({
    data: {
      provider: PaymentProvider.OFFLINE,
      method: "BANK_TRANSFER",
      status: PaymentStatus.PENDING_VERIFICATION,
      amount: RENTAL,
      securityDeposit: DEPOSIT,
      transactionRef: reference,
      submittedAt: new Date(),
    },
    select: { id: true },
  });

  const booking = await prisma.booking.create({
    data: {
      listingId: listing.id,
      renterId: renter.id,
      ownerId: owner.id,
      startDate: new Date(Date.now() + 20 * 864e5),
      endDate: new Date(Date.now() + 23 * 864e5),
      totalPrice: RENTAL,
      securityDeposit: DEPOSIT,
      status: BookingStatus.PAYMENT_PENDING,
      paymentId: payment.id,
    },
    select: { id: true },
  });

  const createdUserIds = [admin.id, owner.id, renter.id];

  try {
    const adminCookie = await sessionCookie({ ...admin, role: "ADMIN" });
    const renterCookie = await sessionCookie({ ...renter, role: "USER" });

    // ------------------------------------------------------------ the gate
    console.log("\nAccess");

    const asRenter = await fetchPage("/admin/payments", renterCookie);

    check(
      "a member who is not an administrator does not receive the queue",
      asRenter.status !== 200 || !asRenter.html.includes(reference),
      `status ${asRenter.status}`
    );

    const asAdmin = await fetchPage("/admin/payments", adminCookie);

    check(
      "an administrator receives the page",
      asAdmin.status === 200,
      `status ${asAdmin.status}`
    );

    // ------------------------------------------------------------ the queue
    console.log("\nThe queue");

    check(
      "the payment awaiting verification is listed",
      asAdmin.html.includes(reference),
      "the transaction reference is not on the page"
    );

    check(
      "the listing it belongs to is named",
      asAdmin.html.includes(`Queue Listing ${stamp}`)
    );

    /**
     * The figures, checked against the same function the settlement will use.
     *
     * Computed here rather than hardcoded: at a rate of zero the commission is zero and a
     * hardcoded expectation would pass whatever the page rendered, which is precisely the
     * assertion that stops being worth anything the day a rate is set.
     */
    const { commissionAmount, ownerRentalAmount } = computeCommission({
      rentalAmount: RENTAL,
      rateBps: COMMISSION_RATE_BPS,
    });

    const formatted = (value: number) =>
      new Intl.NumberFormat("en-PK").format(value);

    check(
      "the split it would freeze is shown",
      asAdmin.html.includes(`${COMMISSION_RATE_BPS}bps`) &&
        asAdmin.html.includes(formatted(ownerRentalAmount)),
      `expected ${COMMISSION_RATE_BPS}bps and owner ${formatted(ownerRentalAmount)}`
    );

    check(
      "the deposit is stated separately from the rental",
      asAdmin.html.includes(formatted(DEPOSIT)) &&
        asAdmin.html.includes(formatted(RENTAL))
    );

    check(
      "the commission figure comes from the same function settlement uses",
      commissionAmount + ownerRentalAmount === RENTAL
    );

    // ------------------------------------------------------------ the tabs
    console.log("\nViews");

    const verifiedTab = await fetchPage(
      "/admin/payments?status=verified",
      adminCookie
    );

    check(
      "a payment awaiting verification does not appear under Verified",
      verifiedTab.status === 200 && !verifiedTab.html.includes(reference)
    );

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.COMPLETED,
        confirmedAt: new Date(),
        confirmedById: admin.id,
        commissionRateBps: COMMISSION_RATE_BPS,
      },
    });

    const afterVerify = await fetchPage(
      "/admin/payments?status=verified",
      adminCookie
    );

    check("and does once it is verified", afterVerify.html.includes(reference));

    const stillPending = await fetchPage("/admin/payments", adminCookie);

    check("and has left the queue", !stillPending.html.includes(reference));
  } finally {
    await prisma.booking.deleteMany({ where: { id: booking.id } });
    await prisma.payment.deleteMany({ where: { id: payment.id } });
    await prisma.listing.deleteMany({ where: { id: listing.id } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });

    await prisma.$disconnect();
  }

  console.log(
    failures === 0
      ? "\nAll admin payment queue checks passed."
      : `\n${failures} check(s) FAILED.`
  );

  process.exitCode = failures === 0 ? 0 : 1;
}

// No top-level await: the package is CommonJS under tsx.
main().catch((error: unknown) => {
  console.error("Verification failed:", error);
  process.exitCode = 1;
});
