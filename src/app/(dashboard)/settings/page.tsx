import { KeyRoundIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { ConnectedAccounts } from "@/components/settings/connected-accounts";
import {
  ChangePasswordForm,
  SetPasswordForm,
} from "@/components/settings/password-form";
import { PreferencesForm } from "@/components/settings/preferences-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isGoogleEnabled } from "@/lib/auth/providers";
import { isLastSignInMethod } from "@/lib/auth/sign-in-methods";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

import type { PreferencesFormValues } from "@/lib/validations/preferences";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your SamaanShare account settings.",
};

/**
 * Account settings: security and preferences.
 *
 * WHICH FORM IS SHOWN DEPENDS ON WHETHER THERE IS A PASSWORD, and the page decides rather
 * than the browser: `User.password` never crosses to the client, so only its presence
 * does. A Google-only member has nothing to type into a "current password" field, and
 * showing them one they cannot fill in is how a working feature reads as broken.
 *
 * `isGoogleEnabled()` is called here, in a Server Component, because it reads unprefixed
 * environment variables that do not exist in the browser - the same rule the login page
 * follows.
 */
export default async function SettingsPage() {
  const user = await requireUser();

  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      // Selected as a boolean-in-effect: what reaches the component is whether it is
      // null, never the hash itself.
      password: true,
      accounts: { select: { provider: true } },
      defaultCity: true,
      notifyReviewReminders: true,
      notifyReviewPublished: true,
    },
  });

  if (!current) {
    throw new Error("Signed-in user has no profile row.");
  }

  const hasPassword = current.password !== null;
  const isGoogleConnected = current.accounts.some(
    (account) => account.provider === "google"
  );

  /**
   * The same function `disconnectAccount` calls, not a copy of its arithmetic.
   *
   * This decides what to *offer* and the action decides what to *allow* - the split is
   * deliberate, since a rule enforced only in the browser is not enforced. What is not
   * deliberate is the two disagreeing, and they did while this was a hand-written mirror:
   * the ternary was inverted, so the Disconnect button appeared for the one member who
   * must never see it and vanished for the one who should.
   */
  const isOnlySignInMethod = isLastSignInMethod(
    hasPassword,
    current.accounts.length
  );

  // `""` rather than null: a `<select>` has no null, and React warns the first time a
  // value arrives at an input it had treated as uncontrolled.
  const preferenceDefaults: PreferencesFormValues = {
    defaultCity: current.defaultCity ?? "",
    notifyReviewReminders: current.notifyReviewReminders,
    notifyReviewPublished: current.notifyReviewPublished,
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Account security and preferences."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4" aria-hidden="true" />
            {hasPassword ? "Change your password" : "Set a password"}
          </CardTitle>
          <CardDescription>
            {hasPassword
              ? "Changing your password signs out every other device. You will stay signed in here."
              : "Your account signs in with Google. Adding a password lets you sign in with your email address as well, and is required before you can disconnect Google."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasPassword ? <ChangePasswordForm /> : <SetPasswordForm />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected accounts</CardTitle>
          <CardDescription>
            Other services you can use to sign in to SamaanShare.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectedAccounts
            isGoogleConnected={isGoogleConnected}
            isGoogleAvailable={isGoogleEnabled()}
            isOnlySignInMethod={isOnlySignInMethod}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>
            Where browsing starts, and which optional notifications you get.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PreferencesForm defaults={preferenceDefaults} />
        </CardContent>
      </Card>
    </>
  );
}
