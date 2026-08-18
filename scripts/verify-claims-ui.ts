// The damage claim flow, end to end, through the real HTTP surface.
//
// WHAT THIS DOES THAT verify-claims.ts DOES NOT. That script exercises the rules and the database
// directly. This one drives the actual Server Actions over HTTP with real Auth.js session cookies,
// then fetches the rendered dashboards and asserts on the HTML each party is actually served. So it
// covers the layers a database script cannot: session authentication, the authorization inside each
// action, the Server Action request pipeline, and what the three parties see on screen.
//
// HOW IT CALLS A SERVER ACTION. Next addresses actions by a build-time id sent in a `Next-Action`
// header. The ids below are extracted from the built client chunks by `readActionIds()` rather than
// hardcoded, because they change on every build - a pinned id would turn a broken action into a
// passing test the day someone edited an unrelated file.
//
// Requires a PRODUCTION build and server - `npm run build && npm run start`. The ids come from
// `.next/static`, so a dev server built by turbopack would not answer to them.

import { encode } from "@auth/core/jwt";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  BookingStatus,
  ClaimStatus,
  HandoverCondition,
  HandoverType,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from "../src/generated/prisma/enums";
import { CLAIM_RESPONSE_DAYS } from "../src/lib/claims/rules";
import { formatPKR } from "../src/lib/utils/currency";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const BASE = "http://localhost:3000";
const COOKIE = "authjs.session-token";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEPOSIT = 60_000;

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
 * Strips the HTML comments React inserts around interpolated values.
 *
 * Without this, "Rs. 45,000" rendered from a variable arrives as `Rs.<!-- -->&nbsp;45,000` and every
 * contiguous-string assertion fails for a page that is in fact correct. Learned in Phase 5, where an
 * assertion failed for exactly this reason and the page was fine.
 */
function readable(html: string): string {
  return html
    .replace(/<!--.*?-->/g, "")
    .replace(/&nbsp;|&#x27;|&#39;/g, (m) => (m === "&nbsp;" ? " " : "'"))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

/** A session cookie Auth.js will accept, for a user that really exists. */
async function sessionCookie(user: {
  id: string;
  email: string;
  name: string | null;
  role?: "USER" | "ADMIN";
}) {
  const token = await encode({
    token: {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role ?? "USER",
      status: "ACTIVE",
    },
    secret: process.env.AUTH_SECRET!,
    salt: COOKIE,
  });

  return `${COOKIE}=${token}`;
}

/**
 * Server Action ids, read out of the built client bundles.
 *
 * Next embeds `createServerReference("<id>", ..., "<exportName>")` in the chunk for whichever client
 * component imports the action, so the id and the name sit next to each other in the minified text.
 */
function readActionIds(names: readonly string[]): Map<string, string> {
  const found = new Map<string, string>();
  const root = ".next/static/chunks";

  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);

      return statSync(full).isDirectory()
        ? walk(full)
        : full.endsWith(".js")
          ? [full]
          : [];
    });

  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");

    for (const name of names) {
      if (found.has(name) || !text.includes(name)) {
        continue;
      }

      const match = new RegExp(`"([0-9a-f]{40,45})"[^"]{0,80}?"${name}"`).exec(
        text
      );

      if (match?.[1]) {
        found.set(name, match[1]);
      }
    }
  }

  return found;
}

const ACTION_NAMES = [
  "fileDamageClaim",
  "respondToDamageClaim",
  "resolveDamageClaim",
] as const;

let actionIds = new Map<string, string>();

/**
 * Invokes a Server Action exactly as the browser does.
 *
 * `Origin` is sent because Next refuses a Server Action whose origin does not match its host - that
 * is the framework's CSRF protection, and omitting it would make every call here fail in a way that
 * looked like an application bug.
 */
async function callAction(
  name: (typeof ACTION_NAMES)[number],
  path: string,
  cookie: string,
  args: unknown[]
): Promise<{ status: number; body: string }> {
  const id = actionIds.get(name);

  if (!id) {
    throw new Error(`No action id found for ${name}`);
  }

  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      cookie,
      "Next-Action": id,
      "Content-Type": "text/plain;charset=UTF-8",
      Origin: BASE,
    },
    body: JSON.stringify(args),
    redirect: "manual",
  });

  return { status: response.status, body: await response.text() };
}

