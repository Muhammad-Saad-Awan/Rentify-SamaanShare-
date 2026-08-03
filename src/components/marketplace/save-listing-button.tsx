"use client";

import { HeartIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { saveListing, unsaveListing } from "@/actions/saved-listings";
import { Button } from "@/components/ui/button";
import { CALLBACK_URL_PARAM, LOGIN_ROUTE } from "@/config/routes";
import { cn } from "@/lib/utils/cn";
import { UNAUTHENTICATED_ERROR } from "@/types";

interface SaveListingButtonProps {
  listingId: string;
  /** Server-rendered saved state; the source of truth this reconciles against. */
  isSaved: boolean;
  /** Whether a session exists. Decides between an action and a login link. */
  isAuthenticated: boolean;
  /** Title of the listing, for the button's accessible name. */
  listingTitle: string;
  className?: string;
}

/**
 * Heart toggle on a listing card.
 *
 * Two quite different components share one appearance, chosen by
 * `isAuthenticated`:
 *
 * - Signed out, it is a `<Link>` to the login page carrying a `callbackUrl` back to
 *   the page the user was on. Not a button that pops a dialog, and not a disabled
 *   control: a signed-out visitor clicking a heart is expressing intent, and the
 *   useful response is to let them sign in and land back where they were.
 * - Signed in, it is a real button wired to the Server Actions.
 *
 * Optimism without lying: `useOptimistic` shows the toggle immediately, and its
 * value is derived from the `isSaved` prop. When the transition ends, React
 * discards the optimistic value and re-renders from whatever the server now says -
 * so a rejected write snaps back on its own, with no manual rollback to get wrong.
 * The action's `revalidatePath` is what makes that server value current.
 */
function SaveListingButton({
  listingId,
  isSaved,
  isAuthenticated,
  listingTitle,
  className,
}: SaveListingButtonProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [isPending, startTransition] = useTransition();
  const [optimisticSaved, setOptimisticSaved] = useOptimistic(
    isSaved,
    (_current, next: boolean) => next
  );

  if (!isAuthenticated) {
    const query = searchParams.toString();
    const callbackUrl = query ? `${pathname}?${query}` : pathname;

    return (
      <Button
        variant="secondary"
        size="icon-sm"
        aria-label={`Sign in to save ${listingTitle}`}
        className={cn(HEART_BUTTON_CLASS, className)}
        render={
          <Link
            href={`${LOGIN_ROUTE}?${CALLBACK_URL_PARAM}=${encodeURIComponent(callbackUrl)}`}
          />
        }
      >
        <HeartIcon aria-hidden="true" />
      </Button>
    );
  }

  function handleClick() {
    const next = !optimisticSaved;

    startTransition(async () => {
      // Inside the transition, so React ties the optimistic value's lifetime to
      // the action. Setting it outside would apply the change and immediately
      // revert it on the next render.
      setOptimisticSaved(next);

      const result = next
        ? await saveListing(listingId)
        : await unsaveListing(listingId);

      if (result.success) {
        return;
      }

      // A session that expired between page render and click. Say so plainly
      // rather than showing a generic failure - the fix is to sign in again.
      if (result.error === UNAUTHENTICATED_ERROR) {
        toast.error(
          "Your session has expired. Sign in again to save listings."
        );
        return;
      }

      toast.error(result.error);
    });
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon-sm"
      onClick={handleClick}
      // Not `disabled` while pending: disabling moves focus off the button
      // mid-interaction for keyboard users, and the optimistic state already
      // communicates that the click landed. `aria-busy` conveys it without
      // removing the control.
      aria-busy={isPending}
      aria-pressed={optimisticSaved}
      aria-label={
        optimisticSaved
          ? `Remove ${listingTitle} from saved listings`
          : `Save ${listingTitle} to your listings`
      }
      className={cn(HEART_BUTTON_CLASS, className)}
    >
      <HeartIcon
        aria-hidden="true"
        className={cn(
          "transition-colors",
          // `fill-current` is the only difference between the two states, so the
          // toggle reads at a glance without relying on colour alone.
          optimisticSaved && "fill-current text-red-500"
        )}
      />
    </Button>
  );
}

/** Shared so the link and button variants are visually identical. */
const HEART_BUTTON_CLASS =
  "bg-background/80 hover:bg-background text-foreground shadow-sm backdrop-blur";

export { SaveListingButton };
