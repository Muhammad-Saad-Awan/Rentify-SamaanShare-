"use server";

import { headers } from "next/headers";

import { publicEnv } from "@/config/env.public";
import { UserStatus } from "@/generated/prisma/enums";
import { hashPassword } from "@/lib/auth/password";
import {
  checkResetToken,
  createResetToken,
  hashResetToken,
  resetPasswordUrl,
  resetTokenExpiry,
} from "@/lib/auth/password-reset";
import { sendEmail } from "@/lib/email/send";
import { passwordResetEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";
import {
  forgotPasswordSchema,
  normalizeEmail,
  resetPasswordSchema,
} from "@/lib/validations/auth";

import type { ActionResult } from "@/types";

/**
 * Password reset.
 *
 * THE ENUMERATION RULE, which shapes everything else here. `requestPasswordReset` returns the same
 * success for a registered address, an unregistered one, a suspended account and an OAuth-only one.
 * Any difference - a distinct message, a distinct error, even a distinct shape - turns this form
 * into a free membership oracle for the whole user base. `registerUser` already leaks this via its
 * unique-constraint message and says so in a comment; that is a separate fix and not a licence to
 * add a second leak.
 *
 * The consequence is that failures are invisible to the user by design, so they are logged
 * server-side with enough detail to diagnose and never enough to be a credential.
 *
 * WHAT IS NOT MITIGATED. Response time still differs measurably: the registered path mints a token,
 * writes a row and waits on Resend, and the unregistered path returns immediately. Equalising that
 * properly needs the send moved off the request path onto a queue, which is not worth a queue yet.
 * It is a real but narrow leak - noisy over the internet, and it costs an attacker one request per
 * address either way, which the IP rate limit already bounds.
 */

/**
 * Reset requests per client address.
 *
 * Keyed on IP as well as email: keying on email alone would let a script walk a list of addresses
 * one request each and never trip a limit, which is exactly the enumeration this is guarding.
 */
const REQUEST_IP_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };

/**
 * Reset requests per email address.
 *
 * Stops someone using the form to mailbomb one person, which is the other abuse here - each request
 * sends real mail to an address the requester does not control.
 */
const REQUEST_EMAIL_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

/** Redemption attempts per address. Bounds guessing at a token, which is already infeasible. */
const RESET_IP_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

/**
 * The one thing this action ever tells the caller.
 *
 * Deliberately does not say "if an account exists" in a way that implies the sender knows. It states
 * what was done and what to do next, which is true in every branch.
 */
const NEUTRAL_RESPONSE =
  "If that email address has an account, a reset link is on its way. Check your inbox, including spam.";

/**
 * Sends a reset link, if there is anywhere to send it.
 *
 * Always reports the same thing - see the enumeration note above.
 */
export async function requestPasswordReset(
  input: unknown
): Promise<ActionResult<{ message: string }>> {
  const parsed = forgotPasswordSchema.safeParse(input);

  if (!parsed.success) {
    // A malformed address is a form error, not an account signal, so this one may be specific.
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Enter a valid email address.",
    };
  }

  const email = normalizeEmail(parsed.data.email);
  const ip = clientIpFrom(await headers());

  const ipRate = checkRateLimit(
    `reset-request-ip:${ip}`,
    REQUEST_IP_RATE_LIMIT
  );
  const emailRate = checkRateLimit(
    `reset-request-email:${email}`,
    REQUEST_EMAIL_RATE_LIMIT
  );

  if (!ipRate.allowed || !emailRate.allowed) {
    /**
     * Reported as the neutral success, not as a rate-limit error.
     *
     * A distinct "too many requests" response for one address and not another is the enumeration
     * leak wearing a different hat: an attacker would simply read the limit as the signal.
     */
    return { success: true, data: { message: NEUTRAL_RESPONSE } };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        deletedAt: true,
      },
    });

    /**
     * Silently stops here for an address with no account, a soft-deleted one, or a suspended or
     * banned one.
     *
     * A suspended user must not be able to regain access through the reset flow - that would make
     * suspension a formality. An OAuth-only account (no `password`) is deliberately NOT excluded:
     * setting a password gives that user a second way in, and anyone who controls the mailbox
     * already controls the Google account that mailbox authenticates.
     */
    if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) {
      return { success: true, data: { message: NEUTRAL_RESPONSE } };
    }

    const { token, tokenHash } = createResetToken();

    await prisma.$transaction(async (tx) => {
      /**
       * Any earlier outstanding token is spent first.
       *
       * So a second request invalidates the first link rather than leaving several live keys to one
       * account. Marked used rather than deleted, so a user who clicks the older link gets "this
       * link has expired" instead of "invalid link", and so a replay is visible in the data.
       */
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: resetTokenExpiry(),
        },
      });
    });

    const result = await sendEmail({
      to: user.email,
      content: passwordResetEmail({
        // Built from the configured origin, never from the request's Host header - see
        // `resetPasswordUrl`.
        resetUrl: resetPasswordUrl(publicEnv.NEXT_PUBLIC_APP_URL, token),
        name: user.name,
      }),
    });

    if (!result.sent) {
      // The user cannot be told, so this is the only record. `reason` carries the provider's status
      // and message and never the token or the body.
      console.error("password reset email failed to send", {
        userId: user.id,
        reason: result.reason,
      });
    }
  } catch (error) {
    // Reported as success for the same enumeration reason. A database failure here is ours to see.
    console.error("requestPasswordReset failed", error);
  }

  return { success: true, data: { message: NEUTRAL_RESPONSE } };
}

