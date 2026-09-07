"use server";

import { revalidatePath } from "next/cache";

import { isLastSignInMethod } from "@/lib/auth/sign-in-methods";
import { getActiveUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  changePasswordSchema,
  setPasswordSchema,
} from "@/lib/validations/auth";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ActionResult } from "@/types";

/**
 * Account security: the password, and which providers can open this account.
 *
 * ONE RULE RUNS THROUGH ALL THREE ACTIONS - an account must never be left with no way
 * to sign in. A member with only a Google account cannot disconnect it; a member with
 * only a password cannot delete it (there is no action to). That rule lives in
 * `lib/auth/sign-in-methods.ts`, shared with the page that decides which controls to
 * show, because the two answering it differently is a bug that no type catches.
 *
 * `getActiveUser()` throughout, per the project rule: these are invoked from forms and
 * buttons that must render the outcome, and the id always comes from the session - no
 * action here accepts a user id.
 */

/**
 * Password attempts per user per hour.
 *
 * This is a guess-the-current-password oracle for anyone holding a stolen session, so it
 * is far tighter than the profile's budget. Ten is more than anybody legitimately needs
 * to type their own password.
 */
const PASSWORD_RATE_LIMIT = { limit: 10, windowMs: 60 * 60 * 1000 };

/** Connect/disconnect per user per hour. */
const ACCOUNT_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

const RATE_LIMITED_ERROR =
  "Too many attempts just now. Please try again later.";

/**
 * Changes the password of an account that already has one.
 *
 * THE CURRENT PASSWORD IS RE-CHECKED even though the caller is already signed in, and
 * that is the whole point of the field. A live session is not proof that the person at
 * the keyboard is the account holder - an unattended laptop or a stolen cookie is
 * exactly the situation this form defends against, and without the check either one
 * would be enough to lock the real owner out of their own account.
 *
 * SPENDS EVERY OUTSTANDING RESET TOKEN. Someone who changes their password because they
 * think it is compromised must not leave a live reset link in an attacker's inbox -
 * `requestPasswordReset` needs only an email address, so an attacker can mint one at any
 * time. `resetPassword` already spends its siblings on success for this reason; this is
 * the same rule reached from the other direction.
 *
 * SIGNS EVERY OTHER SESSION OUT, by incrementing `User.tokenVersion`. Under the JWT
 * strategy there is no session row to delete, so without this a stolen cookie would go
 * on working for up to 30 days after the password it belongs to was replaced - which is
 * the one thing someone changing a compromised password believes they have just stopped.
 * The session helpers compare the token's copy of the version against the column on
 * every protected request, so the revocation lands on the thief's next click.
 *
 * INCLUDING THIS ONE, which is why the caller re-authenticates. The current cookie was
 * minted at the old version and is now stale like any other; `ChangePasswordForm` signs
 * back in with the new password immediately, which is why this returns the email address
 * to sign in with. That is the same shape `resetPassword` already uses, including its
 * failure mode: if the re-sign-in fails, the password change still happened and the form
 * says so.
 */
