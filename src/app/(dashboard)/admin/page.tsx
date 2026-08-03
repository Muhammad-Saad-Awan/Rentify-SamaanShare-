import { ShieldIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/auth/session";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin",
  description: "SamaanShare administration.",
  // The admin area should never appear in search results, even if a crawler
  // somehow reaches it while a session cookie is present.
  robots: { index: false, follow: false },
};

/**
 * Admin landing page. Placeholder for Phase 6.
 *
 * Calls `requireAdmin()` again despite the layout above already doing so, for
 * the same reason every dashboard page re-checks: a client-side navigation can
 * reuse the layout without re-running it.
 */
export default async function AdminPage() {
  await requireAdmin();

  return (
    <>
      <PageHeader
        title="Admin"
        description="Moderation and platform administration."
        actions={<Badge variant="secondary">Restricted</Badge>}
      />

      <PlaceholderCard
        icon={ShieldIcon}
        title="Admin tools"
        description="User management, listing moderation, reports and analytics all arrive in Phase 6. Routes added under this folder inherit the admin role gate automatically."
        phase="Phase 6"
      />
    </>
  );
}
