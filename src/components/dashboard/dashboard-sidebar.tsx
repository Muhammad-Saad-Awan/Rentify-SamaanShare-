import { DashboardBrand } from "@/components/dashboard/dashboard-brand";
import { DashboardNav } from "@/components/dashboard/dashboard-nav";

import type { UserRole } from "@/generated/prisma/enums";
import type { ReactNode } from "react";

interface DashboardSidebarProps {
  role: UserRole;
  /** See `DashboardNav`. */
  badges?: Readonly<Record<string, ReactNode>> | undefined;
}

/**
 * Fixed navigation rail, desktop only.
 *
 * Hidden below `lg` and replaced there by `DashboardMobileNav`, which renders
 * the same `DashboardNav` inside a drawer. Both breakpoints therefore share one
 * nav implementation - only the container differs.
 *
 * `h-svh` with `sticky top-0` rather than `fixed`: the rail participates in the
 * flex row, so the content column needs no compensating margin and cannot slide
 * underneath it.
 */
function DashboardSidebar({ role, badges }: DashboardSidebarProps) {
  return (
    <aside className="bg-sidebar hidden shrink-0 border-r lg:sticky lg:top-0 lg:flex lg:h-svh lg:w-64 lg:flex-col">
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <DashboardBrand />
      </div>

      <DashboardNav role={role} badges={badges} />
    </aside>
  );
}

export { DashboardSidebar };
