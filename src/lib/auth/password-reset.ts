import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Password reset token mechanics.
 *
 * Pure apart from the CSPRNG, so the hashing, the expiry arithmetic and the URL construction are
 * unit-testable without a database. Nothing here queries or sends anything.
 *
 * THE MODEL. A reset link is a bearer credential: whoever holds it can take over the account. So it
 * is long, random, short-lived, single-use, and never stored in a form that could be replayed if the
 * database leaked.
 */

/**
 * Token entropy.
 *
 * 32 bytes = 256 bits, which is not guessable and not brute-forceable. This is what makes a fast
 * hash the correct choice for storage - see `hashResetToken`.
 */
const TOKEN_BYTES = 32;

/**
 * How long a reset link stays valid.
 *
 * One hour. Long enough to survive a slow mail relay and someone reading their email later; short
 * enough that a link sitting in an unattended inbox, a shared machine's history, or a forwarded
 * message stops being a key to the account fairly quickly. Single use is the stronger protection -
 * this is the backstop for a link that was never clicked at all.
 */
export const RESET_TOKEN_TTL_MINUTES = 60;

/** A freshly minted token: the secret to email, and the hash to store. */
export interface ResetTokenPair {
  /** Goes in the emailed URL. Never persisted. */
  token: string;
  /** Goes in the database. Cannot be turned back into the token. */
  tokenHash: string;
}

/**
 * Mints a reset token.
 *
 * base64url rather than hex: same entropy in a third fewer characters, and no `+` or `/` to be
 * mangled by a mail client that decides to wrap or re-encode the link.
 */
export function createResetToken(): ResetTokenPair {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  return { token, tokenHash: hashResetToken(token) };
}

/**
 * Hashes a token for storage and for lookup.
 *
 * SHA-256, NOT bcrypt, and that is deliberate rather than a shortcut. bcrypt is slow on purpose to
 * make guessing a *human-chosen* secret expensive. This value came from a CSPRNG with 256 bits of
 * entropy: there is nothing to guess, so slowness buys nothing - while a fast hash keeps the lookup
 * a single indexed probe instead of a scan over every outstanding token comparing bcrypt digests
 * one at a time.
 *
 * Deterministic and unsalted for the same reason: the lookup has to find the row from the token
 * alone, and a per-row salt would make that impossible. A rainbow table over 256-bit random values
 * cannot exist.
 */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** When a token minted now should stop working. */
export function resetTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60_000);
}

/**
 * Why a token cannot be used, or `null` if it can be.
 *
 * Returns a reason code rather than a message so the caller decides the wording, and so the three
 * failures stay distinguishable in logs while being reported identically to the user.
 */
export type ResetTokenRejection = "expired" | "used";

interface StoredResetToken {
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * Validates a stored token's state.
 *
 * Order matters only for logging: a token that is both spent and expired is reported as spent,
 * because that is the more informative of the two if someone is investigating a replayed link.
 */
export function checkResetToken(
  stored: StoredResetToken,
  now: Date = new Date()
): ResetTokenRejection | null {
  if (stored.usedAt) {
    return "used";
  }

  if (stored.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }

  return null;
}

/**
 * Constant-time comparison of two hex digests.
 *
 * Not strictly required - the lookup is by unique index, so a mismatch is a miss rather than a
 * comparison - but it exists for the belt-and-braces check a caller may want to add, and doing it
 * wrong later would be a subtle timing oracle. `timingSafeEqual` throws on length mismatch, which
 * is itself information, so unequal lengths short-circuit to false first.
 */
export function safeHashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/**
 * The absolute URL to email.
 *
 * Built from the configured origin rather than from request headers: a `Host` header is attacker
 * controlled, and a reset link is exactly the thing you must never point at a host someone else
 * chose. Same class of bug as the open redirect `sanitizeCallbackUrl` guards against, with a worse
 * payload - the token travels in the URL.
 */
export function resetPasswordUrl(origin: string, token: string): string {
  const url = new URL("/reset-password", origin);

  url.searchParams.set("token", token);

  return url.toString();
}
