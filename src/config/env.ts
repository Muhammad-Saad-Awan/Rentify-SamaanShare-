import { parseServerEnv } from "@/config/env.schema";

import type { ServerEnv } from "@/config/env.schema";

/**
 * The validated server environment.
 *
 * WHAT THIS BUYS. Before this existed, a missing `CLOUDINARY_API_SECRET` surfaced when the first
 * person tried to upload a photo, and a malformed `DATABASE_URL` surfaced on the first query. Both
 * are deployment mistakes that should be impossible to deploy rather than incidents to diagnose.
 * Parsing at module load turns them into a startup failure that names every missing key at once.
 *
 * The rules themselves live in `env.schema.ts`, which is pure. This module is the side effect: it
 * reads `process.env`, throws if the environment is wrong, and exports the result.
 *
 * SERVER ONLY - see the guard below.
 */

/**
 * Fails fast if this module reaches a browser bundle.
 *
 * Unprefixed variables do not exist in the browser, so a client import would fail validation with a
 * confusing complaint about secrets that were never going to be there. This says the actual problem
 * instead.
 *
 * The `server-only` package exists for exactly this and would make it a build-time error rather than
 * a first-render one, but it is not a dependency here and one file does not justify adding it. Use
 * `env.public.ts` for anything the browser needs.
 */
if (typeof window !== "undefined") {
  throw new Error(
    "src/config/env.ts is server-only and was imported into a client bundle. Use @/config/env.public for values the browser needs."
  );
}

function loadServerEnv(): ServerEnv {
  const parsed = parseServerEnv(process.env);

  if (!parsed.success) {
    // Every problem at once. Reporting one at a time turns configuring a deployment into a guessing
    // game of redeploy-and-see.
    throw new Error(
      `Invalid server environment variables:\n  ${parsed.errors.join("\n  ")}\n\nCopy .env.example to .env.local and fill in the missing values.`
    );
  }

  return parsed.data;
}

export const env = loadServerEnv();

/**
 * Whether transactional email is configured.
 *
 * Mirrors `isGoogleEnabled()` deliberately, and the pattern matters: an unconfigured integration is
 * not an error, it is a feature that is not offered. So the "Forgot password?" link is not rendered
 * at all, rather than leading to a form that accepts an address and silently sends nothing.
 */
export function isEmailEnabled(): boolean {
  return Boolean(env.RESEND_API_KEY);
}

/** Whether Cloudinary uploads are configured. */
export function isCloudinaryEnabled(): boolean {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET
  );
}
