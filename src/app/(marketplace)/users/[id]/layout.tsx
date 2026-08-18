import { notFound } from "next/navigation";

import { getPublicProfile } from "@/lib/queries/user-profile";

import type { ReactNode } from "react";

interface ProfileLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

/**
 * Validates the member id before anything streams.
 *
 * The same invariant as `listings/[id]/layout.tsx`, and it applies here for a sharper reason. If a
 * Suspense boundary flushed the shell with a 200 first, a `notFound()` thrown afterwards would
 * render the 404 page over a response that already said the page exists - a soft 404. On a listing
 * that misleads crawlers; on a *person*, the status code is also the only thing distinguishing
 * "no such account" from "this account was suspended", and anything reading statuses would be told
 * a banned member is live.
 *
 * A layout renders above that boundary, so throwing here happens before the first byte and the
 * response is a real 404. `getPublicProfile` is wrapped in React's `cache()`, so this check, the
 * page and `generateMetadata` share one query.
 *
 * Note this covers more than missing ids: the query requires `status: ACTIVE` and `deletedAt: null`,
 * so a suspended, banned or soft-deleted member 404s here rather than keeping a public page complete
 * with their rating - which is what moderation not working would look like.
 */
export default async function ProfileLayout({
  children,
  params,
}: ProfileLayoutProps) {
  const { id } = await params;
  const profile = await getPublicProfile(id);

  if (!profile) {
    notFound();
  }

  return children;
}
