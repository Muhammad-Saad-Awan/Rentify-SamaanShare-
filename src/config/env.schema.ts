import { z } from "zod";

/**
 * The environment *rules*, with no side effects.
 *
 * WHY THIS IS SEPARATE FROM `env.ts`. That module parses `process.env` at import and throws on a
 * bad environment, which is exactly what you want at startup and exactly what you do not want in a
 * test: importing it to check that a 31-character `AUTH_SECRET` is rejected would first require a
 * complete, valid, secret-bearing environment to exist. Keeping the schema pure means the rules can
 * be asserted on their own, the same split every other testable module in this codebase uses.
 *
 * Nothing here reads `process.env`. The two loaders do that and hand the result in.
 *
 * REQUIRED VS OPTIONAL is a deliberate line. `DATABASE_URL` and `AUTH_SECRET` are required because
 * nothing works without them. Cloudinary, Google and Resend are optional because the app already
 * degrades honestly without each one: no Google button is rendered, no password-reset link is
 * offered, and uploads throw at the point of use naming the variables. Requiring them would mean
 * nobody could run the project locally without four third-party accounts.
 */

/** A value that must be present and non-trivial, with a message naming what to do about it. */
const requiredSecret = (name: string, minLength = 1) =>
  z
    .string({ message: `${name} is required. See .env.example.` })
    .min(minLength, `${name} must be at least ${minLength} characters.`);

export const serverEnvSchema = z.object({
  // ---------------------------------------------------------------- required
  DATABASE_URL: requiredSecret("DATABASE_URL").refine(
    (value) =>
      value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "DATABASE_URL must be a PostgreSQL connection string."
  ),

  /**
   * Auth.js signing key.
   *
   * 32 characters is the floor Auth.js itself recommends. A short secret is a forgeable session
   * cookie, which is the entire security model of the JWT strategy - so this is a real check, not a
   * style rule.
   */
  AUTH_SECRET: requiredSecret("AUTH_SECRET", 32),

  // ---------------------------------------------------------------- optional
  /**
   * Direct (unpooled) connection, used by migrations and the seed scripts.
   *
   * Optional because the app itself never needs it - only the tooling does, and that tooling
   * already falls back to `DATABASE_URL`.
   */
  DIRECT_URL: z.string().optional(),

  AUTH_URL: z.string().url("AUTH_URL must be an absolute URL.").optional(),

  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  /** Resend API key. Absent means no transactional email, and no password reset offered. */
  RESEND_API_KEY: z.string().optional(),

  /**
   * The From address on outbound mail.
   *
   * Must be on a domain verified with Resend, or delivery fails at send time with a provider error.
   * Defaulted to Resend's shared testing sender so a developer with only an API key can exercise
   * the flow - that sender delivers only to the account owner's own address, which is precisely why
   * it is unsuitable for anything but local use.
   */
  EMAIL_FROM: z
    .string()
    .email(
      "EMAIL_FROM must be an email address, optionally as 'Name <a@b.com>'."
    )
    .or(
      // Resend accepts a display name; validate the address inside the angle brackets.
      z
        .string()
        .regex(
          /^[^<>]+<[^@<>\s]+@[^@<>\s]+\.[^@<>\s]+>$/,
          "EMAIL_FROM must be an email address, optionally as 'Name <a@b.com>'."
        )
    )
    .default("SamaanShare <onboarding@resend.dev>"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Public variables - the ones that exist in a browser bundle.
 *
 * Kept in the same file as the server schema because they are the same concern, but loaded by a
 * different module: only `NEXT_PUBLIC_*` names survive into the client, so a loader that validated
 * both sets would throw the moment a Client Component imported it.
 */
export const publicEnvSchema = z.object({
  /**
   * The site's own origin, used for absolute URLs in metadata, the sitemap and email links.
   *
   * Defaulted rather than required: local development should not need a `.env` entry to boot.
   */
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url(
      "NEXT_PUBLIC_APP_URL must be an absolute URL, e.g. https://samaanshare.pk"
    )
    .default("http://localhost:3000")
    // A trailing slash produces `https://host//listings` once joined, which a crawler treats as a
    // different URL to the canonical one.
    .transform((value) => value.replace(/\/+$/, "")),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export type ParseResult<T> =
  { success: true; data: T } | { success: false; errors: string[] };

/**
 * Runs a schema over a candidate environment, collecting every problem.
 *
 * Empty strings are dropped before validation. That is how a hosting platform's dashboard records
 * "I cleared this field", and an empty string satisfies `.optional()` - so without this, a blank
 * `RESEND_API_KEY` would be handed to the provider as a real credential and produce an opaque
 * third-party error instead of "this is not configured".
 */
function parseWith<T>(
  schema: z.ZodType<T>,
  source: Record<string, string | undefined>
): ParseResult<T> {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(
      ([, value]) => value !== undefined && value !== ""
    )
  );

  const result = schema.safeParse(cleaned);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`
    ),
  };
}

export function parseServerEnv(
  source: Record<string, string | undefined>
): ParseResult<ServerEnv> {
  return parseWith(serverEnvSchema, source);
}

export function parsePublicEnv(
  source: Record<string, string | undefined>
): ParseResult<PublicEnv> {
  return parseWith(publicEnvSchema, source);
}
