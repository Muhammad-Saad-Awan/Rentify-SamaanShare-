import type { DefaultSession } from "next-auth";

import type { UserRole, UserStatus } from "@/generated/prisma/enums";

/**
 * Module augmentation for Auth.js.
 *
 * Auth.js ships a deliberately minimal `Session` type - `{ name, email, image }`
 * and no `id`. SamaanShare needs the user id (to own listings and bookings) and
 * `role`/`status` (to gate the admin area and block suspended accounts), so the
 * library's interfaces are widened here.
 *
 * These declarations are types only. What actually puts the values into the
 * token and session are the `jwt` and `session` callbacks in
 * `src/auth.config.ts` - this file just stops TypeScript from complaining, it
 * does not populate anything.
 *
 * The `import` above matters: a `.d.ts` file with a top-level import is a
 * module, which is what makes `declare module` an augmentation of the existing
 * package rather than a redefinition that shadows it.
 */

declare module "next-auth" {
  /** Returned by `auth()`, `useSession()` and `getSession()`. */
  interface Session {
    user: {
      /** Prisma `User.id` (cuid). Copied from `token.sub`. */
      id: string;
      role: UserRole;
      status: UserStatus;
    } & DefaultSession["user"];
  }

  /**
   * The shape handed to the `jwt` callback on sign-in, and what the Prisma
   * adapter returns from `getUser`/`createUser`.
   *
   * Optional because a provider's `profile()` mapping is not obliged to supply
   * them - the adapter fills them in from the database defaults. The `jwt`
   * callback applies a fallback for that case.
   */
  interface User {
    role?: UserRole;
    status?: UserStatus;
  }
}

/**
 * `@auth/core/jwt`, not `next-auth/jwt`.
 *
 * Much of the Auth.js v5 documentation still shows `declare module
 * "next-auth/jwt"`. That does not work here: `next-auth/jwt` is a bare
 * `export * from "@auth/core/jwt"` re-export and declares no `JWT` interface of
 * its own, so augmenting it creates an unrelated interface instead of merging
 * into the real one. Since `JWT extends Record<string, unknown>`, the failure is
 * silent - `token.role` types as `unknown` rather than erroring.
 */
declare module "@auth/core/jwt" {
  /**
   * The encrypted payload of the session cookie (a JWE).
   *
   * Required, not optional: the `jwt` callback always sets both on sign-in, and
   * sign-in is the only way a token comes into existence.
   */
  interface JWT {
    role: UserRole;
    status: UserStatus;
  }
}
