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
 * Requires any signed-in user, or redirects to the login page.
 *
 * Reads `role` and `status` straight from the JWT - no database query - which is
 * the whole point of the JWT strategy. That means the values can be up to
 * `session.updateAge` (24h) stale. For ordinary browsing that is an acceptable
 * trade; where it is not, use {@link requireActiveUser} or
 * {@link requireAdmin}.
 *
 * No `callbackUrl` is attached: a Server Component cannot reliably read its own
 * pathname in Next 15. Middleware already supplies `callbackUrl` for normal
 * navigation to a protected prefix, so this is the backstop, not the main path.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();

  if (!session?.user) {
    redirect(LOGIN_ROUTE);
  }

  return session.user;
}

/**
 * Requires a signed-in user whose account is *currently* active, verified
 * against the database.
 *
 * Costs one indexed query, and in exchange closes the JWT revocation window:
 * a ban or soft delete takes effect on the next request instead of at the next
 * token refresh. Use this for anything that creates or moves value - bookings,
 * payments, listings - and prefer the cheaper {@link requireUser} for read-only
 * pages.
 */
export async function requireActiveUser(): Promise<SessionUser> {
  const user = await requireUser();

  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { status: true, deletedAt: true },
  });

  if (!current || current.deletedAt || current.status !== UserStatus.ACTIVE) {
    redirect(LOGIN_ROUTE);
  }

  return user;
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
