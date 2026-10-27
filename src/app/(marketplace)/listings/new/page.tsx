import { IdCardIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { EmailVerificationNotice } from "@/components/auth/email-verification-notice";
import { CreateListingForm } from "@/components/listings/create-listing-form";
import { needsEmailConfirmation } from "@/lib/auth/email-gate";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { needsIdentityDocument } from "@/lib/identity/gate";
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
 *
 * An unconfirmed address gets the confirmation prompt in place of the form. Publishing would be
 * refused by `createListing` anyway, and learning that after five steps of photos and pricing is the
 * worst moment to find out.
 */
export default async function NewListingPage() {
  // Sequential on purpose - there is no point loading the taxonomy for a visitor who
  // is about to be redirected to login.
  const user = await requireUser();

  if (await needsEmailConfirmation(user.id)) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 lg:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-bold tracking-[-0.025em] sm:text-4xl">
            List an item
          </h1>
          <p className="text-muted-foreground text-sm">
            Confirm your email address first - SamaanShare asks every member to
            before they list or rent.
          </p>
        </div>

        {/* Only reached when mail is configured, so the resend button always works here. */}
        <EmailVerificationNotice isVerified={false} canSend />
      </div>
    );
  }

  /**
   * The CNIC, checked after the address and for the same reason: `createListing` refuses without it,
   * and finding that out at the end of five steps would waste every one of them.
   */
  if (await needsIdentityDocument(user.id)) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 lg:px-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-bold tracking-[-0.025em] sm:text-4xl">
            List an item
          </h1>
          <p className="text-muted-foreground text-sm">
            One step before you start.
          </p>
        </div>

        <EmptyState
          icon={IdCardIcon}
          title="Upload your CNIC to start listing"
          description="SamaanShare asks every member for both sides of their CNIC before they list or rent. It is stored privately and only staff can see it."
          action={
            <Button render={<Link href="/profile#identity" />}>
              Upload my CNIC
            </Button>
          }
        />
      </div>
    );
  }

  const categories = await getCategoryOptions();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 lg:px-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-3xl font-bold tracking-[-0.025em] sm:text-4xl">
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