export async function changePassword(
  input: unknown
): Promise<ActionResult<{ email: string }>> {
  const parsed = changePasswordSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(
    `change-password:${user.id}`,
    PASSWORD_RATE_LIMIT
  );

  if (!rate.allowed) {
    return { success: false, error: RATE_LIMITED_ERROR };
  }

  let email: string;

  try {
    const current = await prisma.user.findUnique({
      where: { id: user.id },
      // `email` so the caller can sign back in without trusting the session's copy,
      // which is a snapshot from whenever the token was minted.
      select: { password: true, email: true },
    });

    if (!current) {
      return { success: false, error: UNAUTHENTICATED_ERROR };
    }

    if (current.password === null) {
      // Not a security boundary - the member is signed in as themselves and can see
      // which methods their own account has - so this says what to do instead.
      return {
        success: false,
        error: "This account has no password yet. Set one below instead.",
      };
    }

    const matches = await verifyPassword(
      parsed.data.currentPassword,
      current.password
    );

    if (!matches) {
      return { success: false, error: "Your current password is not correct." };
    }

    const password = await hashPassword(parsed.data.newPassword);

    // One transaction. All three parts are the same act: a password changed while a
    // live reset token or an old session survives is exactly the state this exists to
    // prevent, and separate statements can fail between.
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          password,
          // `increment` rather than a read-then-write: two concurrent changes would
          // otherwise both read the same version and the second would undo the first,
          // leaving a session alive that both of them meant to revoke.
          tokenVersion: { increment: 1 },
        },
      });

      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
    });

    email = current.email;
  } catch (error) {
    console.error("changePassword failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

  revalidatePath("/settings");

  return { success: true, data: { email } };
}

/**
 * Adds a password to an account that has never had one.
 *
 * No current password is asked for because there is none to ask for: a Google-only
 * account has `User.password` of `null`. The live session is the proof of control, which
 * is the same standing a reset link has - both mean "this person can already act as the
 * account holder".
 *
 * THE `null` CHECK IS AN AUTHORIZATION CHECK, not a convenience. Without it this action
 * would be a way to overwrite an existing password without knowing it, which is precisely
 * what {@link changePassword} demands the current password to prevent - and an attacker
 * holding a stolen session would use this one rather than that one.
 */
export async function setPassword(input: unknown): Promise<ActionResult> {
  const parsed = setPasswordSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the form.",
    };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`set-password:${user.id}`, PASSWORD_RATE_LIMIT);

  if (!rate.allowed) {
    return { success: false, error: RATE_LIMITED_ERROR };
  }

  try {
    const password = await hashPassword(parsed.data.newPassword);

    /**
     * `updateMany` with `password: null` in the predicate, not `update`.
     *
     * A compare-and-swap, for the same reason `resetPassword` uses one: two requests
     * arriving together would both read `null` and both write, and the loser would
     * silently overwrite a password the member had just set. Here the predicate makes
     * the database refuse the second one.
     */
    const written = await prisma.user.updateMany({
      where: { id: user.id, password: null },
      data: { password },
    });

    if (written.count === 0) {
      return {
        success: false,
        error:
          "This account already has a password. Use the change form instead.",
      };
    }
  } catch (error) {
    console.error("setPassword failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

  revalidatePath("/settings");

  return { success: true, data: undefined };
}

/**
 * Unlinks a connected sign-in provider.
 *
 * REFUSES TO REMOVE THE LAST WAY IN. A member whose only credential is Google, who
 * disconnects Google, has locked themselves out of an account they are still looking at -
 * and cannot recover it, because `requestPasswordReset` sends a link that sets a password
 * only for accounts that... have no other route in either. The check is here rather than
 * only in the UI because the UI is a hint and this is the rule.
 *
 * Counted, not assumed to be one. Google is the only provider configured today, but
 * counting rows means a second provider does not silently turn this check into a
 * tautology.
 */
export async function disconnectAccount(
  provider: unknown
): Promise<ActionResult> {
  if (typeof provider !== "string" || provider.length === 0) {
    return { success: false, error: "That account could not be disconnected." };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`disconnect:${user.id}`, ACCOUNT_RATE_LIMIT);

  if (!rate.allowed) {
    return { success: false, error: RATE_LIMITED_ERROR };
  }

  try {
    const [current, accounts] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: { password: true },
      }),
      prisma.account.findMany({
        where: { userId: user.id },
        select: { id: true, provider: true },
      }),
    ]);

    if (!current) {
      return { success: false, error: UNAUTHENTICATED_ERROR };
    }

    const target = accounts.find((account) => account.provider === provider);

    if (!target) {
      return {
        success: false,
        error: "That account is not connected.",
      };
    }

    if (isLastSignInMethod(current.password !== null, accounts.length)) {
      return {
        success: false,
        error:
          "This is the only way you can sign in. Set a password first, then disconnect.",
      };
    }

    /**
     * Deleted by id, and by `userId` as well.
     *
     * The id came from a query already scoped to this member, so the extra clause proves
     * nothing new today - it is there so that a future refactor which starts taking the
     * id from the caller cannot turn this into a delete of somebody else's row.
     */
    await prisma.account.deleteMany({
      where: { id: target.id, userId: user.id },
    });
  } catch (error) {
    console.error("disconnectAccount failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }

  revalidatePath("/settings");

  return { success: true, data: undefined };
}
