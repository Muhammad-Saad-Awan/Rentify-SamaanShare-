import { describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "@/config/env.schema";

/**
 * Environment validation.
 *
 * Tested through `env.schema.ts`, which is pure. The loaders in `env.ts` and `env.public.ts` parse
 * `process.env` at import and throw on a bad environment - so importing either of those to check
 * that a 31-character `AUTH_SECRET` is rejected would first require a complete, valid,
 * secret-bearing environment to exist. That is the whole reason the rules live in their own module.
 *
 * What matters here is the required/optional line. Too strict and nobody can run the project
 * without four third-party accounts; too loose and a missing secret ships to production and
 * surfaces as a mystery 500. Each case below is one side of that line.
 */

/** The smallest environment that should boot. */
const minimal = {
  DATABASE_URL: "postgresql://user:pass@host:5432/db",
  AUTH_SECRET: "x".repeat(32),
};

describe("parseServerEnv", () => {
  it("accepts the minimum viable environment", () => {
    const result = parseServerEnv(minimal);

    expect(result.success).toBe(true);
  });

  it("reports every missing required variable at once", () => {
    const result = parseServerEnv({});

    expect(result.success).toBe(false);

    if (result.success) {
      return;
    }

    // One at a time turns configuring a deployment into redeploy-and-see.
    expect(result.errors.join(" ")).toContain("DATABASE_URL");
    expect(result.errors.join(" ")).toContain("AUTH_SECRET");
  });

  it("rejects a non-PostgreSQL DATABASE_URL", () => {
    const result = parseServerEnv({
      ...minimal,
      DATABASE_URL: "mysql://a@b/c",
    });

    expect(result.success).toBe(false);
  });

  it("accepts both postgres:// and postgresql:// schemes", () => {
    for (const url of [
      "postgres://u:p@h:5432/d",
      "postgresql://u:p@h:5432/d",
    ]) {
      expect(parseServerEnv({ ...minimal, DATABASE_URL: url }).success).toBe(
        true
      );
    }
  });

  /**
   * A short signing key is a forgeable session cookie, which is the entire security model of the
   * JWT strategy - so this is a real check, not a style rule.
   */
  it("rejects an AUTH_SECRET shorter than 32 characters", () => {
    const result = parseServerEnv({ ...minimal, AUTH_SECRET: "x".repeat(31) });

    expect(result.success).toBe(false);

    if (!result.success) {
      expect(result.errors.join(" ")).toContain("AUTH_SECRET");
    }
  });

  /**
   * The case that motivated the filter. A platform's dashboard records a cleared field as `""`,
   * which satisfies `.optional()` and would then be handed to a provider as a real credential -
   * producing an opaque third-party error instead of "this is not configured".
   */
  it("treats an empty string as absent, not as a present-but-blank secret", () => {
    const result = parseServerEnv({
      ...minimal,
      RESEND_API_KEY: "",
      AUTH_GOOGLE_ID: "",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.RESEND_API_KEY).toBeUndefined();
      expect(result.data.AUTH_GOOGLE_ID).toBeUndefined();
    }
  });

  /**
   * The case that produced a real 500 after A3 landed.
   *
   * Neon's copy button emits `DATABASE_URL='postgresql://...'`, and whether those quotes survive
   * into `process.env` depends on which loader ran first. Here they did, so the scheme check failed
   * and every page returned "Invalid server environment variables". A validator has to accept the
   * input people actually produce.
   */
  it("strips surrounding single quotes", () => {
    const result = parseServerEnv({
      ...minimal,
      DATABASE_URL: "'postgresql://user:pass@host:5432/db'",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.DATABASE_URL).toBe(
        "postgresql://user:pass@host:5432/db"
      );
    }
  });

  it("strips surrounding double quotes", () => {
    expect(
      parseServerEnv({
        ...minimal,
        DATABASE_URL: '"postgresql://user:pass@host:5432/db"',
      }).success
    ).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(
      parseServerEnv({
        ...minimal,
        DATABASE_URL: "  postgresql://user:pass@host:5432/db  ",
      }).success
    ).toBe(true);
  });

  /** Only a matching pair is removed, so a value that merely contains a quote is untouched. */
  it("leaves an unmatched quote alone", () => {
    const result = parseServerEnv({
      ...minimal,
      AUTH_SECRET: `'${"x".repeat(40)}`,
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.AUTH_SECRET.startsWith("'")).toBe(true);
    }
  });

  it("treats a quoted empty string as absent", () => {
    const result = parseServerEnv({ ...minimal, RESEND_API_KEY: "''" });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.RESEND_API_KEY).toBeUndefined();
    }
  });

  it("keeps the third-party integrations optional", () => {
    // Cloudinary, Google and Resend each degrade honestly when absent, so requiring them would
    // mean nobody could run the project locally.
    expect(parseServerEnv(minimal).success).toBe(true);
  });

  it("defaults EMAIL_FROM to Resend's testing sender", () => {
    const result = parseServerEnv(minimal);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.EMAIL_FROM).toContain("resend.dev");
    }
  });

  it("accepts EMAIL_FROM as a bare address or with a display name", () => {
    for (const from of [
      "no-reply@samaanshare.pk",
      "SamaanShare <no-reply@samaanshare.pk>",
    ]) {
      expect(parseServerEnv({ ...minimal, EMAIL_FROM: from }).success).toBe(
        true
      );
    }
  });

  it("rejects a malformed EMAIL_FROM", () => {
    for (const from of ["not-an-address", "Name <not-an-address>"]) {
      expect(parseServerEnv({ ...minimal, EMAIL_FROM: from }).success).toBe(
        false
      );
    }
  });

  it("rejects a relative AUTH_URL", () => {
    expect(parseServerEnv({ ...minimal, AUTH_URL: "/api/auth" }).success).toBe(
      false
    );
  });
});

describe("parsePublicEnv", () => {
  it("defaults the app URL for local development", () => {
    const result = parsePublicEnv({});

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    }
  });

  /**
   * A trailing slash produces `https://host//listings` once joined, which a crawler treats as a
   * different URL to the canonical one - so it is stripped rather than tolerated.
   */
  it("strips trailing slashes", () => {
    const result = parsePublicEnv({
      NEXT_PUBLIC_APP_URL: "https://samaanshare.pk///",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.NEXT_PUBLIC_APP_URL).toBe("https://samaanshare.pk");
    }
  });

  it("rejects a non-absolute app URL", () => {
    expect(
      parsePublicEnv({ NEXT_PUBLIC_APP_URL: "samaanshare.pk" }).success
    ).toBe(false);
  });
});
