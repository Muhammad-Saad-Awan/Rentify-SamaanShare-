// ============================================================================
// SamaanShare - Account security verification
// ============================================================================
// Session invalidation cannot be tested with Vitest. The suite covers pure modules, and
// what has to be proved here is the interaction between three things none of which are
// pure: a signed Auth.js cookie, the `tokenVersion` column, and the session helpers that
// compare them on every protected request.
//
// So this mints real cookies - the same `encode` Auth.js itself uses - moves the column
// underneath them, and asserts what the running app does. That is the only way to catch
// the two failure modes that matter and that look identical in code review:
//
//   FAIL OPEN  - a revoked session keeps working, which is the bug this feature exists
//                to fix, silently un-fixed.
//   FAIL SHUT  - every existing cookie is rejected, because tokens minted before the
//                column existed carry no version. That signs out the entire userbase on
//                deploy, and is the worse of the two.
//
// It also renders `/settings` for the two account shapes, because which password form
// appears is decided from `User.password` on the server and a swap would not fail a type
// check.
//
// Creates its own throwaway rows and deletes them, like the other verify scripts.
// Requires the dev server. Defaults to http://localhost:3000; set VERIFY_BASE_URL to
// point at another port.
//
//   npm run verify:security
// ============================================================================

import { encode } from "@auth/core/jwt";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/**
 * Where the dev server is.
 *
 * Overridable because Next picks the next free port when 3000 is taken - which happens
 * the moment a previous `npm run dev` has not fully exited - and a hard-coded 3000 then
 * reports every check as failing against a server that is running perfectly well on 3002.
 *
 *   VERIFY_BASE_URL=http://localhost:3002 npm run verify:security
 */
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

interface CookieUser {
  id: string;
  email: string;
  name: string | null;
}

/**
 * A session cookie Auth.js will accept.
 *
 * `tokenVersion` is passed separately and may be `undefined`, which is the whole point of
 * one of the cases below: a cookie minted before the field existed has no such key, and
 * that is not the same as one carrying `0`.
 */
