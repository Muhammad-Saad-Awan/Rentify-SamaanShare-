import { notFound } from "next/navigation";

import { getCategoryBySlug } from "@/lib/queries/categories";

import type { ReactNode } from "react";

interface CategoryLayoutProps {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}

/**
 * Validates the category slug before anything streams.
 *
 * This layout exists for one reason: HTTP status. `loading.tsx` in this segment
 * puts the page behind a Suspense boundary, so Next flushes the shell - with a
 * 200 - as soon as the fallback is ready. A `notFound()` from the page after that
 * point renders the 404 *page* but cannot change the status that already went out,
 * leaving a soft 404: a crawler is told a nonexistent category is a live page and
 * indexes it. That was measurable here - 200 with the skeleton, 404 without it.
 *
 * A layout renders above that boundary, so throwing here happens before the first
 * byte and the response is a real 404. The page keeps its streaming skeleton.
 *
 * The extra lookup is free: `getCategoryBySlug` is wrapped in React's `cache()`,
 * so this call and the page's are one query per request.
 */
export default async function CategoryLayout({
  children,
  params,
}: CategoryLayoutProps) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  return children;
}
