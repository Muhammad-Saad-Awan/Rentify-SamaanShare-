import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Closing call to action.
 *
 * "List an item" points at `/dashboard/listings`, which is a protected route. A
 * signed-out visitor is not sent to a sign-up page from here - middleware
 * intercepts, sends them to login with a `callbackUrl`, and returns them to the
 * listings screen afterwards. That means one link works for both audiences, and
 * the redirect logic stays in middleware instead of being duplicated as a session
 * check on the homepage (which would also make this section uncacheable on its
 * own terms).
 */
function CtaSection() {
  return (
    <section className="bg-muted/40 border-y">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-5 px-4 py-12 text-center lg:px-6">
        <div className="flex max-w-2xl flex-col gap-2">
          <h2 className="font-heading text-xl font-semibold tracking-tight text-balance sm:text-2xl">
            Have something sitting unused?
          </h2>
          <p className="text-muted-foreground text-sm text-pretty">
            A camera, a generator, a drill you needed once. List it and let it
            earn while you are not using it.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button render={<Link href="/dashboard/listings" />}>
            List an item
          </Button>
          <Button variant="outline" render={<Link href="/listings" />}>
            Browse all listings
          </Button>
        </div>
      </div>
    </section>
  );
}

export { CtaSection };
