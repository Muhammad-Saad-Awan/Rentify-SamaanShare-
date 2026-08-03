/**
 * Fixed-window rate limiting, held in process memory.
 *
 * WHAT THIS IS AND IS NOT
 * ----------------------
 * This is a real mitigation for casual abuse - credential stuffing from one host,
 * a script hammering the wishlist, someone looping unindexed search queries - and
 * it is NOT a distributed rate limiter.
 *
 * The counters live in the memory of one server instance. On a platform that runs
 * several instances, or that recycles them, the effective limit is the configured
 * limit multiplied by the number of live instances, and it resets on every cold
 * start. An attacker who can spread requests across instances gets proportionally
 * more attempts.
 *
 * That is a deliberate trade against the alternative of adding a Redis dependency
 * and a second piece of infrastructure to operate. The upgrade path is a shared
 * store - `@upstash/ratelimit` on Vercel KV is the usual choice - and only this
 * file needs to change: callers see the same `checkRateLimit` signature.
 *
 * A fixed window rather than a sliding one, for the same reason: a window boundary
 * lets through up to 2x the limit across two adjacent windows, which is acceptable
 * for the abuse this is stopping and needs no per-request timestamp list.
 */

interface Bucket {
  count: number;
  /** Epoch milliseconds at which this window ends. */
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Ceiling on tracked keys, so a flood of unique keys cannot grow the map without
 * bound. Reaching it is itself a signal of abuse - the map is dropped entirely
 * rather than evicted one entry at a time, which costs the current windows but is
 * O(1) and cannot be gamed into keeping a hot key alive.
 */
const MAX_TRACKED_KEYS = 20_000;

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the window resets. `0` when the request is allowed. */
  retryAfterSeconds: number;
}

export interface RateLimitOptions {
  /** Requests permitted per window. */
  limit: number;
  windowMs: number;
}

/**
 * Records an attempt against `key` and reports whether it is permitted.
 *
 * Counts the attempt even when it is rejected, so sustained hammering keeps the
 * window closed rather than letting one request through per expiry.
 *
 * `key` must include the action name as well as the identity - `"login:1.2.3.4"`,
 * not `"1.2.3.4"` - or unrelated endpoints share one budget and a user who saved
 * ten listings can no longer sign in.
 */
export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions
): RateLimitResult {
  const now = Date.now();

  if (buckets.size > MAX_TRACKED_KEYS) {
    buckets.clear();
  }

  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });

    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return {
      allowed: false,
      // Rounded up, so a caller echoing this in a message never says "0 seconds".
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.resetAt - now) / 1000)
      ),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Best-effort client IP from request headers.
 *
 * `x-forwarded-for` is a comma-separated chain and the LEFTMOST entry is the
 * original client - later entries are the proxies. It is also client-supplied and
 * therefore spoofable unless a trusted proxy overwrites it, which is what Vercel
 * and most managed platforms do. Behind an untrusted proxy this degrades to
 * limiting per forged value, so IP-keyed limits are a speed bump, not an identity
 * check. Anything keyed on a real user id (`getActiveUser`) is not affected.
 *
 * Falls back to a shared bucket rather than to "unlimited": if no IP can be
 * determined, requests share one window, which fails closed.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");

  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();

    if (first) {
      return first;
    }
  }

  return headers.get("x-real-ip")?.trim() ?? "unknown";
}
