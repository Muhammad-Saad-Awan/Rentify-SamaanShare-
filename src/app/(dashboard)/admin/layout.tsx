import { AdminHeader } from "@/components/admin/admin-header";
import { requireAdmin } from "@/lib/auth/session";

import type { ReactNode } from "react";

interface AdminLayoutProps {
  children: ReactNode;
}

/**
 * Role gate for `/admin`, nested inside the `(dashboard)` shell.
 *
 * A separate layout rather than a check in each admin page, because this is the
 * boundary that must not be forgotten as `/admin/users`, `/admin/listings` and
 * the rest are added in Phase 6 - a new route under this folder inherits the
 * gate automatically.
 *
 * `requireAdmin()` re-reads role from the database, which is the point.
 * `src/middleware.ts` also guards `ADMIN_PREFIXES`, but it reads only the JWT, so
 * an admin demoted since sign-in still carries `role: "ADMIN"` in their cookie
 * and would sail past it. This is the check that actually holds.
 *
 * `AdminHeader` is the one piece of chrome it adds, and it belongs in the layout rather than on each
 * page for the same reason the gate does: a route added under this folder inherits it. It carries no
 * counts, deliberately - see the note in the component on why a badge in a persistent header would
 * mean a layout writing to the database on every navigation.
 *
 * The header is rendered as a sibling of `children` inside the shell's own flex column, so its
 * spacing comes from that column's gap rather than from a wrapper this layout would have to own.
 */
export default async function AdminLayout({ children }: AdminLayoutProps) {
  await requireAdmin();

  return (
    <>
      <AdminHeader />
      {children}
    </>
  );
}
