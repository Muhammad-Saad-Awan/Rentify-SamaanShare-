/**
 * Route map for authentication and authorization.
 *
 * Single source of truth for src/middleware.ts. Pages themselves land in
 * Phase 1.2 - these constants exist first so the middleware never grows
 * hardcoded path strings scattered across branches.
 */

/**
 * Auth.js mounts its own endpoints under this prefix (signin, callback, csrf,
 * session, providers). Middleware must never guard or redirect them, or the
 * OAuth callback cannot complete.
 */
export const API_AUTH_PREFIX = "/api/auth";

/**
 * Pages that are part of the auth flow itself. A signed-in visitor is bounced
 * away from these to {@link DEFAULT_LOGIN_REDIRECT}.
 *
 * `/reset-password` is deliberately NOT here. A signed-in visitor holding a
 * valid reset link must still be able to redeem it - that is precisely the
 * person whose session was established before they realised their password was
 * compromised, and bouncing them to the dashboard would strand them. Asking for
 * a *new* link while signed in is different, so `/forgot-password` is listed.
 */
export const AUTH_ROUTES = ["/login", "/register", "/forgot-password"] as const;

/**
 * Everything under these prefixes requires a session. Anything not listed
 * here - and not an auth route - is public.
 */
export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/listings/new",
  "/bookings",
  // The wishlist. A top-level prefix rather than `/dashboard/saved`, matching
  // `/profile` and `/settings`, and it must be listed here for middleware to
  // attach a `callbackUrl` - which is what returns a signed-out visitor to the
  // page after they log in.
  "/saved",
  "/profile",
  "/settings",
  "/admin",
  /**
   * Email confirmation. Listed so a signed-out visitor clicking the link is sent
   * to login with a `callbackUrl` that keeps `?token=` intact - middleware
   * preserves the query string - and lands back here afterwards.
   *
   * Deliberately NOT in {@link AUTH_ROUTES}, for the same reason as
   * `/reset-password`: a signed-in visitor holding a valid link has to be able to
   * redeem it, and bouncing them to the dashboard would strand a live token.
   *
   * `verifyEmail` requires the session to belong to the token's owner, so a link
   * forwarded or scraped from a mailbox cannot confirm the address on its own.
   */
  "/verify-email",
] as const;

/**
 * Subset of {@link PROTECTED_PREFIXES} that additionally requires
 * `role === "ADMIN"`. Enforced again in every admin Server Action - middleware
 * is a redirect convenience, not the authorization boundary.
 */
export const ADMIN_PREFIXES = ["/admin"] as const;

/** Where a signed-in user goes after login, or when hitting an auth route. */
export const DEFAULT_LOGIN_REDIRECT = "/dashboard";

/** Sign-in page. Auth.js redirects unauthenticated users here. */
export const LOGIN_ROUTE = "/login";

/** Query parameter carrying the originally requested URL across a login. */
export const CALLBACK_URL_PARAM = "callbackUrl";

/** True when `pathname` sits under any of `prefixes`. */
export function matchesPrefix(
  pathname: string,
  prefixes: readonly string[]
): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Reduces an untrusted `?callbackUrl=` to a safe same-origin path.
 *
 * The value arrives in a query string, so anyone can craft it. Redirecting to
 * it unchecked is an open redirect: `/login?callbackUrl=https://evil.example`
 * would bounce a freshly authenticated user off-site, onto a convincing
 * phishing page.
 *
 * Only a path beginning with a single `/` is accepted. `//evil.example` is
 * rejected too - browsers read a protocol-relative URL as another origin.
 * Anything else falls back to {@link DEFAULT_LOGIN_REDIRECT}.
 */
export function sanitizeCallbackUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_LOGIN_REDIRECT;
  }

  return value;
}
