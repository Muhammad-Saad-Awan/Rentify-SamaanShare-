import type { NextAuthConfig } from "next-auth";

import { LOGIN_ROUTE } from "@/config/routes";
import { UserRole, UserStatus } from "@/generated/prisma/enums";

/**
 * Edge-safe Auth.js configuration.
 *
 * WHY THIS FILE IS SEPARATE FROM auth.ts
 * --------------------------------------
 * `src/middleware.ts` runs in the Edge runtime, which has no TCP sockets and
 * therefore cannot run Prisma. If middleware imported the full config it would
 * pull in the Prisma adapter -> `pg` -> `net`, and the build would fail.
 *
 * So the config is split:
 *   - this file  -> everything that is pure JavaScript. Imported by middleware.
 *   - `auth.ts`  -> spreads this file and adds the Prisma adapter. Imported by
 *                   Server Components, Server Actions and the route handler,
 *                   all of which run in Node.
 *
 * Rule for anything added here: no database access, no Node built-ins, no
 * `bcrypt`. Those belong in auth.ts.
 */
export const authConfig = {
  /**
   * Deliberately empty for Phase 1.1. This file establishes the plumbing only;
   * Credentials and Google land in Phase 1.2. With no providers, Auth.js still
   * mounts its endpoints and issues no sessions - which is the intended state.
   */
  providers: [],

  session: {
    /**
     * JWT rather than "database", even though an adapter is configured.
     *
     * 1. The adapter's presence would otherwise default this to "database",
     *    which requires a Prisma query on every request to read the session -
     *    impossible in Edge middleware.
     * 2. The Credentials provider (Phase 1.2) only works with JWT sessions.
     * 3. Session reads become a local cookie decrypt: no DB round trip.
     *
     * The trade-off: a JWT cannot be revoked server-side before it expires.
     * A ban therefore takes effect on the next token refresh, not instantly.
     * Anything that must be enforced immediately re-checks the database inside
     * the Server Action rather than trusting the token.
     */
    strategy: "jwt",

    /** Cookie/token lifetime - 30 days of inactivity before re-login. */
    maxAge: 30 * 24 * 60 * 60,

    /**
     * Re-issue the token at most once a day. Bounds how stale `role`/`status`
     * inside the token can be, without re-signing on every single request.
     */
    updateAge: 24 * 60 * 60,
  },

  pages: {
    /**
     * Unauthenticated visitors are sent here instead of Auth.js's built-in
     * page. The route is created in Phase 1.2; until then this is just a
     * declaration.
     */
    signIn: LOGIN_ROUTE,

    /** OAuth/callback failures land on the login page as `?error=...`. */
    error: LOGIN_ROUTE,
  },

  callbacks: {
    /**
     * Runs whenever a token is minted or refreshed. `user` is only present on
     * sign-in and sign-up; on every later call we already have a full token and
     * must leave it alone.
     *
     * This is where our own columns are copied into the token so that
     * middleware and Server Components can read them without a query.
     */
    jwt({ token, user }) {
      if (user) {
        // `user` comes from the adapter, so these are the real DB values. The
        // fallbacks only matter if a future provider returns a bare profile.
        // `token.sub` is left as-is when `user.id` is absent: assigning
        // `undefined` is an error under exactOptionalPropertyTypes, and Auth.js
        // has already populated it.
        if (user.id) {
          token.sub = user.id;
        }

        token.role = user.role ?? UserRole.USER;
        token.status = user.status ?? UserStatus.ACTIVE;
      }

      return token;
    },

    /**
     * Shapes what `auth()` and `useSession()` return. Nothing reaches the
     * client unless it is copied here, so the token can hold more than the
     * session exposes.
     */
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }

      session.user.role = token.role;
      session.user.status = token.status;

      return session;
    },
  },
} satisfies NextAuthConfig;
