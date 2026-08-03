import { Skeleton } from "@/components/ui/skeleton";

interface DashboardPageSkeletonProps {
  /** How many card placeholders to draw beneath the title block. */
  cards?: number;
  /** Draw a 4-up metric tile row above the cards, as on the overview page. */
  withStats?: boolean;
}

/**
 * Shared skeleton for every dashboard `loading.tsx`.
 *
 * Mirrors the real page's structure - title block, optional stat row, cards - so
 * the transition to loaded content does not shift layout. Because the shell
 * (sidebar and header) lives in the layout above the Suspense boundary, it stays
 * interactive while this shows; only the content column swaps.
 */
function DashboardPageSkeleton({
  cards = 2,
  withStats = false,
}: DashboardPageSkeletonProps) {
  return (
    // Announced politely rather than silently: a screen reader user gets told
    // the region is loading instead of hearing nothing until content appears.
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-label="Loading page content"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      {withStats && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[104px] rounded-xl" />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {Array.from({ length: cards }, (_, index) => (
          <Skeleton key={index} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export { DashboardPageSkeleton };
