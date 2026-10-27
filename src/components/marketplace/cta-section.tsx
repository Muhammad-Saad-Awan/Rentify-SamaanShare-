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
    <section className="bg-foreground text-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-16 sm:py-20 lg:flex-row lg:items-end lg:justify-between lg:px-6">
        <div className="flex max-w-2xl flex-col gap-3">
          <h2 className="font-heading text-3xl leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-4xl">
            Have something sitting unused?
          </h2>
          <p className="text-background/70 max-w-[52ch] text-base leading-relaxed text-pretty">
            A camera, a generator, a drill you needed once. List it and let it
            earn while you are not using it.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Inverted by hand: this is the one dark band, where the default black button would vanish. */}
          <Button
            size="lg"
            className="bg-background text-foreground hover:bg-background/90 focus-visible:ring-background focus-visible:ring-offset-foreground"
            render={<Link href="/dashboard/listings" />}
          >
            List an item
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-background/30 text-background hover:border-background hover:text-background focus-visible:ring-background focus-visible:ring-offset-foreground bg-transparent hover:bg-transparent"
            render={<Link href="/listings" />}
          >
            Browse all listings
          </Button>
        </div>
      </div>
    </section>
  );
}

export { CtaSection };
