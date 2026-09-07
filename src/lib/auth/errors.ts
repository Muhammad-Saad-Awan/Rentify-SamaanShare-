/**
 * Turns Auth.js error codes into messages a person can act on.
 *
 * Codes reach the UI by two routes, which is why this map is shared:
 *   - `?error=` on the login page, for failures during a redirect flow (OAuth,
 *     and the `signIn` callback's rejections)
 *   - the `error` field of the `SignInResponse` returned by a client-side
 *     `signIn(..., { redirect: false })` call
 *
 * Safe to import from Client Components - no environment access, no secrets.
 */

/** Shown when the code is unrecognised, so the UI never renders a raw code. */
const FALLBACK_MESSAGE =
  "Something went wrong while signing you in. Please try again.";

const ERROR_MESSAGES: Record<string, string> = {
  /**
   * Every credentials failure collapses to this one code by design - wrong
   * password, unknown email, or an OAuth-only account. A more specific message
   * would turn the login form into an account-enumeration oracle.
   */
  CredentialsSignin: "Incorrect email or password.",

  /**
   * Raised when the email on a Google account already belongs to a local
   * account that has no linked Google identity. This is a security feature, not
   * a bug: auto-linking would let anyone who can create a Google account at
   * that address take over the existing one.
   */
  OAuthAccountNotLinked:
    "An account with this email already exists. Sign in with your password instead.",

  // Returned by the `signIn` callback in src/auth.ts.
  AccountSuspended:
    "This account has been suspended. Contact support if you think this is a mistake.",
  AccountUnavailable: "This account is no longer available.",

  /**
   * The session was revoked - almost always because the account's password was
   * changed from somewhere else. Says so plainly rather than "session expired": if
   * this is the attacker's browser the wording costs nothing, and if it is the
   * member's own second device, "your password was changed" is the one sentence that
   * tells them whether to worry.
   */
  SessionRevoked:
    "You were signed out because this account's password was changed. Sign in again with the new password.",
  MissingEmail:
    "That provider did not share an email address, which SamaanShare needs. Try signing up with an email and password instead.",

  AccessDenied: "You do not have permission to sign in.",
  OAuthSignin: "Could not reach the sign-in provider. Please try again.",
  OAuthCallback: "The sign-in provider returned an error. Please try again.",
  Verification: "That sign-in link has expired or has already been used.",

  /**
   * A server misconfiguration - a missing AUTH_SECRET, or bad provider
   * credentials. Deliberately vague: the details belong in the server logs, not
   * on screen.
   */
  Configuration:
    "Sign-in is temporarily unavailable. Please try again shortly.",
};

/** Maps an Auth.js error code to a display message. */
export function getAuthErrorMessage(code: string | null | undefined): string {
  if (!code) {
    return FALLBACK_MESSAGE;
  }

  return ERROR_MESSAGES[code] ?? FALLBACK_MESSAGE;
}
