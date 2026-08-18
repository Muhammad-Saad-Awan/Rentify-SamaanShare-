import { createHash, randomBytes } from "node:crypto";

/**
 * Email confirmation token mechanics.
 *
 * Pure apart from the CSPRNG, so the hashing, the expiry arithmetic and the URL construction are
 * unit-testable without a database. Nothing here queries or sends anything.
 *
 * THE MODEL, AND HOW IT DIFFERS FROM A RESET TOKEN. Both are random bearer strings emailed to an
 * address, and both are stored only as a digest. But a reset link is a key to the account, while
 * this one only records that an address was reachable. That difference sets the lifetime - and it is
 * the reason the two live in separate tables: one table with no type discriminator would let a token
 * minted for the weaker purpose be redeemed for the stronger one.
 *
 * WHAT THIS DOES NOT PROVE. Confirming an inbox is not identity verification. It says an address was
 * reachable at one moment, which is minutes of work for anyone with a mail account. `User.isVerified`
 * is the separate, stronger claim, and nothing in this module may set it.
 */

/** 32 bytes = 256 bits. Not guessable, which is what makes a fast hash correct for storage. */
const TOKEN_BYTES = 32;

/**
 * How long a confirmation link stays valid.
 *
 * Twenty-four hours, against the reset token's one. The threat is different: a reset link left in an
 * unattended inbox is an account takeover waiting to happen, so it expires fast. The worst a stale
 * confirmation link can do is mark an address confirmed that was already confirmed by receiving it.
 * Expiring these in an hour would instead punish the ordinary case - someone who registers in the
 * evening and reads their email the next morning - and every one of those becomes a support request.
 */
export const VERIFICATION_TOKEN_TTL_HOURS = 24;

/** A freshly minted token: the secret to email, and the hash to store. */
export interface VerificationTokenPair {
  /** Goes in the emailed URL. Never persisted. */
  token: string;
  /** Goes in the database. Cannot be turned back into the token. */
  tokenHash: string;
}

/**
 * Mints a confirmation token.
 *
 * base64url rather than hex: same entropy in a third fewer characters, and no `+` or `/` for a mail
 * client to mangle when it wraps or re-encodes the link.
 */
export function createVerificationToken(): VerificationTokenPair {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  return { token, tokenHash: hashVerificationToken(token) };
}

/**
 * Hashes a token for storage and for lookup.
 *
 * SHA-256, not bcrypt, for the same reason as the reset token: this value came from a CSPRNG with
 * 256 bits of entropy, so there is nothing to brute-force and slowness buys nothing - while a fast,
 * deterministic hash keeps redemption a single indexed probe rather than a scan comparing digests
 * one row at a time.
 */
export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** When a token minted now should stop working. */
export function verificationTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + VERIFICATION_TOKEN_TTL_HOURS * 3_600_000);
}

/**
 * Why a token cannot be used, or `null` if it can be.
 *
 * `stale` is the case a reset token does not have: the address the link was minted for is no longer
 * the address on the account. Without this check, someone could change their email to one they do
 * not control and then click an older link to have the new address marked confirmed - the token
 * would be unspent, unexpired, and pointed at the wrong claim.
 */
export type VerificationTokenRejection = "expired" | "used" | "stale";

interface StoredVerificationToken {
  email: string;
  expiresAt: Date;
  usedAt: Date | null;
}

/**
 * Validates a stored token against the account's current address.
 *
 * Order is deliberate. `used` is reported ahead of `expired` because a replayed link is the more
 * informative of the two when investigating, and `stale` is checked last so a spent token is never
 * described in terms of an address mismatch it also happens to have.
 *
 * Addresses are compared case-insensitively after trimming. Local parts are technically
 * case-sensitive per RFC 5321, but no mainstream provider treats them that way, and rejecting a
 * confirmation because the account stores `Ali@example.com` against a token minted for
 * `ali@example.com` would be a bug in every real deployment.
 */
export function checkVerificationToken(
  stored: StoredVerificationToken,
  currentEmail: string,
  now: Date = new Date()
): VerificationTokenRejection | null {
  if (stored.usedAt) {
    return "used";
  }

  if (stored.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }

  if (normaliseEmail(stored.email) !== normaliseEmail(currentEmail)) {
    return "stale";
  }

  return null;
}

/** Trimmed and lowercased, for comparison only - never for storage. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The absolute URL to email.
 *
 * Built from the configured origin rather than from request headers. A `Host` header is attacker
 * controlled, and while a confirmation token is worth far less than a reset token, a link that
 * carries any credential must never be pointed at a host someone else chose.
 */
export function verifyEmailUrl(origin: string, token: string): string {
  const url = new URL("/verify-email", origin);

  url.searchParams.set("token", token);

  return url.toString();
}
