import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { authConfig } from "@/auth.config";
import { LOGIN_ROUTE } from "@/config/routes";
import { UserStatus } from "@/generated/prisma/enums";
import { verifyPassword } from "@/lib/auth/password";
import { isGoogleEnabled } from "@/lib/auth/providers";
import { prisma } from "@/lib/prisma";
import { loginSchema, normalizeEmail } from "@/lib/validations/auth";

import type { Provider } from "next-auth/providers";

/**
 * The application's Auth.js instance. Node runtime only.
 *
 * Import from here in Server Components, Server Actions, Route Handlers and
 * scripts. Do NOT import this into `src/middleware.ts` - it carries the Prisma
 * adapter and bcrypt, neither of which can run on the Edge. Middleware uses
 * `@/auth.config`.
 *
 * @example
 * import { auth } from "@/auth";
 * const session = await auth();
 * if (!session?.user) redirect("/login");
 */

/**
 * WHY PROVIDERS LIVE HERE AND NOT IN auth.config.ts
 * -------------------------------------------------
 * `authorize()` needs Prisma and bcrypt. Putting the Credentials provider in
 * the edge-safe config would drag both into the middleware bundle and break the
 * build. Middleware only ever *decodes* an existing token, so it needs no
 * provider list at all - `authConfig.providers` stays empty by design.
 */
const providers: Provider[] = [
  Credentials({
    /**
     * Shapes Auth.js's built-in sign-in page. Ours is a custom page, so this is
     * only a declaration of which fields arrive at `authorize()`.
     */
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },

    /**
     * Returning `null` produces a generic `CredentialsSignin` error. That is
     * intentional for every failure mode below: a distinct message for "no such
     * user" would turn this form into an account-enumeration oracle.
     */
    async authorize(raw) {
      // Re-validated server-side. The browser's Zod check is a UX affordance;
      // this call is reachable by a hand-rolled POST.
      const parsed = loginSchema.safeParse(raw);

      if (!parsed.success) {
        return null;
      }

      const email = normalizeEmail(parsed.data.email);

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          avatarUrl: true,
          password: true,
          role: true,
          status: true,
          deletedAt: true,
        },
      });

      // Note the deliberate absence of an early return. `verifyPassword`
      // accepts null and still burns a full bcrypt comparison, so a missing
      // account, a soft-deleted one and an OAuth-only one (no password set) all
      // take the same time as a wrong password.
      const passwordMatches = await verifyPassword(
        parsed.data.password,
        user?.deletedAt ? null : user?.password
      );

      if (!user || user.deletedAt || !passwordMatches) {
        return null;
      }

      // Account status is NOT checked here - the `signIn` callback below owns
      // that, so the rule is enforced identically for Google sign-ins.
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.avatarUrl ?? user.image,
        role: user.role,
        status: user.status,
      };
    },
  }),
];

/**
 * Google is registered only when its credentials exist. An empty client ID does
 * not fail at boot - it fails opaquely when someone clicks the button - so the
 * provider and its button appear together or not at all.
 *
 * `allowDangerousEmailAccountLinking` is deliberately left off. With it on,
 * anyone able to create a Google account at a victim's email address could take
 * over an existing password account. The cost of leaving it off is that a user
 * who registered with a password and later clicks "Continue with Google" gets
 * an `OAuthAccountNotLinked` error, which the login page explains.
 */
if (isGoogleEnabled()) {
  providers.push(Google);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,

  providers,

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

  callbacks: {
    ...authConfig.callbacks,

    /**
     * The single gate for "is this account allowed to sign in at all", applied
     * to every provider.
     *
     * IT MUST LOOK UP BY EMAIL, NOT BY ID. For OAuth, Auth.js runs this
     * callback *before* the adapter creates the user
     * (`@auth/core/lib/actions/callback/index.js` calls `handleAuthorized`
     * ahead of `handleLoginOrRegister`). On a first-ever Google sign-in `user`
     * is therefore the raw Google profile: `user.id` is Google's subject ID, not
     * a Prisma cuid, and no row exists yet. Keying on `id` would find nothing
     * and reject every new Google signup.
     *
     * So "no row" is a legitimate new user. Only an existing, unavailable row
     * is refused.
     */
    async signIn({ user }) {
      if (!user.email) {
        // No email means we cannot identify the account, and every downstream
        // flow (verification, reset, notifications) assumes one.
        return `${LOGIN_ROUTE}?error=MissingEmail`;
      }

      const existing = await prisma.user.findUnique({
        where: { email: normalizeEmail(user.email) },
        select: { status: true, deletedAt: true },
      });

      if (!existing) {
        return true;
      }

      // Soft-deleted accounts keep their row - and their unique email - so the
      // address cannot simply be re-registered.
      if (existing.deletedAt) {
        return `${LOGIN_ROUTE}?error=AccountUnavailable`;
      }

      if (existing.status !== UserStatus.ACTIVE) {
        return `${LOGIN_ROUTE}?error=AccountSuspended`;
      }

      return true;
    },
  },

  /**
   * Surfaces Auth.js's internal logs in development (token contents, callback
   * order, adapter calls). Silent in production - these logs contain tokens.
   */
  debug: process.env.NODE_ENV === "development",
});
