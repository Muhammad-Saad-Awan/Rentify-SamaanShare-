// Renders the Phase 4 dashboard screens against a real session, at every booking status.
//
// The build proves the pages compile; it does not prove they render. This seeds one booking per
// interesting status, mints a valid Auth.js session cookie for each side, fetches the two
// dashboards plus the notification feed, and asserts the status-specific copy and action labels
// actually appear.
//
// Requires the dev server on http://localhost:3000.

import { encode } from "@auth/core/jwt";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  BookingStatus,
  PaymentProvider,
  PaymentStatus,
} from "../src/generated/prisma/enums";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const BASE = "http://localhost:3000";
const COOKIE = "authjs.session-token";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}`, detail ?? "");
  }
}

/**
 * A session cookie Auth.js will accept, for a user that really exists.
 *
 * `name` is nullable on `User`, so it is nullable here too - a real session for an OAuth user
 * with no display name has exactly this shape.
 */
async function sessionCookie(user: {
  id: string;
  email: string;
  name: string | null;
}) {
  const token = await encode({
    token: {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: "USER",
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

async function main() {
  const subcategory = await prisma.subcategory.findFirstOrThrow({
    select: { id: true, categoryId: true },
  });

  const stamp = Date.now();

  const owner = await prisma.user.create({
    data: { email: `ui-owner-${stamp}@example.test`, name: "UI Owner" },
    select: { id: true, email: true, name: true },
  });

  const renter = await prisma.user.create({
    data: { email: `ui-renter-${stamp}@example.test`, name: "UI Renter" },
    select: { id: true, email: true, name: true },
  });

  const listing = await prisma.listing.create({
    data: {
      ownerId: owner.id,
      categoryId: subcategory.categoryId,
      subcategoryId: subcategory.id,
      title: "UI Verify Camera",
      description: "Throwaway listing for UI verification.",
      condition: "GOOD",
      pricePerDay: 1500,
      securityDeposit: 10800,
      city: "karachi",
      area: "UI",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  /** One booking per status, on non-overlapping dates so the date constraint is satisfied. */
  let dayCursor = 1;

  async function makeBooking(options: {
    status: BookingStatus;
    payment?: { status: PaymentStatus; confirmed?: boolean };
    startedAt?: Date;
    completedAt?: Date;
    depositReturnedAt?: Date;
  }) {
    const date = new Date(
      `2027-06-${String(dayCursor++).padStart(2, "0")}T00:00:00.000Z`
    );

    let paymentId: string | undefined;

    if (options.payment) {
      const payment = await prisma.payment.create({
        data: {
          provider: PaymentProvider.OFFLINE,
          method: "CASH",
          status: options.payment.status,
          amount: 1500,
          securityDeposit: 10800,
          ...(options.payment.confirmed
            ? { confirmedAt: new Date(), confirmedById: owner.id }
            : {}),
          ...(options.depositReturnedAt
            ? { depositReturnedAt: options.depositReturnedAt }
            : {}),
        },
        select: { id: true },
      });

      paymentId = payment.id;
    }

    return prisma.booking.create({
      data: {
        listingId: listing.id,
        renterId: renter.id,
        ownerId: owner.id,
        startDate: date,
        endDate: date,
        totalPrice: 1500,
        securityDeposit: 10800,
        status: options.status,
        ...(paymentId ? { paymentId } : {}),
        ...(options.startedAt ? { startedAt: options.startedAt } : {}),
        ...(options.completedAt ? { completedAt: options.completedAt } : {}),
      },
      select: { id: true },
    });
  }

  console.log("\n=== seeding one booking per status ===");

  await makeBooking({ status: BookingStatus.PENDING });
  await makeBooking({ status: BookingStatus.APPROVED });
  await makeBooking({
    status: BookingStatus.PAYMENT_PENDING,
    payment: { status: PaymentStatus.AWAITING_CONFIRMATION },
  });
  await makeBooking({
    status: BookingStatus.PAYMENT_PENDING,
    payment: { status: PaymentStatus.COMPLETED, confirmed: true },
  });
  await makeBooking({
    status: BookingStatus.ACTIVE,
    payment: { status: PaymentStatus.COMPLETED, confirmed: true },
    startedAt: new Date(),
  });
  // Completed with the deposit still owed, inside the window.
  await makeBooking({
    status: BookingStatus.COMPLETED,
    payment: { status: PaymentStatus.COMPLETED, confirmed: true },
    startedAt: new Date(),
    completedAt: new Date(),
  });
  // Completed and overdue: 60 hours ago, past the 48-hour window.
  await makeBooking({
    status: BookingStatus.COMPLETED,
    payment: { status: PaymentStatus.COMPLETED, confirmed: true },
    startedAt: new Date(Date.now() - 80 * 3_600_000),
    completedAt: new Date(Date.now() - 60 * 3_600_000),
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: renter.id,
        type: "BOOKING_APPROVED",
        title: "Your request for UI Verify Camera was approved",
        body: "Choose how you will pay the owner to continue.",
        entityType: "booking",
        entityId: "x",
      },
      {
        userId: owner.id,
        type: "BOOKING_REQUESTED",
        title: "New rental request for UI Verify Camera",
        body: "Respond within 48 hours.",
        entityType: "booking-request",
        entityId: "y",
      },
    ],
  });

  const ownerCookie = await sessionCookie(owner);
  const renterCookie = await sessionCookie(renter);

  console.log("\n=== renter dashboard (/dashboard/bookings) ===");

  const bookings = await fetchPage("/dashboard/bookings", renterCookie);
  check("renders 200", bookings.status === 200, bookings.status);
  check(
    "not redirected to login",
    !bookings.html.includes("Sign in to SamaanShare"),
    bookings.html.slice(0, 200)
  );

  for (const [label, needle] of [
    ["cancel affordance on a pending request", "Cancel request"],
    ["payment choice after approval", "Pay by cash"],
    ["bank transfer option", "Pay by bank transfer"],
    ["payment instructions panel", "Paying by cash"],
    ["awaiting-payment badge", "Awaiting payment"],
    ["active rental copy", "Return it to the owner by"],
    ["deposit window copy", "deposit within"],
    ["overdue deposit warning", "overdue"],
    ["no escrow claim", "does not hold it"],
    // Stage A: the renter is told when the owner has left them no way to make contact.
    ["missing-instructions warning", "has not added collection details"],
  ] as const) {
    check(label, bookings.html.includes(needle));
  }

  check(
    "never claims the platform holds the deposit",
    !/samaanshare (holds|is holding)/i.test(bookings.html) ||
      /samaanshare does not hold/i.test(bookings.html)
  );

  console.log("\n=== owner dashboard (/dashboard/requests) ===");

  const requests = await fetchPage("/dashboard/requests", ownerCookie);
  check("renders 200", requests.status === 200, requests.status);

  for (const [label, needle] of [
    ["approve button", "Approve"],
    ["decline button", "Decline"],
    ["confirm payment button", "Confirm payment received"],
    ["mark collected button", "Mark item as collected"],
    ["mark returned button", "Mark item as returned"],
    ["deposit return button", "I have returned the deposit"],
    ["waiting-on-renter note", "Waiting for the renter"],
    // Stage A: the owner's only channel to the renter.
    ["pickup details affordance", "pickup details"],
    ["warns when the renter cannot reach the owner", "no way to reach you"],
  ] as const) {
    check(label, requests.html.includes(needle));
  }

  console.log("\n=== notification feed (/dashboard/notifications) ===");

  const feed = await fetchPage("/dashboard/notifications", renterCookie);
  check("renders 200", feed.status === 200, feed.status);
  check(
    "shows the seeded notification",
    feed.html.includes("was approved"),
    feed.html.slice(0, 300)
  );
  check("offers mark all read", feed.html.includes("Mark all read"));
  check("shows unread count in the header copy", /unread of/.test(feed.html));

  console.log("\n=== unauthenticated access still redirects ===");

  const anon = await fetch(`${BASE}/dashboard/bookings`, {
    redirect: "manual",
  });
  check(
    "redirects without a session",
    anon.status === 307 || anon.status === 302,
    anon.status
  );

  console.log("\n=== cleanup ===");

  const paymentIds = (
    await prisma.booking.findMany({
      where: { listingId: listing.id },
      select: { paymentId: true },
    })
  )
    .map((b) => b.paymentId)
    .filter((id): id is string => id !== null);

  await prisma.notification.deleteMany({
    where: { userId: { in: [owner.id, renter.id] } },
  });
  await prisma.unavailableDate.deleteMany({ where: { listingId: listing.id } });
  await prisma.booking.deleteMany({ where: { listingId: listing.id } });
  await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
  await prisma.listing.deleteMany({ where: { id: listing.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [owner.id, renter.id] } },
  });

  console.log("  removed test rows");
  console.log(
    failures === 0
      ? "\nALL UI CHECKS PASSED\n"
      : `\n${failures} UI CHECK(S) FAILED\n`
  );

  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
