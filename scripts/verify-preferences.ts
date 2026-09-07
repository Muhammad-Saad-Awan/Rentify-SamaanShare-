// ============================================================================
// SamaanShare - Member preference verification
// ============================================================================
// The unit tests prove the muting RULES. This proves the WIRING, which is the part that
// can be wrong while every rule is right:
//
//   - `createNotifications` reads preferences through a widened `NotificationWriter`, and
//     a `select` that does not match the columns fails at runtime, not at compile time.
//   - The filter has to run against real rows: a member who muted reminders and one who
//     did not are notified by the same event, and only one row may be written.
//   - Nothing must be able to mute a transactional notification, whatever is in the
//     database. That is the guarantee the booking flow leans on.
//   - The browse redirect has to fire on a bare `/listings` and nowhere else, including
//     not on `?city=all` - which is the only way back out of a default city.
//
// Creates its own throwaway rows and deletes them.
// The redirect checks need the dev server; set VERIFY_BASE_URL if it is not on :3000.
//
//   npm run verify:preferences
// ============================================================================

import { encode } from "@auth/core/jwt";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { NotificationType } from "../src/generated/prisma/enums";
import { createNotifications } from "../src/lib/notifications/create";

import type { NotificationDraft } from "../src/lib/notifications/messages";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";
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

function draft(userId: string, type: NotificationType): NotificationDraft {
  return {
    userId,
    type,
    title: `${type} for ${userId}`,
    body: null,
    entityType: "booking",
    entityId: "verify-preferences",
  };
}

async function typesWrittenFor(userId: string): Promise<NotificationType[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    select: { type: true },
  });

  return rows.map((row) => row.type).sort();
}

async function main() {
  const stamp = Date.now();

  // One member who has switched the advisory notifications off, one who has not. The same
  // event notifies both, which is the case a per-event filter would get wrong.
  const muted = await prisma.user.create({
    data: {
      email: `pref-muted-${stamp}@example.test`,
      name: "Muted Member",
      notifyReviewReminders: false,
      notifyReviewPublished: false,
      defaultCity: "lahore",
    },
    select: { id: true, email: true, name: true },
  });

  const unmuted = await prisma.user.create({
    data: {
      email: `pref-unmuted-${stamp}@example.test`,
      name: "Unmuted Member",
    },
    select: { id: true, email: true, name: true },
  });

  try {
    console.log("\n=== an advisory notification respects the switch ===");

    const written = await createNotifications(prisma, [
      draft(muted.id, NotificationType.REVIEW_REMINDER),
      draft(unmuted.id, NotificationType.REVIEW_REMINDER),
    ]);

    check("only the member who wants it is written to", written === 1, {
      written,
    });
    check(
      "the muted member has no reminder",
      (await typesWrittenFor(muted.id)).length === 0
    );
    check(
      "the other member does",
      (await typesWrittenFor(unmuted.id)).includes(
        NotificationType.REVIEW_REMINDER
      )
    );

    console.log("\n=== a transactional notification ignores every switch ===");

    // THE ONE THAT MATTERS. This member has muted everything they are allowed to mute;
    // a booking approval must still reach them, because the row is their only record of it.
    await createNotifications(prisma, [
      draft(muted.id, NotificationType.BOOKING_APPROVED),
      draft(muted.id, NotificationType.CLAIM_FILED),
      draft(muted.id, NotificationType.PAYMENT_CONFIRMED),
    ]);

    const mutedTypes = await typesWrittenFor(muted.id);

    check(
      "an approval, a claim and a payment all still arrive",
      mutedTypes.length === 3 &&
        mutedTypes.includes(NotificationType.BOOKING_APPROVED) &&
        mutedTypes.includes(NotificationType.CLAIM_FILED) &&
        mutedTypes.includes(NotificationType.PAYMENT_CONFIRMED),
      mutedTypes
    );

    console.log("\n=== the two switches are independent ===");

    await prisma.user.update({
      where: { id: muted.id },
      data: { notifyReviewReminders: true },
    });

    await prisma.notification.deleteMany({ where: { userId: muted.id } });

    await createNotifications(prisma, [
      draft(muted.id, NotificationType.REVIEW_REMINDER),
      draft(muted.id, NotificationType.REVIEW_RECEIVED),
    ]);

    check(
      "turning reminders back on does not also unmute review notices",
      (await typesWrittenFor(muted.id)).join() ===
        NotificationType.REVIEW_REMINDER,
      await typesWrittenFor(muted.id)
    );

    console.log("\n=== a default city redirects browse, once ===");

    const token = await encode({
      token: {
        sub: muted.id,
        email: muted.email,
        name: muted.name,
        role: "USER",
        status: "ACTIVE",
        tokenVersion: 0,
      },
      secret: process.env.AUTH_SECRET!,
      salt: COOKIE,
    });

    const cookie = `${COOKIE}=${token}`;

    async function locationOf(path: string, withCookie: boolean) {
      const response = await fetch(`${BASE}${path}`, {
        headers: withCookie ? { cookie } : {},
        redirect: "manual",
      });

      return response.headers.get("location") ?? "";
    }

    check(
      "a bare /listings goes to the member's city",
      (await locationOf("/listings", true)).includes("city=lahore")
    );
    check(
      "an anonymous visitor is left alone, so /listings stays indexable",
      (await locationOf("/listings", false)) === ""
    );
    check(
      "?city=all is NOT redirected - it is the way out of the default",
      (await locationOf("/listings?city=all", true)) === ""
    );
    check(
      "an unrelated parameter is left alone rather than discarded",
      (await locationOf("/listings?page=2", true)) === ""
    );

    console.log("\n=== no default city means no redirect ===");

    await prisma.user.update({
      where: { id: muted.id },
      data: { defaultCity: null },
    });

    check(
      "clearing the preference stops the redirect",
      (await locationOf("/listings", true)) === ""
    );
  } finally {
    // Notifications cascade from the user.
    await prisma.user.deleteMany({
      where: { id: { in: [muted.id, unmuted.id] } },
    });

    await prisma.$disconnect();
  }

  console.log(
    failures === 0
      ? "\nAll preference checks passed."
      : `\n${failures} check(s) FAILED.`
  );

  process.exitCode = failures === 0 ? 0 : 1;
}

// No top-level await: the package is CommonJS under tsx.
main().catch((error: unknown) => {
  console.error("Verification failed:", error);
  process.exitCode = 1;
});
