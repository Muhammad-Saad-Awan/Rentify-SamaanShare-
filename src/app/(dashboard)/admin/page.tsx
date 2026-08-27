import { ShieldIcon } from "lucide-react";
import { Suspense } from "react";

import { PageHeader } from "@/components/dashboard/page-header";
import { DashboardPageSkeleton } from "@/components/dashboard/dashboard-page-skeleton";
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
 * Admin landing page.
 *
 * THE SKELETON IS IN-PAGE, NOT A ROUTE-LEVEL `loading.tsx`. There used to be one here, and it broke
 * a route several segments below it: a `loading.tsx` covers its own segment *and everything nested
 * under it*, so `admin/users/[id]/layout.tsx` was rendering inside that boundary. Next had already
 * flushed the shell with a 200 by the time the layout called `notFound()`, so an unknown member id
 * returned 200 with a 404 page painted over it - a soft 404, and the exact failure AGENTS.md
 * records from three earlier routes.
 *
 * `requireAdmin()` hits the database, so a boundary here is genuinely reachable rather than
 * instantaneous - which is why the fallback moved rather than being dropped.
 */
export default function AdminPage() {
  return (
    <Suspense fallback={<DashboardPageSkeleton cards={1} />}>
      <AdminHome />
    </Suspense>
  );
}

async function AdminHome() {
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
        description="Members, reports and deposit claims are in the sidebar. Listing moderation, booking views and analytics complete in Phase 6."
        phase="Phase 6"
      />
    </>
  );
}
