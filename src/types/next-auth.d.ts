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

      /**
       * The session generation this token was minted at - see `User.tokenVersion`.
       *
       * ON THE SESSION, not only in the token, because the code that has to compare it
       * (`requireUser` and friends) is handed a `Session` by `auth()` and never sees the
       * raw JWT. Optional: a cookie issued before this field existed carries no version,
       * and the helpers read a missing one as 0 rather than signing that person out.
       *
       * Not a secret. It reveals only how many times the account's sessions have been
       * revoked, and the value is meaningless without the signed cookie it came from.
       */
      tokenVersion?: number;
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

    /** Copied into the token at sign-in. See `User.tokenVersion` in the schema. */
    tokenVersion?: number;

    /**
     * Present so a provider's `profile()` may return it - see the Google
     * provider in `src/auth.ts`, which maps Google's `email_verified` claim onto
     * it. `AdapterUser` already declares this as required; widening it to
     * optional here keeps that assignable while letting `profile()` omit it.
     */
    emailVerified?: Date | null;
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

    /**
     * Optional, unlike the two above, and deliberately so. Those are set by the `jwt`
     * callback on every sign-in, so a token without them cannot exist. This one arrived
     * later: cookies minted before it shipped are still valid and carry nothing here.
     * Every reader treats `undefined` as 0.
     */
    tokenVersion?: number;
  }
}
