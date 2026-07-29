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
 * Renders no chrome of its own; the admin sidebar and sub-navigation belong to
 * Phase 6.
 */
export default async function AdminLayout({ children }: AdminLayoutProps) {
  await requireAdmin();

  return children;
}
