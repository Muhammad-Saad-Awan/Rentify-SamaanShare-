import { handlers } from "@/auth";

/**
 * The single HTTP surface Auth.js needs.
 *
 * The catch-all `[...nextauth]` segment means one file serves every Auth.js
 * endpoint. The ones that exist today:
 *
 *   GET  /api/auth/session    current session as JSON (used by useSession)
 *   GET  /api/auth/csrf       CSRF token, required before any POST
 *   GET  /api/auth/providers  configured providers (empty until Phase 1.2)
 *   GET  /api/auth/callback/* OAuth provider redirects back here
 *   POST /api/auth/signin/*   begins a sign-in
 *   POST /api/auth/signout    clears the session cookie
 *
 * Auth.js routes internally by pathname, so nothing here needs to change when
 * providers are added.
 *
 * Runs on the Node runtime (the default) because `@/auth` carries the Prisma
 * adapter.
 */
export const { GET, POST } = handlers;
