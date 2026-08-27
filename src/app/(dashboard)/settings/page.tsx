import { SettingsIcon, ShieldIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { requireUser } from "@/lib/auth/session";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your SamaanShare account settings.",
};

/**
 * Account settings. Placeholder for Phase 2.2 onwards.
 *
 * Split into the two groups the backlog actually calls for - security (password
 * change, email verification) and preferences (notifications, default city) - so
 * the eventual sections have a home, without shipping any control that does
 * nothing when toggled.
 */
export default async function SettingsPage() {
  await requireUser();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Account security and preferences."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <PlaceholderCard
          icon={ShieldIcon}
          title="Security"
          description="Changing your password from inside the app, and managing connected accounts. Resetting a forgotten password and confirming your email address both work already — from the sign-in page and your profile."
          phase="Phase 1"
        />
        <PlaceholderCard
          icon={SettingsIcon}
          title="Preferences"
          description="Notification preferences and your default city for browsing listings."
          phase="Phase 2.2"
        />
      </div>
    </>
  );
}
