"use server";

import { headers } from "next/headers";

import { Prisma } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { sendVerificationEmailTo } from "@/lib/auth/send-verification";
import { prisma } from "@/lib/prisma";
import {
  normalizeEmail,
  normalizeName,
  registerSchema,
} from "@/lib/validations/auth";

import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

import type { RegisterInput } from "@/lib/validations/auth";
import type { ActionResult } from "@/types";

/**
 * Creates a password-based account.
 *
 * Deliberately does NOT sign the new user in. Auth.js's `signIn` is driven from
 * the client so that a failed login after a successful registration is
 * distinguishable from a failed registration - the caller creates the account,
 * then calls `signIn("credentials", ...)`. See
 * `src/components/auth/register-form.tsx`.
 *
 * `emailVerified` is left null. Email verification is a later phase; nothing
 * currently gates on it.
 */
/**
 * Signup budget per client address.
 *
 * Keyed on IP because there is no account yet to key on. Five per hour is far more
 * than a real person needs and stops a script from filling the users table - which
 * matters more than usual here, because every attempt costs a bcrypt hash at cost 12
 * and is therefore a CPU-exhaustion vector as much as a data one.
 */
const REGISTER_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

export async function registerUser(
  input: RegisterInput
): Promise<ActionResult<{ email: string }>> {
  const ip = clientIpFrom(await headers());
  const rate = checkRateLimit(`register:${ip}`, REGISTER_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many sign-up attempts. Please try again later.",
    };
  }

  // Re-validated here, not just in the browser. A Server Action is a public
  // HTTP endpoint - the client-side Zod check can simply be skipped.
  const parsed = registerSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }

  const email = normalizeEmail(parsed.data.email);
  const name = normalizeName(parsed.data.name);
  const password = await hashPassword(parsed.data.password);

  // Declared out here because it is assigned inside the try below and read after it.
  let created: { id: string; name: string | null; email: string };

  try {
    created = await prisma.user.create({
      data: { name, email, password },
      select: { id: true, name: true, email: true },
    });
  } catch (error) {
    /**
     * P2002 is a unique-constraint violation, here always on `User.email`.
     *
     * Relying on the constraint rather than a prior `findUnique` is deliberate:
     * a check-then-insert has a race window in which two concurrent signups
     * both see "available" and one crashes with an unhandled 500. The database
     * is the only place that can decide this atomically.
     *
     * Note this confirms an email is registered, which is an enumeration
     * vector. The privacy-preserving alternative - always report success and
     * email the address to tell them - needs email infrastructure that does not
     * exist yet. Revisit alongside email verification.
     */
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return {
        success: false,
        error: "An account with this email already exists.",
      };
    }

    throw error;
  }

  /**
   * The confirmation email, and why a failure here does not fail the signup.
   *
   * The account exists and is usable without a confirmed address - nothing is gated on it - so a
   * Resend outage must not turn a completed registration into an error the user would answer by
   * registering again, straight into the "already exists" branch above. It is sent best-effort and
   * the failure is logged; `/profile` offers a resend, which is the recovery path.
   *
   * Silently does nothing when email is unconfigured, which is the state on any deployment without
   * `RESEND_API_KEY` - `sendEmail` reports that rather than throwing.
   */
  await sendVerificationEmailTo(created).catch((error: unknown) => {
    console.error("registration verification email failed", {
      userId: created.id,
      error,
    });
  });

  return { success: true, data: { email } };
}
