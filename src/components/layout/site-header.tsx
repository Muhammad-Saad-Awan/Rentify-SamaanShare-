import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { HeaderSearchToggle } from "@/components/layout/header-search-toggle";
import { SiteNav } from "@/components/layout/site-nav";
import { Brand } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOGIN_REDIRECT, LOGIN_ROUTE } from "@/config/routes";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * Header for the public marketplace: wordmark left, nav centred, search and account right.
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
 * The centred nav appears from `md` up. Below that the header holds the wordmark,
 * search and the account actions; Browse is one tap away through the search panel
 * and the homepage itself.
 */
async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="bg-background/90 supports-[backdrop-filter]:bg-background/75 sticky top-0 z-30 backdrop-blur-md">
      <div className="relative mx-auto grid h-16 w-full max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-2 px-4 sm:h-[4.5rem] lg:px-6">
        <Brand href="/" className="text-[1.0625rem] sm:text-[1.25rem]" />

        <SiteNav className="hidden justify-self-center md:block" />

        <div className="col-start-3 flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          {/*
            `useSearchParams()` inside the toggle opts its subtree out of static rendering, and
            Next requires a Suspense boundary for that. The fallback is a plain link to browse -
            the same place the search would go - so nothing is dead before hydration.
          */}
          <Suspense
            fallback={
              <Button
                variant="ghost"
                size="icon"
                render={<Link href="/listings" />}
              >
                <SearchIcon className="size-[1.15rem]" />
                <span className="sr-only">Search listings</span>
              </Button>
            }
          >
            <HeaderSearchToggle />
          </Suspense>

          <span
            className="bg-border hidden h-6 w-px sm:block"
            aria-hidden="true"
          />

          {user ? (
            <Button render={<Link href={DEFAULT_LOGIN_REDIRECT} />}>
              Dashboard
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                className="px-2.5 sm:h-10 sm:px-5"
                render={<Link href={LOGIN_ROUTE} />}
              >
                Login
              </Button>
              <Button
                className="px-2.5 sm:h-10 sm:px-5"
                render={<Link href="/register" />}
              >
                Sign Up
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export { SiteHeader };
