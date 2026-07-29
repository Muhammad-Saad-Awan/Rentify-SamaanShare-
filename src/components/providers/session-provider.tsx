"use client";

import { SessionProvider } from "next-auth/react";

import type { ReactNode } from "react";

interface AuthSessionProviderProps {
  children: ReactNode;
}

/**
 * Makes `useSession()` available to Client Components.
 *
 * NO `session` PROP IS PASSED, ON PURPOSE
 * ---------------------------------------
 * Priming the provider with `session={await auth()}` in the root layout would
 * read cookies during render, which opts the entire app out of static
 * generation - the home page would stop being prerendered. Instead the provider
 * fetches `/api/auth/session` once on mount, so static pages stay static at the
 * cost of a brief `status === "loading"` on first paint.
 *
 * Prefer the server helpers in `src/lib/auth/session.ts` wherever possible.
 * `useSession()` is for Client Components that genuinely need to react to the
 * session, not the default way to read it.
 */
function AuthSessionProvider({ children }: AuthSessionProviderProps) {
  return <SessionProvider>{children}</SessionProvider>;
}

export { AuthSessionProvider };
