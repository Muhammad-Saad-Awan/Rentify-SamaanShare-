import { env } from "@/config/env";

/**
 * Which optional providers are actually usable in this environment.
 *
 * Server-only: it reads unprefixed env vars, which are absent in the browser.
 * A Client Component must receive the result as a prop from a Server Component
 * rather than calling this itself - see `src/app/(auth)/login/page.tsx`.
 */

/**
 * True when Google OAuth is fully configured.
 *
 * Registering the Google provider with an empty client ID does not fail at
 * boot - it fails at the point someone clicks "Continue with Google", with an
 * opaque provider-side error. Gating on both variables means the same code runs
 * with or without keys: no Google provider is registered and no Google button
 * is rendered until the credentials exist.
 *
 * Auth.js infers `clientId`/`clientSecret` from `AUTH_GOOGLE_ID` and
 * `AUTH_GOOGLE_SECRET` automatically, so those names are load-bearing.
 */
export function isGoogleEnabled(): boolean {
  return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
}
