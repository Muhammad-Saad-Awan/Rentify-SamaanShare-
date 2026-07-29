import Link from "next/link";

import { siteConfig } from "@/config/site";

import type { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
}

/**
 * Shared frame for the sign-in and sign-up pages.
 *
 * `(auth)` is a route group: the parentheses keep it out of the URL, so this
 * layout wraps `/login` and `/register` without nesting them under `/auth`.
 *
 * Stays a Server Component and reads no session - middleware already bounces
 * signed-in visitors away from these routes, so doing it again here would only
 * make the pages dynamic for no benefit.
 */
export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 py-10">
      <Link
        href="/"
        className="text-lg font-semibold tracking-tight transition-opacity hover:opacity-80"
      >
        {siteConfig.name}
      </Link>

      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
