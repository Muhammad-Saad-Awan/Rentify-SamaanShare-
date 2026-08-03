import { CreateListingForm } from "@/components/listings/create-listing-form";
import { requireUser } from "@/lib/auth/session";
import { getCategoryOptions } from "@/lib/queries/categories";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "List an Item",
  description: "Publish something you own for rent on SamaanShare.",
  // An authenticated authoring page has nothing to offer a crawler, and indexing it
  // would put a login redirect into search results.
  robots: { index: false, follow: false },
};

/**
 * Create-listing page.
 *
 * Lives in the `(marketplace)` group rather than `(dashboard)`, which is what puts it
 * at `/listings/new` alongside `/listings/[id]`. The static segment wins over the
 * dynamic one, so this page takes precedence and `[id]` no longer has to treat "new"
 * as a possible listing id.
 *
 * `requireUser()` runs here as well as in middleware: middleware is a redirect
 * convenience that can be bypassed, and this is the check that actually holds. It now
 * verifies against the database, so a suspended owner cannot reach the form.
 */
export default async function NewListingPage() {
  // Sequential on purpose - there is no point loading the taxonomy for a visitor who
  // is about to be redirected to login.
  await requireUser();

  const categories = await getCategoryOptions();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 lg:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          List an item
        </h1>
        <p className="text-muted-foreground text-sm">
          Five short steps. Nothing is published until you review it at the end.
        </p>
      </div>

      <CreateListingForm categories={categories} />
    </div>
  );
}
