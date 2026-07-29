import bcrypt from "bcryptjs";

/**
 * Password hashing. Node runtime only - `bcryptjs` cannot run on the Edge, so
 * nothing that reaches `src/middleware.ts` may import this file.
 *
 * WHY bcryptjs AND NOT bcrypt
 * ---------------------------
 * `bcrypt` is a native addon needing a compile step per platform, which is
 * fragile on Vercel. `bcryptjs` is pure JavaScript: slower, but portable and
 * dependency-free.
 */

/**
 * bcrypt work factor. Each increment doubles the work.
 *
 * Measured on this machine with bcryptjs 3.0.3:
 *   cost 10 -> ~130ms    cost 11 -> ~240ms    cost 12 -> ~465ms
 *
 * 12 matches current OWASP guidance and is only paid on login and
 * registration, never on a page render. Serverless CPU is slower than local, so
 * budget roughly double in production.
 *
 * The cost is embedded in the hash string, so raising this later does not
 * invalidate existing hashes - old passwords keep verifying at their original
 * cost and can be transparently re-hashed on next successful login.
 */
const BCRYPT_COST = 12;

/**
 * A real bcrypt hash of a random 32-byte value that no password will ever match.
 *
 * Used to burn the same CPU time when there is nothing to compare against, so
 * "no such email", "OAuth-only account" and "wrong password" all take about as
 * long. Without it, login latency alone reveals which emails are registered.
 *
 * Hardcoded rather than generated at import: computing it would add ~465ms to
 * cold start, and it needs no secrecy - it is a hash of a value nobody knows.
 */
const TIMING_EQUALISER_HASH =
  "$2b$12$SB1QRTjLe3HJIcjEnemwHuVKnc.iCIj1lFCO1L5ZGEv5VWcA5yYMC";

/** Hashes a plaintext password for storage in `User.password`. */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

/**
 * Checks a plaintext password against a stored hash.
 *
 * Pass `null` when the account does not exist or has no password (an
 * OAuth-only user). It still performs a full comparison and then returns
 * `false`, which keeps the response time indistinguishable from a wrong
 * password. Callers must not short-circuit around this.
 */
export async function verifyPassword(
  plaintext: string,
  hash: string | null | undefined
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(plaintext, TIMING_EQUALISER_HASH);
    return false;
  }

  return bcrypt.compare(plaintext, hash);
}
