import { ArrowRightIcon, PackagePlusIcon } from "lucide-react";
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
 *
 * A mint panel rather than navy: the footer directly below is navy, and two dark slabs
 * stacked read as one heavy block. On mint the default emerald button keeps its edge
 * (white on #047857, 5.48:1) with no hand inversion.
 */
function CtaSection() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pb-16 lg:px-6 lg:pb-20">
      <div className="bg-brand-soft relative flex flex-col gap-8 overflow-hidden rounded-3xl px-6 py-12 sm:px-12 sm:py-14 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex max-w-2xl items-start gap-5">
          <span
            className="bg-card text-brand hidden size-14 shrink-0 items-center justify-center rounded-2xl shadow-sm sm:flex"
            aria-hidden="true"
          >
            <PackagePlusIcon className="size-7" strokeWidth={1.75} />
          </span>
          <div className="flex flex-col gap-3">
            <h2 className="font-heading text-3xl leading-[1.1] font-extrabold tracking-[-0.03em] sm:text-4xl">
              Have something sitting <span className="text-brand">unused?</span>
            </h2>
            <p className="text-muted-foreground max-w-[52ch] text-base leading-relaxed text-pretty">
              A camera, a generator, a drill you needed once. List it and let it
              earn while you are not using it.
            </p>
          </div>
        </div>

        <div className="relative flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            className="h-12 rounded-xl px-6"
            render={<Link href="/dashboard/listings" />}
          >
            List an item
            <ArrowRightIcon data-icon="inline-end" aria-hidden="true" />
          </Button>
          <Button
            size="lg"
            variant="brand-outline"
            className="h-12 rounded-xl px-6"
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
