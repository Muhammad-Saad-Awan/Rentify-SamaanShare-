import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkRateLimit, clientIpFrom } from "@/lib/rate-limit";

/**
 * The rate limiter, measured against what its own documentation claims.
 *
 * WHY THIS FILE DID NOT EXIST UNTIL NOW. Every other pure module in this project is unit-tested -
 * the parsers, the pricing, the lifecycle table - and this one, which decides whether a login
 * attempt is allowed, was not. Its behaviour was described in a long comment and asserted by
 * nothing. Each test below corresponds to a sentence in that comment, so the two can no longer
 * drift apart quietly.
 *
 * EVERY TEST USES A UNIQUE KEY. The bucket map is module state shared across the whole file, so
 * reusing a key would make one test's window another's starting condition - and the failure would
 * look like a limiter bug rather than a test bug.
 */

let keySeed = 0;

/** A key nothing else in this file will touch. */
function uniqueKey(name: string): string {
  keySeed += 1;

  return `${name}:${keySeed}`;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows exactly the configured limit, then refuses", () => {
    const key = uniqueKey("allow-then-refuse");
    const options = { limit: 3, windowMs: 60_000 };

    expect(checkRateLimit(key, options).allowed).toBe(true);
    expect(checkRateLimit(key, options).allowed).toBe(true);
    expect(checkRateLimit(key, options).allowed).toBe(true);

    const refused = checkRateLimit(key, options);

    expect(refused.allowed).toBe(false);
    // Rounded up, so a caller echoing this never tells someone to wait "0 seconds".
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  /**
   * The comment says rejected attempts are counted too, "so sustained hammering keeps the window
   * closed rather than letting one request through per expiry". This is what that means in
   * practice: hammering does not earn a slot back.
   */
  it("counts refused attempts, so hammering does not reopen the window", () => {
    const key = uniqueKey("hammering");
    const options = { limit: 2, windowMs: 60_000 };

    checkRateLimit(key, options);
    checkRateLimit(key, options);

    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(checkRateLimit(key, options).allowed).toBe(false);
    }

    // Still refused right up to the boundary, rather than leaking one per tick.
    vi.advanceTimersByTime(59_000);
    expect(checkRateLimit(key, options).allowed).toBe(false);
  });

  it("reopens once the window has passed", () => {
    const key = uniqueKey("reopen");
    const options = { limit: 1, windowMs: 60_000 };

    expect(checkRateLimit(key, options).allowed).toBe(true);
    expect(checkRateLimit(key, options).allowed).toBe(false);

    vi.advanceTimersByTime(60_001);

    expect(checkRateLimit(key, options).allowed).toBe(true);
  });

  /**
   * THE FIXED-WINDOW BURST, measured rather than assumed - and the measurement corrected one
   * thing the module's own comment leaves out.
   *
   * The comment says "a window boundary lets through up to 2x the limit across two adjacent
   * windows". That total is right. What it does not say is that the window is anchored to the
   * FIRST REQUEST FOR THAT KEY, not to a wall clock: a quiet key has no window to sit at the end
   * of, so the burst needs one earlier request to open it. Writing this test the other way round
   * measured 5 and looked like a limiter bug until the anchoring explained it.
   *
   * So the operationally interesting number for `limit` 5 is NINE requests inside a tenth of a
   * second - one to open the window, four at its end, five as it rolls over. That is the price of
   * a fixed window, and it is only an acceptable price while somebody has looked at it.
   */
  it("lets through nearly twice the limit in a moment, around a boundary", () => {
    const key = uniqueKey("boundary-burst");
    const options = { limit: 5, windowMs: 60_000 };

    // One request opens the window. Alone, and long before the burst.
    expect(checkRateLimit(key, options).allowed).toBe(true);

    let burst = 0;

    // Four more at the very end of that window.
    vi.advanceTimersByTime(59_900);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (checkRateLimit(key, options).allowed) {
        burst += 1;
      }
    }

    // A tenth of a second later the window has rolled, and the budget is whole again.
    vi.advanceTimersByTime(101);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (checkRateLimit(key, options).allowed) {
        burst += 1;
      }
    }

    expect(
      burst,
      "requests admitted within ~101ms of each other, against a limit of five per minute"
    ).toBe(9);
  });

  /**
   * THE OVERFLOW CLEAR, and the thing it costs.
   *
   * At `MAX_TRACKED_KEYS` the map is dropped entirely rather than evicted entry by entry. The
   * comment defends that as O(1) and says it "cannot be gamed into keeping a hot key alive" -
   * which is true, and is not the whole story. Dropping every bucket also drops the bucket of
   * whoever is being limited, so filling the map RESETS an active limit rather than preserving it.
   *
   * Measured here so the trade is a known one. In practice reaching 20,001 keys needs that many
   * distinct key values, and keys are `action:ip` on a platform that overwrites the forwarded
   * address - so it takes a botnet, by which point a per-IP limit has already stopped being the
   * control that matters. Worth knowing, not worth alarm.
   */
  it("drops an active limit when the key ceiling is passed", () => {
    const victim = uniqueKey("ceiling-victim");
    const options = { limit: 1, windowMs: 600_000 };

    expect(checkRateLimit(victim, options).allowed).toBe(true);
    expect(checkRateLimit(victim, options).allowed).toBe(false);

    // Past the 20,000-key ceiling, which clears every bucket including the one above.
    for (let filler = 0; filler < 20_001; filler += 1) {
      checkRateLimit(`ceiling-filler:${filler}`, options);
    }

    expect(
      checkRateLimit(victim, options).allowed,
      "a limited key is allowed again once the map has been cleared"
    ).toBe(true);
  });

  it("keeps separate budgets per key", () => {
    const login = uniqueKey("login");
    const saved = uniqueKey("saved");
    const options = { limit: 1, windowMs: 60_000 };

    expect(checkRateLimit(login, options).allowed).toBe(true);
    expect(checkRateLimit(login, options).allowed).toBe(false);

    /**
     * The reason the module insists a key carries its action as well as an identity: sharing one
     * budget would mean somebody who saved ten listings could no longer sign in.
     */
    expect(checkRateLimit(saved, options).allowed).toBe(true);
  });
});

describe("clientIpFrom", () => {
  it("takes the leftmost forwarded entry, which is the original client", () => {
    const headers = new Headers({
      "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178",
    });

    expect(clientIpFrom(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe(
      "203.0.113.9"
    );
  });

  /**
   * FAILS CLOSED. With no usable header every caller shares one bucket, which throttles everyone
   * rather than letting everyone through - the right direction to fail in for a limiter.
   */
  it("shares one bucket when no address can be determined", () => {
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});
