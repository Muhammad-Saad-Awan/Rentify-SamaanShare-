"use client";

import { CheckCircle2Icon } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { disconnectAccount } from "@/actions/security";
import { Button } from "@/components/ui/button";

interface ConnectedAccountsProps {
  /** True when this account has a Google row in `Account`. */
  isGoogleConnected: boolean;
  /** Whether Google is configured on this server at all - `isGoogleEnabled()`. */
  isGoogleAvailable: boolean;
  /**
   * Whether disconnecting would leave no way to sign in.
   *
   * Computed on the server from the password and the number of linked accounts. The
   * action re-checks it - this only decides whether to offer the button, and a disabled
   * button is a hint, not a rule.
   */
  isOnlySignInMethod: boolean;
}

/**
 * Which providers can open this account.
 *
 * CONNECTING IS AN OAUTH ROUND TRIP, not a Server Action, and that is not a shortcut:
 * linking is something only Google can authorise. `signIn("google")` while already signed
 * in makes Auth.js link the returned account to the current session rather than create a
 * second user - `handleLoginOrRegister` takes that branch when it can decode a session
 * from the cookie. Disconnecting needs no provider involvement, so that one is an action.
 *
 * `redirectTo` comes back here so the round trip ends where it started.
 *
 * Google is the only provider today. The list is written as a list anyway, because the
 * shape of a second one is the thing that would otherwise have to be invented later.
 */
function ConnectedAccounts({
  isGoogleConnected,
  isGoogleAvailable,
  isOnlySignInMethod,
}: ConnectedAccountsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDisconnect() {
    /**
     * `window.confirm`, for the reason `EditListingForm` gives: there is no dialog
     * primitive in this project, and the native one is correctly focus-trapped and
     * screen-reader accessible where a hand-rolled div is not. Worth replacing when a
     * real AlertDialog exists.
     */
    const confirmed = window.confirm(
      "Disconnect Google? You will need your email address and password to sign in after this."
    );

    if (!confirmed) {
      return;
    }

    setBusy(true);

    const result = await disconnectAccount("google");

    setBusy(false);

    if (!result.success) {
      toast.error(result.error);

      return;
    }

    toast.success("Google disconnected.");
    router.refresh();
  }

  if (!isGoogleAvailable && !isGoogleConnected) {
    /**
     * Nothing to show, and saying "no connected accounts" would be misleading - there are
     * no providers configured on this server, so it is not a state the member can change.
     * Google is registered only when its credentials exist; see `isGoogleEnabled`.
     */
    return (
      <p className="text-muted-foreground text-sm">
        No sign-in providers are available on this server, so your email address
        and password are the only way in.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <GoogleLogo />

          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">Google</span>
            <span className="text-muted-foreground text-xs">
              {isGoogleConnected
                ? "Connected - you can sign in with this Google account."
                : "Not connected."}
            </span>
          </div>
        </div>

        {isGoogleConnected ? (
          <div className="flex items-center gap-2">
            <span
              className="text-muted-foreground flex items-center gap-1 text-xs"
              // The word "Connected" is already in the description above, so the icon is
              // decoration rather than the only carrier of that fact.
              aria-hidden="true"
            >
              <CheckCircle2Icon className="size-3.5" />
            </span>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || isOnlySignInMethod}
              onClick={() => void handleDisconnect()}
            >
              {busy ? "Disconnecting..." : "Disconnect"}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !isGoogleAvailable}
            onClick={() => {
              setBusy(true);
              void signIn("google", { redirectTo: "/settings" });
            }}
          >
            Connect
          </Button>
        )}
      </li>

      {isGoogleConnected && isOnlySignInMethod && (
        <p className="text-muted-foreground text-xs">
          This is currently the only way you can sign in, so it cannot be
          disconnected. Set a password above first.
        </p>
      )}
    </ul>
  );
}

/**
 * Inlined for the reason `GoogleButton` gives: Google's brand guidelines require the
 * four-colour mark and Lucide ships monochrome outlines only. Duplicated rather than
 * exported from there because that component is the whole sign-in button, and importing
 * it here would drag its redirect behaviour along with the artwork.
 */
function GoogleLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="size-5 shrink-0"
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.9v3.1A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58v-3.1h-3.9a11.99 11.99 0 0 0 0 10.78l3.9-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.9 3.1c.95-2.85 3.6-4.42 5.92-4.42Z"
      />
    </svg>
  );
}

export { ConnectedAccounts };
