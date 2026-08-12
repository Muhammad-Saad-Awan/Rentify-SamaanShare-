import { parsePublicEnv } from "@/config/env.schema";

import type { PublicEnv } from "@/config/env.schema";

/**
 * The validated public environment - safe in a browser bundle.
 *
 * WHY THIS IS A SEPARATE MODULE FROM `env.ts`. Only `NEXT_PUBLIC_*` variables exist in the browser;
 * every other name is `undefined` there. A single loader validating both sets would throw the moment
 * any Client Component imported it, and the obvious fix - making the server variables optional -
 * would defeat the entire point of validating them. Two loaders, two audiences, one shared schema
 * module.
 *
 * EVERY REFERENCE BELOW MUST BE A LITERAL `process.env.NEXT_PUBLIC_X`. Next replaces those textually
 * at build time; it cannot replace `process.env[name]` or a destructured copy, so a dynamic lookup
 * yields `undefined` in the browser and the schema default would silently win everywhere. That is
 * why the object is spelled out rather than derived from the schema's keys.
 */

function loadPublicEnv(): PublicEnv {
  const parsed = parsePublicEnv({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment variables:\n  ${parsed.errors.join("\n  ")}`
    );
  }

  return parsed.data;
}

/**
 * A bad value fails at import rather than at the first template that interpolates it, so a typo in a
 * deployment variable surfaces as a build error rather than as a broken canonical URL that nobody
 * notices for a week.
 */
export const publicEnv = loadPublicEnv();
