/**
 * How many distinct ways an account can be signed into.
 *
 * ONE IMPLEMENTATION, TWO CALLERS, AND THAT IS THE WHOLE POINT OF THE FILE.
 * `disconnectAccount` uses it to decide what to *allow*; `/settings` uses it to decide
 * what to *offer*. Both need the same answer, and they briefly did not: the page carried
 * its own copy of the arithmetic with the ternary the wrong way round, which offered a
 * Disconnect button to the one member who must never see it (Google-only, no password)
 * and hid it from the one who should (password plus Google). The action refused it either
 * way, so nothing was insecure - it was just wrong on screen, in both directions at once,
 * and no type would ever have caught it.
 *
 * It lives here rather than in `actions/security.ts` because a `"use server"` module may
 * only export async functions, so a shared synchronous helper cannot sit beside the action
 * that needs it.
 *
 * A password counts as one method, each linked OAuth account as one more. Counted rather
 * than assumed to be at most one: Google is the only provider configured today, and
 * hard-coding that would turn the check into a tautology the moment a second one lands.
 */
export function signInMethodCount(
  hasPassword: boolean,
  accountCount: number
): number {
  return (hasPassword ? 1 : 0) + accountCount;
}

/**
 * Whether removing one linked account would leave the member unable to sign in.
 *
 * The question every caller actually asks, so it is asked once here rather than each of
 * them re-deriving "is the count at least two". A member who disconnects their only
 * credential is locked out of an account they are still looking at, and cannot recover
 * it - a reset link sets a password, but only for an account that can still be reached.
 */
export function isLastSignInMethod(
  hasPassword: boolean,
  accountCount: number
): boolean {
  return signInMethodCount(hasPassword, accountCount) < 2;
}
