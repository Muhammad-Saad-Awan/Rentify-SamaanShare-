import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";
import {
  ADMIN_PREFIXES,
  AUTH_ROUTES,
  CALLBACK_URL_PARAM,
  DEFAULT_LOGIN_REDIRECT,
  LOGIN_ROUTE,
  PROTECTED_PREFIXES,
  matchesPrefix,
} from "@/config/routes";
import { UserRole } from "@/generated/prisma/enums";

/**
 * Edge middleware: session-aware routing.
 *
 * A SECOND, SMALLER Auth.js instance is built here from the edge-safe config
 * only. It shares the cookie name and AUTH_SECRET with the instance in
 * `@/auth`, so it decrypts exactly the same token - it simply has no adapter
 * and therefore no database dependency.
 *
 * This is a redirect convenience, NOT the authorization boundary. Middleware
 * can be bypassed (direct RSC payload fetches, rewrites), so every Server
 * Action and protected page re-checks `await auth()` itself.
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const { pathname } = nextUrl;

  // `req.auth` is the decrypted session, populated by the wrapper above.
  const session = req.auth;
  const isLoggedIn = Boolean(session?.user);

  const isAuthRoute = matchesPrefix(pathname, AUTH_ROUTES);
  const isProtectedRoute = matchesPrefix(pathname, PROTECTED_PREFIXES);
  const isAdminRoute = matchesPrefix(pathname, ADMIN_PREFIXES);

  // Already signed in and visiting /login or /register - nothing to do there.
  if (isAuthRoute) {
    if (isLoggedIn) {
      return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, nextUrl));
    }

    return NextResponse.next();
  }

  if (isProtectedRoute && !isLoggedIn) {
    const loginUrl = new URL(LOGIN_ROUTE, nextUrl);

    // Preserve where they were heading, including the query string, so login
    // can send them back. Relative to avoid an open-redirect via absolute URL.
    loginUrl.searchParams.set(
      CALLBACK_URL_PARAM,
      `${pathname}${nextUrl.search}`
    );

    return NextResponse.redirect(loginUrl);
  }

  // Non-admins get a 404-style bounce rather than a "forbidden" page, so the
  // existence of the admin area is not advertised.
  if (isAdminRoute && session?.user.role !== UserRole.ADMIN) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  return NextResponse.next();
});

/**
 * Which requests run through middleware.
 *
 * Excluded, in order:
 *   - `api/auth/*`  Auth.js's own endpoints. Guarding them would break the
 *                   OAuth callback and the CSRF handshake.
 *   - `_next/*`     build output and the image optimizer.
 *   - static assets by extension, plus the well-known root files.
 *
 * Everything else is matched. Other `/api` routes are matched too, but only so
 * they can read the session; Route Handlers must still call `auth()`.
 */
export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf)$).*)",
  ],
};
