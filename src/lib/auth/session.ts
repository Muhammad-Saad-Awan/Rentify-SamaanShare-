import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DEFAULT_LOGIN_REDIRECT, LOGIN_ROUTE } from "@/config/routes";
import { UserRole, UserStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

import type { Session } from "next-auth";

/**
 * Server-side session helpers.
 *
 * These are the real authorization boundary. `src/middleware.ts` only redirects
 * on navigation and can be bypassed (direct RSC payload requests, rewrites), so
 * every protected page and Server Action must call one of these rather than
 * assume middleware already ran.
 */

type SessionUser = Session["user"];

/** The raw session, or `null`. Never throws or redirects. */
export async function getSession(): Promise<Session | null> {
  return auth();
}

/**
 * The signed-in user, or `null`. Use in layouts and headers that render
 * differently when signed in but are still public.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();

  return session?.user ?? null;
}

/**
 * Requires a signed-in, currently-active user, or redirects.
 *
 * VERIFIES AGAINST THE DATABASE, which is a deliberate reversal of the original
 * design. This used to read `status` from the JWT for cheapness. That does not work:
 * the token is minted at sign-in, so a user banned mid-session still carries
 * `status: "ACTIVE"` until it refreshes - up to `session.updateAge` (24h). Measured
 * during the audit: after suspending an account, its existing cookie still opened
 * `/dashboard`, `/saved`, `/profile` and `/settings` with a 200. The `signIn` callback
 * only refuses *new* sign-ins, so banning someone locked the front door and left
 * everyone already inside untouched.
 *
 * The cost is one primary-key lookup per protected page render. That is the price of a
 * ban taking effect on the next request rather than tomorrow, and it is why middleware
 * still runs the cheap token check first - that turns away already-refreshed tokens at
 * the edge without reaching this far.
 *
 * No `callbackUrl` on the unauthenticated redirect: a Server Component cannot reliably
 * read its own pathname in Next 15. Middleware supplies one for normal navigation, so
 * this is the backstop, not the main path.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();

  if (!session?.user) {
    redirect(LOGIN_ROUTE);
  }

  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { status: true, deletedAt: true },
  });

  if (!current || current.deletedAt || current.status !== UserStatus.ACTIVE) {
    // `?error=` also breaks a redirect loop: middleware refuses to bounce a signed-in
    // visitor away from the login page when the URL carries one. Without it, this
    // stale-but-ACTIVE token would be sent straight back to the dashboard, which would
    // land here again.
    redirect(`${LOGIN_ROUTE}?error=AccountSuspended`);
  }

  return session.user;
}

/**
 * The signed-in user, database-verified as active, or `null`.
 *
 * The non-redirecting counterpart to {@link requireUser}, for Server Actions.
 * A redirect is wrong there: an action invoked from a button should return a result
 * its caller can act on, not navigate the page out from under the user mid-click.
 *
 * Costs one indexed query and in exchange closes the JWT revocation window - a ban
 * takes effect on the next request rather than at the next token refresh. Use it for
 * anything that writes; {@link getCurrentUser} is enough for deciding what to render.
 */
export async function getActiveUser(): Promise<SessionUser | null> {
  const session = await auth();

  if (!session?.user) {
    return null;
  }

  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { status: true, deletedAt: true },
  });

  if (!current || current.deletedAt || current.status !== UserStatus.ACTIVE) {
    return null;
  }

  return session.user;
}

/**
 * The signed-in user, database-verified as an active ADMIN, or `null`.
 *
 * The non-redirecting counterpart to {@link requireAdmin}, and it exists for the same reason
 * {@link getActiveUser} does: a moderation action invoked from a button has to return a result its
 * caller can show, not navigate the page out from under an admin mid-decision. A redirect from a
 * Server Action would also discard whatever they had typed into the resolution note.
 *
 * Re-reads `role` from the database, which is the whole point - the JWT's copy is a snapshot from
 * sign-in, so a demoted admin carries `role: "ADMIN"` in their cookie for up to 24 hours.
 */
export async function getActiveAdmin(): Promise<SessionUser | null> {
  const user = await getActiveUser();

  if (!user) {
    return null;
  }

  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  });

  return current?.role === UserRole.ADMIN ? user : null;
}

/**
 * Requires an active ADMIN, verified against the database.
 *
 * The database re-read is not optional here. `role` in the token is a snapshot
 * from sign-in, so a demoted admin keeps `role: "ADMIN"` in their cookie until
 * it refreshes - and `src/middleware.ts`, which reads only the token, would
 * wave them through. This is the check that actually holds.
 *
 * Redirects to the home page rather than rendering "forbidden", so the admin
 * area's existence is not confirmed to non-admins.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();

  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, status: true, deletedAt: true },
  });

  if (
    !current ||
    current.deletedAt ||
    current.status !== UserStatus.ACTIVE ||
    current.role !== UserRole.ADMIN
  ) {
    redirect(DEFAULT_LOGIN_REDIRECT);
  }

  return user;
}
