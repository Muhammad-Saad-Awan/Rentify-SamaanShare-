"use server";

import { isEmailEnabled } from "@/config/env";
import {
  checkVerificationToken,
  hashVerificationToken,
} from "@/lib/auth/email-verification";
import { sendVerificationEmailTo } from "@/lib/auth/send-verification";
import { getActiveUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * Email confirmation.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT. Confirming a link proves an address was reachable. It is
 * not identity verification: `User.isVerified` is granted by a person after checking a document, and
 * nothing in this file may set it. The trust score weights the two 0.4 against 1.0 and gates its top
 * band on the stronger one, so collapsing them here would quietly hand out the platform's strongest
 * claim in exchange for clicking a link.
 *
 * NO ENUMERATION RULE HERE, unlike the password reset. That flow accepts an address from an
 * anonymous visitor, so any difference in its response leaks who has an account. This one only ever
 * acts on the caller's *own* session, so there is nothing to enumerate and the messages can be
 * specific and useful.
 *
 * REDEMPTION IS A WRITE, NOT A PAGE LOAD. `/verify-email` renders a button rather than confirming on
 * render. A GET that mutates fires on every link preview, mail scanner and prefetch - the same
 * reasoning that keeps `viewCount` off the listing page's render path, and the same reason the reset
 * page does not validate its token on render.
 */

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

/**
 * Sends per user per hour.
 *
 * Each one is real mail to an address the caller controls, so the abuse this bounds is a script
 * looping the button rather than someone mailbombing a third party - which is why this is keyed on
 * the session and needs no IP companion, unlike the reset request.
 */
const SEND_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

/** Redemption attempts per user. Bounds guessing at a token, which is already infeasible. */
const REDEEM_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

/**
 * Sends a confirmation link to the signed-in user's own address.
 *
 * Takes no input at all. An address parameter would let a signed-in account send SamaanShare-branded
 * mail to anyone, which is a spam relay with a login form in front of it.
 */
export async function sendEmailVerification(): Promise<
  ActionResult<{ message: string }>
> {
  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  if (!isEmailEnabled()) {
    /**
     * Said plainly rather than reported as success.
     *
     * The UI hides the control when email is unconfigured, so this should be unreachable - and an
     * unconfigured integration that silently claimed to have sent something would leave a user
     * waiting for mail that was never going to arrive.
     */
    return {
      success: false,
      error: "Email is not configured on this deployment.",
    };
  }

  const rate = checkRateLimit(`verify-send:${user.id}`, SEND_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many requests just now. Please try again shortly.",
    };
  }

  try {
    const current = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, emailVerified: true },
    });

    if (!current) {
      return { success: false, error: UNAUTHENTICATED_ERROR };
    }

    if (current.emailVerified) {
      // Not an error worth alarming anyone with - the desired state already holds.
      return {
        success: true,
        data: { message: "Your email address is already confirmed." },
      };
    }

    const result = await sendVerificationEmailTo(current);

    if (!result.sent) {
      // `reason` carries the provider's status and message, never the token or the body.
      console.error("verification email failed to send", {
        userId: current.id,
        reason: result.reason,
      });

      return {
        success: false,
        error: "We could not send the email just now. Please try again.",
      };
    }

    return {
      success: true,
      data: { message: "Confirmation link sent. Check your inbox and spam." },
    };
  } catch (error) {
    console.error("sendEmailVerification failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * The single message for every unusable token.
 *
 * Expired, already spent, minted for a different address, and never existed are reported
 * identically. Distinguishing them would tell someone holding a leaked link whether it was ever
 * real, and "already used" would confirm an account exists and that the confirmation completed.
 */
const INVALID_TOKEN_ERROR =
  "That confirmation link is no longer valid. Request a new one from your profile.";

/**
 * Redeems a confirmation link.
 *
 * Requires a session as well as the token. The token alone would be enough to identify the account,
 * but requiring the caller to be signed in as its owner means a link forwarded, quoted in a reply,
 * or scraped from a mailbox by something else cannot confirm the address on its own.
 */
export async function verifyEmail(token: unknown): Promise<ActionResult> {
  if (typeof token !== "string" || token.length === 0) {
    return { success: false, error: INVALID_TOKEN_ERROR };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`verify-redeem:${user.id}`, REDEEM_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many attempts just now. Please try again shortly.",
    };
  }

  try {
    const stored = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashVerificationToken(token) },
      select: {
        id: true,
        userId: true,
        email: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { email: true, emailVerified: true } },
      },
    });

    /**
     * A token belonging to someone else is refused as invalid, not as forbidden.
     *
     * Saying "this link is not yours" would confirm the link is real and belongs to some other
     * account, which is a fact the holder should not be able to establish.
     */
    if (!stored || stored.userId !== user.id) {
      return { success: false, error: INVALID_TOKEN_ERROR };
    }

    const rejection = checkVerificationToken(stored, stored.user.email);

    if (rejection) {
      return { success: false, error: INVALID_TOKEN_ERROR };
    }

    if (stored.user.emailVerified) {
      // Already done - spend the token so it cannot linger, and report the desired state.
      await prisma.emailVerificationToken.updateMany({
        where: { id: stored.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      return { success: true, data: undefined };
    }

    const outcome = await prisma.$transaction(async (tx) => {
      /**
       * Claim the token before writing anything, by compare-and-swap on `usedAt: null`.
       *
       * The same ordering as the password reset: a losing racer changes nothing at all rather than
       * both requests marking the address confirmed and both reporting success.
       */
      const claimed = await tx.emailVerificationToken.updateMany({
        where: { id: stored.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      if (claimed.count === 0) {
        return { claimed: false as const };
      }

      /**
       * Guarded on the address as well as the id.
       *
       * Between the check above and this write the user could have changed their email. Without the
       * predicate, this would mark the *new* address confirmed on the strength of a link sent to the
       * old one - the same hole `checkVerificationToken`'s `stale` case closes, at the other end.
       */
      await tx.user.updateMany({
        where: { id: user.id, email: stored.email },
        data: { emailVerified: new Date() },
      });

      /** Every sibling link is spent too, so no second live link survives a successful confirm. */
      await tx.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      return { claimed: true as const };
    });

    if (!outcome.claimed) {
      return { success: false, error: INVALID_TOKEN_ERROR };
    }

    /**
     * No `revalidatePath`.
     *
     * `emailVerified` shows on the caller's own profile and feeds the trust score on their public
     * page, both of which are rendered per request for a signed-in viewer. The confirmation screen
     * links onward rather than trying to refresh a route the user is not currently on.
     */
    return { success: true, data: undefined };
  } catch (error) {
    console.error("verifyEmail failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}
