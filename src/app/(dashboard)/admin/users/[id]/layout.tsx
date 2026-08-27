import { notFound } from "next/navigation";

import { getAdminUserDetail } from "@/lib/queries/admin-users";

import type { ReactNode } from "react";

interface AdminUserLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * Validates the member id before anything streams.
 *
 * The same invariant as `listings/[id]` and `users/[id]`: a Suspense boundary would flush the shell
 * with a 200 before the page ran, and a `notFound()` after that renders the 404 page over a response
 * that already said the record exists. A layout runs above that boundary, so throwing here happens
 * before the first byte.
 *
 * Unlike the public profile, this deliberately does NOT filter on status or `deletedAt`. A suspended,
 * banned or soft-deleted account is precisely the one an administrator needs to open - hiding them
 * would make moderation unable to look at its own outcomes.
 */
export default async function AdminUserLayout({
  children,
  params,
}: AdminUserLayoutProps) {
  const { id } = await params;
  const user = await getAdminUserDetail(id);

  if (!user) {
    notFound();
  }

  return children;
}