async function fetchPage(path: string, cookie: string) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { cookie },
    redirect: "manual",
  });

  return { status: response.status, html: readable(await response.text()) };
}

async function main() {
  actionIds = readActionIds(ACTION_NAMES);

  for (const name of ACTION_NAMES) {
    check(`found the Server Action id for ${name}`, actionIds.has(name));
  }

  if (failures > 0) {
    console.log("\nCannot continue without action ids. Run `npm run build`.\n");
    process.exitCode = 1;

    return;
  }

  const stamp = Date.now();
  const sub = await prisma.subcategory.findFirstOrThrow({
    select: { id: true, categoryId: true },
  });

  const owner = await prisma.user.create({
    data: { email: `cui-owner-${stamp}@example.test`, name: "CUI Owner" },
    select: { id: true, email: true, name: true },
  });
  const renter = await prisma.user.create({
    data: { email: `cui-renter-${stamp}@example.test`, name: "CUI Renter" },
    select: { id: true, email: true, name: true },
  });
  const admin = await prisma.user.create({
    data: {
      email: `cui-admin-${stamp}@example.test`,
      name: "CUI Admin",
      role: "ADMIN",
    },
    select: { id: true, email: true, name: true },
  });

  const ownerCookie = await sessionCookie(owner);
  const renterCookie = await sessionCookie(renter);
  const adminCookie = await sessionCookie({ ...admin, role: "ADMIN" });

  const listing = await prisma.listing.create({
    data: {
      ownerId: owner.id,
      categoryId: sub.categoryId,
      subcategoryId: sub.id,
      title: `CUI Verify Generator ${stamp}`,
      description: "Throwaway listing for claim UI verification.",
      condition: "GOOD",
      pricePerDay: 3000,
      securityDeposit: DEPOSIT,
      city: "karachi",
      area: "CUI",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  let day = 1;

  /** A finished rental with a confirmed payment and a return condition record. */
  async function finishedBooking(condition: HandoverCondition) {
    const date = new Date(
      `2029-04-${String(day++).padStart(2, "0")}T00:00:00.000Z`
    );

    const payment = await prisma.payment.create({
      data: {
        provider: PaymentProvider.OFFLINE,
        method: PaymentMethod.CASH,
        status: PaymentStatus.COMPLETED,
        amount: 9000,
        securityDeposit: DEPOSIT,
        confirmedAt: new Date(),
        confirmedById: owner.id,
      },
      select: { id: true },
    });

    const booking = await prisma.booking.create({
      data: {
        listingId: listing.id,
        renterId: renter.id,
        ownerId: owner.id,
        paymentId: payment.id,
        startDate: date,
        endDate: date,
        totalPrice: 9000,
        securityDeposit: DEPOSIT,
        status: BookingStatus.COMPLETED,
        startedAt: new Date(Date.now() - 2 * DAY_MS),
        completedAt: new Date(Date.now() - DAY_MS),
      },
      select: { id: true },
    });

    await prisma.handoverRecord.create({
      data: {
        bookingId: booking.id,
        type: HandoverType.RETURN,
        recordedById: owner.id,
        condition,
        notes:
          condition === HandoverCondition.AS_EXPECTED
            ? "Looked fine at the door."
            : "Casing cracked, pull cord frayed.",
      },
    });

    return booking;
  }

  // Three rentals, one per path through the flow.
  const accepted = await finishedBooking(HandoverCondition.DAMAGED);
  const disputed = await finishedBooking(HandoverCondition.DAMAGED);
  // Graded as fine at the door, then claimed against - the contradiction case.
  const ignored = await finishedBooking(HandoverCondition.AS_EXPECTED);

  const bookingIds = [accepted.id, disputed.id, ignored.id];

  // ------------------------------------------------ 1. the owner files three claims
  console.log("\n=== the owner files a claim, through the real action ===");

  for (const [booking, amount, note] of [
    [
      accepted,
      15_000,
      "Casing cracked and the pull cord is frayed beyond use.",
    ],
    [
      disputed,
      20_000,
      "Returned with a cracked casing that was not there before.",
    ],
    [ignored, 9_000, "Found a fault once I ran it the following morning."],
  ] as const) {
    const result = await callAction(
      "fileDamageClaim",
      "/dashboard/requests",
      ownerCookie,
      [
        {
          bookingId: booking.id,
          reason: "DAMAGED",
          description: note,
          amountClaimed: amount,
        },
      ]
    );

    check(
      `filing ${formatPKR(amount)} returned 200`,
      result.status === 200,
      result.status
    );
  }

  const filed = await prisma.damageClaim.findMany({
    where: { bookingId: { in: bookingIds } },
    select: { id: true, bookingId: true, status: true, amountClaimed: true },
  });

  check("three claims exist", filed.length === 3, filed.length);
  check(
    "all three start OPEN",
    filed.every((c) => c.status === ClaimStatus.OPEN)
  );

  /** A renter cannot file against their own rental - the action derives the claimant. */
  const asRenter = await callAction(
    "fileDamageClaim",
    "/dashboard/bookings",
    renterCookie,
    [
      {
        bookingId: accepted.id,
        reason: "DAMAGED",
        description: "Trying to file a claim on a rental I did not own.",
        amountClaimed: 1_000,
      },
    ]
  );

  check(
    "a renter filing against their own booking is refused",
    asRenter.body.includes("not found") || asRenter.body.includes("already"),
    asRenter.body.slice(0, 200)
  );

  // -------------------------------------- 2. what each party is served on screen
  console.log("\n=== both dashboards render the claim ===");

  const renterView = await fetchPage("/dashboard/bookings", renterCookie);
  const ownerView = await fetchPage("/dashboard/requests", ownerCookie);

  check(
    "the renter's dashboard renders",
    renterView.status === 200,
    renterView.status
  );
  check(
    "the owner's dashboard renders",
    ownerView.status === 200,
    ownerView.status
  );

  check(
    "the renter is shown the claim against them",
    renterView.html.includes("Claim on your deposit"),
    renterView.html.slice(0, 0)
  );
  check(
    "the owner sees it as their own claim",
    ownerView.html.includes("Your claim")
  );
  check(
    "the amount claimed is stated",
    renterView.html.includes(formatPKR(15_000))
  );

  /** The controls, and only for the party entitled to them. */
  check(
    "the renter is offered accept or dispute",
    renterView.html.includes("Accept or dispute")
  );
  check(
    "the owner is not offered the renter's controls",
    !ownerView.html.includes("Accept or dispute")
  );
  check(
    "the owner can withdraw their own claim",
    ownerView.html.includes("Withdraw my claim")
  );

  /** THE ASSERTION THAT AN UNSETTLED CLAIM DECIDES NOTHING. */
  check(
    "the renter is told nothing has been decided yet",
    renterView.html.includes("Nothing has been decided yet")
  );
  check(
    "and that the deposit clock is paused",
    renterView.html.includes("return clock is paused")
  );

  // --------------------------------------------- 3. the renter accepts one claim
  console.log("\n=== the renter accepts, and the owed amount drops ===");

  const acceptedClaim = filed.find((c) => c.bookingId === accepted.id)!;

  const acceptResult = await callAction(
    "respondToDamageClaim",
    "/dashboard/bookings",
    renterCookie,
    [{ claimId: acceptedClaim.id, accepted: true }]
  );

  check(
    "accepting returned 200",
    acceptResult.status === 200,
    acceptResult.status
  );

  const afterAccept = await prisma.damageClaim.findUniqueOrThrow({
    where: { id: acceptedClaim.id },
    select: { status: true, amountUpheld: true },
  });

  check(
    "the claim is ACCEPTED and settled at the amount claimed",
    afterAccept.status === ClaimStatus.ACCEPTED &&
      afterAccept.amountUpheld === 15_000,
    afterAccept
  );

  /**
   * THE ONE THE WHOLE DESIGN TURNS ON. 60,000 deposit, 15,000 accepted, so the platform must now
   * state 45,000 as owed - on both dashboards, in the rendered HTML.
   */
  const renterAfter = await fetchPage("/dashboard/bookings", renterCookie);
  const ownerAfter = await fetchPage("/dashboard/requests", ownerCookie);

  check(
    `the renter is told ${formatPKR(45_000)} is owed back`,
    renterAfter.html.includes(formatPKR(45_000)),
    "expected the reduced figure in the renter's page"
  );
  check(
    `the owner is told to return ${formatPKR(45_000)}`,
    ownerAfter.html.includes(formatPKR(45_000)),
    "expected the reduced figure in the owner's page"
  );
  check(
    "both are told the claim was agreed",
    renterAfter.html.includes("Agreed by both parties") &&
      ownerAfter.html.includes("Agreed by both parties")
  );

  /** Answered once: a second answer must not move it. */
  const secondAnswer = await callAction(
    "respondToDamageClaim",
    "/dashboard/bookings",
    renterCookie,
    [{ claimId: acceptedClaim.id, accepted: false }]
  );

  const unchanged = await prisma.damageClaim.findUniqueOrThrow({
    where: { id: acceptedClaim.id },
    select: { status: true, amountUpheld: true },
  });

  check(
    "a second answer does not change the outcome",
    unchanged.status === ClaimStatus.ACCEPTED &&
      unchanged.amountUpheld === 15_000,
    { unchanged, body: secondAnswer.body.slice(0, 120) }
  );

  // ------------------------------------------------ 4. the renter disputes another
  console.log("\n=== the renter disputes, and it reaches the admin queue ===");

  const disputedClaim = filed.find((c) => c.bookingId === disputed.id)!;

  const disputeResult = await callAction(
    "respondToDamageClaim",
    "/dashboard/bookings",
    renterCookie,
    [
      {
        claimId: disputedClaim.id,
        accepted: false,
        note: "That crack was already there when I collected it.",
      },
    ]
  );

  check(
    "disputing returned 200",
    disputeResult.status === 200,
    disputeResult.status
  );

  const afterDispute = await prisma.damageClaim.findUniqueOrThrow({
    where: { id: disputedClaim.id },
    select: { status: true, amountUpheld: true, respondedAt: true },
  });

  check(
    "it is DISPUTED, nothing upheld, and the response is recorded",
    afterDispute.status === ClaimStatus.DISPUTED &&
      afterDispute.amountUpheld === null &&
      afterDispute.respondedAt !== null,
    afterDispute
  );

  // -------------------------------------- 5. an unanswered claim escalates on its own
  console.log("\n=== an unanswered claim escalates to a human ===");

  const ignoredClaim = filed.find((c) => c.bookingId === ignored.id)!;

  // Age it past the response window, then let a page read trigger the lazy sweep.
  await prisma.damageClaim.update({
    where: { id: ignoredClaim.id },
    data: {
      filedAt: new Date(Date.now() - (CLAIM_RESPONSE_DAYS + 1) * DAY_MS),
    },
  });

  await fetchPage("/dashboard/bookings", renterCookie);

  const afterSweep = await prisma.damageClaim.findUniqueOrThrow({
    where: { id: ignoredClaim.id },
    select: { status: true, respondedAt: true, amountUpheld: true },
  });

  check(
    "a page view escalated it without a cron",
    afterSweep.status === ClaimStatus.DISPUTED,
    afterSweep
  );

  /** Silence is not acceptance, and stays distinguishable from a dispute. */
  check(
    "nothing was upheld and no response was recorded",
    afterSweep.amountUpheld === null && afterSweep.respondedAt === null,
    afterSweep
  );

  // --------------------------------------------------- 6. the admin queue
  console.log("\n=== the admin queue shows both disputes and the evidence ===");

  const queue = await fetchPage("/admin/claims", adminCookie);

  check("the queue renders for an admin", queue.status === 200, queue.status);
  check(
    "the disputed claim is listed",
    queue.html.includes(formatPKR(20_000)),
    "expected the disputed amount"
  );
  check(
    "the escalated claim is listed",
    queue.html.includes(formatPKR(9_000)),
    "expected the escalated amount"
  );
  check(
    "the renter's account is shown to the admin",
    queue.html.includes("already there when I collected it")
  );
  check(
    "an escalated claim is labelled as unanswered rather than disputed",
    queue.html.includes("No reply from the renter")
  );

  /**
   * THE CONTRADICTION. The owner graded this item "As expected" at the door and is now claiming
   * damage on it - the queue has to say so before anything else.
   */
  check(
    "the admin is shown the owner contradicting their own return record",
    queue.html.includes("recorded this item as") &&
      queue.html.includes("As expected") &&
      queue.html.includes("is now claiming damage"),
    "expected the contradiction warning"
  );

  /** And a non-admin must not reach it at all. */
  const renterAtQueue = await fetchPage("/admin/claims", renterCookie);

  check(
    "a renter is bounced away from the admin queue",
    renterAtQueue.status === 307 || renterAtQueue.status === 302,
    renterAtQueue.status
  );

  // --------------------------------------------- 7. the admin decides
  console.log("\n=== the admin decides, and the owed amount follows ===");

  const overAward = await callAction(
    "resolveDamageClaim",
    "/admin/claims",
    adminCookie,
    [
      {
        claimId: disputedClaim.id,
        // More than was claimed - nobody put this figure to the administrator.
        amountUpheld: 25_000,
        resolution: "Attempting to award more than the claim asked for.",
      },
    ]
  );

  const notOverAwarded = await prisma.damageClaim.findUniqueOrThrow({
    where: { id: disputedClaim.id },
    select: { status: true },
  });

  check(
    "an award beyond the amount claimed is refused",
    notOverAwarded.status === ClaimStatus.DISPUTED,
    { status: notOverAwarded.status, body: overAward.body.slice(0, 160) }
  );

  const decided = await callAction(
    "resolveDamageClaim",
    "/admin/claims",
    adminCookie,
    [
      {
        claimId: disputedClaim.id,
        amountUpheld: 8_000,
        resolution:
          "The return record and the photographs support partial damage only.",
      },
    ]
  );

  check("the decision returned 200", decided.status === 200, decided.status);

  const resolved = await prisma.damageClaim.findUniqueOrThrow({
    where: { id: disputedClaim.id },
    select: { status: true, amountUpheld: true, resolvedById: true },
  });

  check(
    "the claim is RESOLVED at the admin's figure, attributed to them",
    resolved.status === ClaimStatus.RESOLVED &&
      resolved.amountUpheld === 8_000 &&
      resolved.resolvedById === admin.id,
    resolved
  );

  /** 60,000 deposit, 8,000 upheld, so 52,000 is what the platform now states is owed. */
  const renterFinal = await fetchPage("/dashboard/bookings", renterCookie);
  const ownerFinal = await fetchPage("/dashboard/requests", ownerCookie);

  check(
    `the renter is told ${formatPKR(52_000)} is owed back`,
    renterFinal.html.includes(formatPKR(52_000))
  );
  check(
    `the owner is told to return ${formatPKR(52_000)}`,
    ownerFinal.html.includes(formatPKR(52_000))
  );
  check(
    "both are shown the reasoning",
    renterFinal.html.includes("support partial damage only") &&
      ownerFinal.html.includes("support partial damage only")
  );

  /** A non-admin must not be able to decide a claim by calling the action directly. */
  const renterDecides = await callAction(
    "resolveDamageClaim",
    "/admin/claims",
    renterCookie,
    [
      {
        claimId: ignoredClaim.id,
        amountUpheld: 9_000,
        resolution: "A renter trying to resolve a claim against themselves.",
      },
    ]
  );

  const stillOpen = await prisma.damageClaim.findUniqueOrThrow({
    where: { id: ignoredClaim.id },
    select: { status: true },
  });

  check(
    "a non-admin cannot decide a claim",
    stillOpen.status === ClaimStatus.DISPUTED,
    { status: stillOpen.status, body: renterDecides.body.slice(0, 160) }
  );

  // ---------------------------------------------------------------- cleanup
  console.log("\n=== cleanup ===");

  const paymentIds = (
    await prisma.booking.findMany({
      where: { id: { in: bookingIds } },
      select: { paymentId: true },
    })
  )
    .map((b) => b.paymentId)
    .filter((id): id is string => id !== null);

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
    where: { userId: { in: [owner.id, renter.id, admin.id] } },
  });
  await prisma.unavailableDate.deleteMany({ where: { listingId: listing.id } });
  await prisma.booking.deleteMany({ where: { listingId: listing.id } });
  await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
  await prisma.listing.deleteMany({ where: { id: listing.id } });
  await prisma.user.deleteMany({
    where: { id: { in: [owner.id, renter.id, admin.id] } },
  });

  console.log("  removed test rows");
  console.log(
    failures === 0
      ? "\nALL DAMAGE CLAIM UI CHECKS PASSED\n"
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
