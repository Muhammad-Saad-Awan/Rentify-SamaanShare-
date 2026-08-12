import { describe, expect, it } from "vitest";

import {
  checkResetToken,
  createResetToken,
  hashResetToken,
  RESET_TOKEN_TTL_MINUTES,
  resetPasswordUrl,
  resetTokenExpiry,
  safeHashEquals,
} from "@/lib/auth/password-reset";

/**
 * Password reset token mechanics.
 *
 * A reset link is a bearer credential: whoever holds it owns the account. So the properties asserted
 * here are security properties, not conveniences - that the token is never recoverable from what is
 * stored, that a spent or expired one is refused, and that the emailed URL cannot be pointed at a
 * host an attacker chose.
 */

describe("createResetToken", () => {
  it("never returns the token as its own hash", () => {
    const { token, tokenHash } = createResetToken();

    // The whole point of storing a hash: a database dump must not yield usable links.
    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toBe(hashResetToken(token));
  });

  it("produces a URL-safe token", () => {
    for (let i = 0; i < 20; i += 1) {
      // base64url, so no `+` or `/` for a mail client to mangle and nothing needing escaping.
      expect(createResetToken().token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("produces a token the validation schema will accept", () => {
    // 32 bytes as base64url is 43 characters, inside the schema's 20-200 window.
    const { token } = createResetToken();

    expect(token.length).toBeGreaterThanOrEqual(20);
    expect(token.length).toBeLessThanOrEqual(200);
  });

  it("does not repeat", () => {
    const seen = new Set(
      Array.from({ length: 200 }, () => createResetToken().token)
    );

    expect(seen.size).toBe(200);
  });
});

describe("hashResetToken", () => {
  it("is deterministic, so a token can be looked up by its hash", () => {
    // Unsalted on purpose: the lookup has to find the row from the token alone.
    expect(hashResetToken("abc")).toBe(hashResetToken("abc"));
  });

  it("produces a full-length SHA-256 hex digest", () => {
    expect(hashResetToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("separates tokens differing by one character", () => {
    expect(hashResetToken("abc")).not.toBe(hashResetToken("abd"));
  });
});

describe("resetTokenExpiry", () => {
  it("is exactly the TTL ahead of the given instant", () => {
    const now = new Date("2026-08-12T10:00:00.000Z");

    expect(resetTokenExpiry(now).getTime() - now.getTime()).toBe(
      RESET_TOKEN_TTL_MINUTES * 60_000
    );
  });
});

describe("checkResetToken", () => {
  const now = new Date("2026-08-12T10:00:00.000Z");
  const minutes = (m: number) => new Date(now.getTime() + m * 60_000);

  it("accepts an unspent token inside its window", () => {
    expect(
      checkResetToken({ expiresAt: minutes(30), usedAt: null }, now)
    ).toBeNull();
  });

  it("rejects a token at the moment it expires", () => {
    // At the boundary the link is dead: `<=`, not `<`.
    expect(checkResetToken({ expiresAt: now, usedAt: null }, now)).toBe(
      "expired"
    );
  });

  it("rejects an expired token", () => {
    expect(checkResetToken({ expiresAt: minutes(-1), usedAt: null }, now)).toBe(
      "expired"
    );
  });

  /** Single use is the strongest protection here - a leaked link must not be replayable. */
  it("rejects a spent token even while still inside its window", () => {
    expect(
      checkResetToken({ expiresAt: minutes(30), usedAt: minutes(-5) }, now)
    ).toBe("used");
  });

  it("reports a spent-and-expired token as spent", () => {
    // The more informative of the two when investigating a replayed link.
    expect(
      checkResetToken({ expiresAt: minutes(-10), usedAt: minutes(-20) }, now)
    ).toBe("used");
  });
});

describe("safeHashEquals", () => {
  it("matches identical digests", () => {
    const hash = hashResetToken("x");

    expect(safeHashEquals(hash, hash)).toBe(true);
  });

  it("rejects different digests of the same length", () => {
    expect(safeHashEquals(hashResetToken("x"), hashResetToken("y"))).toBe(
      false
    );
  });

  it("returns false rather than throwing on a length mismatch", () => {
    // `timingSafeEqual` throws on unequal lengths, which would itself be a signal.
    expect(safeHashEquals("abc", "abcd")).toBe(false);
  });
});

describe("resetPasswordUrl", () => {
  it("builds an absolute link carrying the token", () => {
    const url = resetPasswordUrl("https://samaanshare.pk", "tok123");

    expect(url).toBe("https://samaanshare.pk/reset-password?token=tok123");
  });

  it("percent-encodes a token with URL-significant characters", () => {
    // base64url never produces these, but the function must not be the weak link if that changes.
    expect(resetPasswordUrl("https://a.pk", "a&b=c")).toContain(
      "token=a%26b%3Dc"
    );
  });

  /**
   * The origin comes from configuration, never from a request header. A `Host` header is attacker
   * controlled, and a reset link is the last thing that should point at a host someone else chose.
   */
  it("uses the given origin and ignores any path on it", () => {
    expect(resetPasswordUrl("https://samaanshare.pk/anything", "t")).toBe(
      "https://samaanshare.pk/reset-password?token=t"
    );
  });
});