async function sessionCookie(
  user: CookieUser,
  tokenVersion: number | undefined
) {
  const token = await encode({
    token: {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: "USER",
      status: "ACTIVE",
      // Spread rather than an explicit `undefined`, so the key is genuinely absent from
      // the payload in the legacy case rather than present and null.
      ...(tokenVersion === undefined ? {} : { tokenVersion }),
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

  return {
    status: response.status,
    location: response.headers.get("location") ?? "",
    html: await response.text(),
  };
}

/** A protected page reached with this cookie, reduced to "let in" or "bounced". */
async function reachesProfile(cookie: string) {
  const { status, location, html } = await fetchPage("/profile", cookie);

  // Next answers a Server Component `redirect()` with a 200 carrying an RSC redirect
  // payload as often as with a 307, depending on how the request was made - so the
  // destination is what is asserted, never the status code alone.
  const bounced =
    location.includes("/login") ||
    html.includes("/login?error=SessionRevoked") ||
    html.includes("error=SessionRevoked");

  return { allowed: !bounced && status === 200, status, location };
}

async function main() {
  const stamp = Date.now();

  const member = await prisma.user.create({
    data: {
      email: `sec-member-${stamp}@example.test`,
      name: "Security Member",
      // Not a usable password - nothing here signs in with it. Present so the account
      // reads as a credentials account, which is what selects the change form.
      password: "$2b$12$SB1QRTjLe3HJIcjEnemwHuVKnc.iCIj1lFCO1L5ZGEv5VWcA5yYMC",
    },
    select: { id: true, email: true, name: true },
  });

  const googleOnly = await prisma.user.create({
    data: {
      email: `sec-google-${stamp}@example.test`,
      name: "Google Only",
      password: null,
      accounts: {
        create: {
          type: "oidc",
          provider: "google",
          providerAccountId: `google-${stamp}`,
        },
      },
    },
    select: { id: true, email: true, name: true },
  });

  try {
    console.log("\n=== a current session is let through ===");

    const atZero = await sessionCookie(member, 0);
    check(
      "version 0 against a column at 0 reaches /profile",
      (await reachesProfile(atZero)).allowed
    );

    console.log(
      "\n=== a session minted before the field existed still works ==="
    );

    // THE FAIL-SHUT CASE. Every cookie already in the wild looks like this. If a missing
    // version were read as a mismatch, deploying this feature would sign out every
    // signed-in member at once.
    const legacy = await sessionCookie(member, undefined);
    check(
      "a cookie with no tokenVersion at all reaches /profile",
      (await reachesProfile(legacy)).allowed
    );

    console.log("\n=== revoking the generation locks the old cookie out ===");

    await prisma.user.update({
      where: { id: member.id },
      data: { tokenVersion: { increment: 1 } },
    });

    // THE FAIL-OPEN CASE, and the reason the feature exists: this cookie is the stolen
    // one, and the password change has just happened elsewhere.
    const stale = await reachesProfile(atZero);
    check(
      "the pre-change cookie no longer reaches /profile",
      !stale.allowed,
      stale
    );

    const staleLegacy = await reachesProfile(legacy);
    check(
      "a versionless cookie is also locked out once the column moves",
      !staleLegacy.allowed,
      staleLegacy
    );

    const atOne = await sessionCookie(member, 1);
    check(
      "a cookie minted at the new version reaches /profile",
      (await reachesProfile(atOne)).allowed
    );

    console.log(
      "\n=== a token claiming a version ahead of the column is refused ==="
    );

    // Not a newer session - there is no such thing. A token whose version does not
    // correspond to this account's history is forged or corrupt, and "ahead" is not a
    // reason to trust it.
    const ahead = await reachesProfile(await sessionCookie(member, 99));
    check("version 99 against a column at 1 is refused", !ahead.allowed, ahead);

    console.log("\n=== the bounce explains itself ===");

    const bounced = await fetchPage("/profile", atZero);
    check(
      "a revoked session is sent to SessionRevoked, not AccountSuspended",
      (bounced.location + bounced.html).includes("SessionRevoked") &&
        !(bounced.location + bounced.html).includes("AccountSuspended"),
      { location: bounced.location }
    );

    const loginPage = await fetch(`${BASE}/login?error=SessionRevoked`);
    const loginHtml = await loginPage.text();
    check(
      "the login page renders copy for the SessionRevoked code",
      loginHtml.includes("password was changed"),
      { status: loginPage.status }
    );

    console.log(
      "\n=== /settings offers the right form for each account shape ==="
    );

    const withPassword = await fetchPage("/settings", atOne);
    check(
      "an account with a password is offered the change form",
      withPassword.html.includes("Change your password") &&
        !withPassword.html.includes("Set a password"),
      { status: withPassword.status }
    );
    check(
      "and is told the change signs other devices out",
      withPassword.html.includes("signs out every other device")
    );

    const googleCookie = await sessionCookie(googleOnly, 0);
    const withoutPassword = await fetchPage("/settings", googleCookie);
    check(
      "a Google-only account is offered the set form instead",
      withoutPassword.html.includes("Set a password") &&
        !withoutPassword.html.includes("Current password"),
      { status: withoutPassword.status }
    );
    check(
      "and is told why Google cannot be disconnected yet",
      withoutPassword.html.includes("only way you can sign in")
    );
    check(
      "and sees Google listed as connected",
      withoutPassword.html.includes("Connected")
    );

    console.log("\n=== an unauthenticated visitor is still redirected ===");

    const anonymous = await fetchPage("/settings", "");
    check(
      "no cookie does not reach /settings",
      anonymous.status !== 200 || anonymous.html.includes("/login"),
      anonymous
    );
  } finally {
    // Cascades clear the Account row.
    await prisma.user.deleteMany({
      where: { id: { in: [member.id, googleOnly.id] } },
    });

    await prisma.$disconnect();
  }

  console.log(
    failures === 0
      ? "\nAll security checks passed."
      : `\n${failures} check(s) FAILED.`
  );

  process.exitCode = failures === 0 ? 0 : 1;
}

// No top-level await: the package is CommonJS under tsx.
main().catch((error: unknown) => {
  console.error("Verification failed:", error);
  process.exitCode = 1;
});
