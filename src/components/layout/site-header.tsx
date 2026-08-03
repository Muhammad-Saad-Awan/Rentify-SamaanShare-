import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { HeaderSearch } from "@/components/layout/header-search";
import { Brand } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
 * The search field appears from `sm` up. Below that a 14-unit header cannot hold a
 * wordmark, a text input and two account actions without crushing all three, so
 * small screens get an icon linking to the browse page - which has the same search
 * box, full width, plus the filters.
 */
async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 lg:px-6">
        <Brand href="/" />

        <nav aria-label="Marketplace" className="hidden shrink-0 sm:flex">
          <Link
            href="/listings"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-lg px-2 py-1.5 text-sm font-medium outline-none focus-visible:ring-2"
          >
            Browse
          </Link>
        </nav>

        {/*
          `useSearchParams()` inside `HeaderSearch` opts its subtree out of static
          rendering, and Next requires a Suspense boundary for that. Every page
          under this shell is already dynamic because of the session read above, so
          the boundary never actually shows - but without it, any attempt to
          prerender a route in this group (a not-found, for instance) fails the
          build.

          The fallback is a disabled copy of the same field rather than a spinner,
          so nothing moves when the real one takes over.
        */}
        <Suspense
          fallback={
            <div className="hidden min-w-0 flex-1 sm:block sm:max-w-sm">
              <div className="relative">
                <SearchIcon
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  disabled
                  placeholder="Search listings..."
                  aria-label="Search listings"
                  className="pl-8"
                />
              </div>
            </div>
          }
        >
          <HeaderSearch className="hidden flex-1 sm:block sm:max-w-sm" />
        </Suspense>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {/*
            The small-screen stand-in for the search field. A link, not a control
            that expands one, so it needs no state and works before hydration.
          */}
          <Button
            variant="ghost"
            size="icon-sm"
            className="sm:hidden"
            render={<Link href="/listings" />}
          >
            <SearchIcon />
            <span className="sr-only">Search listings</span>
          </Button>

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
