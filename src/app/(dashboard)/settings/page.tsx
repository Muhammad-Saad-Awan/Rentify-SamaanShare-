import { KeyRoundIcon, Link2Icon, SlidersHorizontalIcon } from "lucide-react";

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
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

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
 *
 * Card titles are real `h2`s inside `CardTitle`, which is a `div`: the preferences card has an `h3`
 * for its notification group, and without them the outline jumped from the page's `h1` to it.
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

      <SettingsSection
        icon={KeyRoundIcon}
        title={hasPassword ? "Change your password" : "Set a password"}
        description={
          hasPassword
            ? "Changing your password signs out every other device. You will stay signed in here."
            : "Your account signs in with Google. Adding a password lets you sign in with your email address as well, and is required before you can disconnect Google."
        }
      >
        {hasPassword ? <ChangePasswordForm /> : <SetPasswordForm />}
      </SettingsSection>

      <SettingsSection
        icon={Link2Icon}
        title="Connected accounts"
        description="Other services you can use to sign in to SamaanShare."
      >
        <ConnectedAccounts
          isGoogleConnected={isGoogleConnected}
          isGoogleAvailable={isGoogleEnabled()}
          isOnlySignInMethod={isOnlySignInMethod}
        />
      </SettingsSection>

      <SettingsSection
        icon={SlidersHorizontalIcon}
        title="Preferences"
        description="Where browsing starts, and which optional notifications you get."
      >
        <PreferencesForm defaults={preferenceDefaults} />
      </SettingsSection>
    </>
  );
}

interface SettingsSectionProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}

/**
 * One settings card: a mint icon tile, the section's `h2` and what it controls, then the form.
 *
 * The tile is here and not on every dashboard heading because this page is three unrelated forms
 * stacked in one column - the icon is how the eye finds "the password one" on the way back.
 */
function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start gap-3.5">
          <span
            className="bg-brand-soft text-brand flex size-10 shrink-0 items-center justify-center rounded-xl"
            aria-hidden="true"
          >
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>
              <h2>{title}</h2>
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
