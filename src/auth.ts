import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";

/**
 * The application's Auth.js instance. Node runtime only.
 *
 * Import from here in Server Components, Server Actions, Route Handlers and
 * scripts. Do NOT import this into `src/middleware.ts` - it carries the Prisma
 * adapter, which cannot run on the Edge. Middleware uses `@/auth.config`.
 *
 * @example
 * import { auth } from "@/auth";
 * const session = await auth();
 * if (!session?.user) redirect("/login");
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  /**
   * Teaches Auth.js how to persist users, OAuth accounts and verification
   * tokens using our Prisma models (User, Account, Session, VerificationToken
   * in prisma/schema.prisma).
   *
   * Still required even though sessions are JWTs:
   *   - OAuth sign-in needs `Account` rows to link a Google identity to a User
   *   - email verification and password-reset flows need `VerificationToken`
   *   - a User row must exist for listings, bookings and reviews to reference
   *
   * The `Session` table stays empty under the JWT strategy. It is kept so the
   * schema remains a complete Auth.js schema and switching strategies later
   * needs no migration.
   *
   * The cast is needed because `@auth/prisma-adapter` types its argument as
   * `PrismaClient` from the `@prisma/client` package, while Prisma 7's
   * `prisma-client` generator emits our client to `src/generated/prisma`. The
   * two are structurally identical for the model delegates the adapter calls.
   */
  adapter: PrismaAdapter(prisma as never),

  /**
   * Surfaces Auth.js's internal logs in development (token contents, callback
   * order, adapter calls). Silent in production - these logs contain tokens.
   */
  debug: process.env.NODE_ENV === "development",
});
