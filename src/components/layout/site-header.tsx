import Link from "next/link";

import { Brand } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOGIN_REDIRECT, LOGIN_ROUTE } from "@/config/routes";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Header for the public marketplace.
 *
 * `getCurrentUser()` rather than `requireUser()`: every page under this shell is
 * public, so a missing session is the normal case and must not redirect. It only
 * decides which actions to show.
 *
 * Reading the session makes any page using this header dynamic, which is correct
 * but worth knowing - a signed-in visitor must not be served another visitor's
 * cached header. Static marketing content that needs to stay static should not
 * sit under this shell.
 *
 * No drawer at small sizes: the whole header is a wordmark, one link and two
 * actions, which fits a narrow viewport without one. Add one when the public nav
 * grows past what fits.
 */
async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4 lg:px-6">
        <Brand href="/" />

        <nav aria-label="Marketplace" className="ml-2 flex min-w-0 flex-1">
          <Link
            href="/listings"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-lg px-2 py-1.5 text-sm font-medium outline-none focus-visible:ring-2"
          >
            Browse
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <Button size="sm" render={<Link href={DEFAULT_LOGIN_REDIRECT} />}>
              Dashboard
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href={LOGIN_ROUTE} />}
              >
                Sign in
              </Button>
              <Button size="sm" render={<Link href="/register" />}>
                {/* Shortened below `sm` - "Create account" wraps the row. */}
                <span className="hidden sm:inline">Create account</span>
                <span className="sm:hidden">Sign up</span>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export { SiteHeader };