/**
 * The single message for every unusable token.
 *
 * Expired, already used, and never existed are reported identically. Distinguishing them would tell
 * someone holding a leaked link whether it was ever real, and "already used" would confirm that an
 * account exists and that someone completed a reset on it.
 */
const INVALID_TOKEN_ERROR =
  "That reset link is no longer valid. Please request a new one.";

/**
 * Sets a new password from a reset link.
 *
 * Single use is enforced by the same compare-and-swap the booking transitions use: the update names
 * `usedAt: null` in its predicate, so two concurrent redemptions of one token cannot both succeed.
 */
export async function resetPassword(
  input: unknown
): Promise<ActionResult<{ email: string }>> {
  const parsed = resetPasswordSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }

  const ip = clientIpFrom(await headers());
  const rate = checkRateLimit(`reset-submit:${ip}`, RESET_IP_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many attempts. Please try again later.",
    };
  }

  const { token, password } = parsed.data;

  try {
    // Looked up by hash: the token itself is never stored, so this is the only way to find the row.
    const stored = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        user: {
          select: { id: true, email: true, status: true, deletedAt: true },
        },
      },
    });

    if (!stored) {
      return { success: false, error: INVALID_TOKEN_ERROR };
    }

    const rejection = checkResetToken(stored);

    if (rejection) {
      // Logged so a replayed link is visible; reported as the same single message.
      console.warn("password reset token rejected", {
        tokenId: stored.id,
        rejection,
      });

      return { success: false, error: INVALID_TOKEN_ERROR };
    }

    // Re-checked at redemption, not just at request: an account can be suspended in the hour a link
    // is valid, and a suspended user must not regain access.
    if (stored.user.deletedAt || stored.user.status !== UserStatus.ACTIVE) {
      return { success: false, error: INVALID_TOKEN_ERROR };
    }

    const hashed = await hashPassword(password);

    const applied = await prisma.$transaction(async (tx) => {
      /**
       * Spend the token first, guarded on it still being unspent.
       *
       * Order matters: if the password were written first and this then lost the race, the winner's
       * password could be overwritten by a second redemption of a token that was already spent.
       * Claiming the token first means the loser changes nothing.
       */
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: stored.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      if (claimed.count !== 1) {
        return false;
      }

      await tx.user.update({
        where: { id: stored.userId },
        data: { password: hashed },
      });

      /**
       * Every other outstanding token for this user is spent too.
       *
       * If an attacker had also requested a reset, their link must stop working the moment the real
       * owner completes one - otherwise a recovered account can be taken straight back.
       */
      await tx.passwordResetToken.updateMany({
        where: { userId: stored.userId, usedAt: null },
        data: { usedAt: new Date() },
      });

      return true;
    });

    if (!applied) {
      return { success: false, error: INVALID_TOKEN_ERROR };
    }

    /**
     * Existing sessions are NOT invalidated, and that is a known gap rather than a decision.
     *
     * Under the JWT strategy a session lives in a signed cookie with no server-side record, so there
     * is nothing to revoke - a stolen session survives a password change until the token expires.
     * Fixing it properly means a token version on `User` checked in the `jwt` callback. Out of scope
     * for A2 and worth doing before launch.
     */
    return { success: true, data: { email: stored.user.email } };
  } catch (error) {
    console.error("resetPassword failed", error);

    return {
      success: false,
      error: "Something went wrong. Please try again.",
    };
  }
}
