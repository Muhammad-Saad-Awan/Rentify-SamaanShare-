import { describe, expect, it } from "vitest";

import {
  checkVerificationToken,
  createVerificationToken,
  hashVerificationToken,
  normaliseEmail,
  VERIFICATION_TOKEN_TTL_HOURS,
  verificationTokenExpiry,
  verifyEmailUrl,
} from "@/lib/auth/email-verification";

/**
 * Email confirmation token mechanics.
 *
 * The load-bearing assertions are that the token never appears in storable form, that a spent one
 * cannot be replayed, and that a link cannot confirm an address it was not minted for.
 */

const HOUR_MS = 3_600_000;

describe("createVerificationToken", () => {
  it("never returns the token as its own hash", () => {
    const { token, tokenHash } = createVerificationToken();

    expect(tokenHash).not.toBe(token);
    expect(tokenHash).toBe(hashVerificationToken(token));
  });

  it("mints a distinct token every time", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => createVerificationToken().token)
    );

    expect(tokens.size).toBe(50);
  });

  /** base64url: no `+` or `/` for a mail client to mangle when it re-encodes the link. */
  it("is URL-safe", () => {
    for (let i = 0; i < 20; i += 1) {
      expect(createVerificationToken().token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("hashVerificationToken", () => {
  it("is deterministic, so lookup is a single indexed probe", () => {
    expect(hashVerificationToken("abc")).toBe(hashVerificationToken("abc"));
  });

  it("produces a hex sha-256 digest", () => {
    expect(hashVerificationToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("verificationTokenExpiry", () => {
  /**
   * Twenty-four hours, against the reset token's one. The worst a stale confirmation link can do is
   * confirm an address that receiving it already confirmed; expiring in an hour would punish anyone
   * who registers in the evening and reads their email the next morning.
   */
  it("is a day out", () => {
    const now = new Date("2026-08-17T10:00:00.000Z");

    expect(verificationTokenExpiry(now).getTime() - now.getTime()).toBe(
      VERIFICATION_TOKEN_TTL_HOURS * HOUR_MS
    );
  });
});

describe("checkVerificationToken", () => {
  const email = "ali@example.com";
  const now = new Date("2026-08-17T10:00:00.000Z");
  const fresh = {
    email,
    expiresAt: new Date(now.getTime() + HOUR_MS),
    usedAt: null,
  };

  it("accepts a fresh, unspent token for the current address", () => {
    expect(checkVerificationToken(fresh, email, now)).toBeNull();
  });

  it("refuses a spent token", () => {
    expect(
      checkVerificationToken({ ...fresh, usedAt: new Date() }, email, now)
    ).toBe("used");
  });

  it("refuses an expired token", () => {
    expect(
      checkVerificationToken(
        { ...fresh, expiresAt: new Date(now.getTime() - 1) },
        email,
        now
      )
    ).toBe("expired");
  });

  it("treats the boundary as expired", () => {
    expect(
      checkVerificationToken({ ...fresh, expiresAt: now }, email, now)
    ).toBe("expired");
  });

  /**
   * THE ONE A RESET TOKEN DOES NOT NEED.
   *
   * Without it, changing an email to an address you do not control and then clicking an older link
   * would mark the new address confirmed - the token being unspent, unexpired, and pointed at a
   * claim it was never minted for.
   */
  it("refuses a token minted for a different address", () => {
    expect(checkVerificationToken(fresh, "someone-else@example.com", now)).toBe(
      "stale"
    );
  });

  it("reports a spent token as spent even when it is also stale", () => {
    expect(
      checkVerificationToken(
        { ...fresh, usedAt: new Date() },
        "someone-else@example.com",
        now
      )
    ).toBe("used");
  });

  /** No mainstream provider treats local parts as case-sensitive, and rejecting on case would break every real deployment. */
  it("compares addresses case-insensitively and ignoring surrounding space", () => {
    expect(
      checkVerificationToken(fresh, "  Ali@Example.COM  ", now)
    ).toBeNull();
  });
});

describe("normaliseEmail", () => {
  it("trims and lowercases", () => {
    expect(normaliseEmail("  Ali@Example.COM ")).toBe("ali@example.com");
  });
});

describe("verifyEmailUrl", () => {
  it("builds an absolute link carrying the token", () => {
    const url = verifyEmailUrl("https://samaanshare.pk", "tok-123");

    expect(url).toBe("https://samaanshare.pk/verify-email?token=tok-123");
  });

  /**
   * Built from the configured origin, never from a request header. A `Host` header is attacker
   * controlled, and a link carrying any credential must not point at a host someone else chose.
   */
  it("keeps the configured origin", () => {
    expect(verifyEmailUrl("https://staging.example.com", "t")).toContain(
      "https://staging.example.com/"
    );
  });

  it("escapes a token that would otherwise break the query string", () => {
    const url = new URL(verifyEmailUrl("https://x.test", "a b&c=d"));

    expect(url.searchParams.get("token")).toBe("a b&c=d");
  });
});
