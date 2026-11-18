import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardPageSkeletonProps {
  /** How many card placeholders to draw beneath the title block. */
  cards?: number;
  /** Draw a 4-up metric tile row above the cards, as on the overview page. */
  withStats?: boolean;
  /**
   * The shape of each card placeholder.
   *
   * - `block` (default): a plain card-height block - for screens whose cards vary too much to
   *   mirror, which is most of the admin queues.
   * - `row`: a thumbnail beside a title, meta line and an action row - the booking, request and
   *   owner-listing cards, so the list does not jump when the real rows land.
   * - `split`: two summary cards side by side from `lg`, as on the overview.
   */
  variant?: "block" | "row" | "split";
}

/**
 * Shared skeleton for every dashboard Suspense fallback and the few safe `loading.tsx` files.
 *
 * Mirrors the real page's structure - title block with the same bottom rule as `PageHeader`,
 * optional stat row, cards - so the transition to loaded content does not shift layout. Because the
 * shell (sidebar and header) lives in the layout above the Suspense boundary, it stays interactive
 * while this shows; only the content column swaps.
 */
function DashboardPageSkeleton({
  cards = 2,
  withStats = false,
  variant = "block",
}: DashboardPageSkeletonProps) {
  return (
    // Announced politely rather than silently: a screen reader user gets told
    // the region is loading instead of hearing nothing until content appears.
    // `gap-8` matches the layout's own gap, which is what the loaded page uses.
    <div
      className="flex flex-col gap-8"
      role="status"
      aria-label="Loading page content"
    >
      <div className="flex flex-col gap-2 border-b pb-6">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      {withStats && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[136px] rounded-xl" />
          ))}
        </div>
      )}

      {variant === "split" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: cards }, (_, index) => (
            <Skeleton key={index} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {Array.from({ length: cards }, (_, index) =>
            variant === "row" ? (
              <RowSkeleton key={index} />
            ) : (
              <Skeleton key={index} className="h-40 rounded-xl" />
            )
          )}
        </div>
      )}
    </div>
  );
}

/** One booking- or listing-shaped card: thumbnail, text lines, a money strip and actions. */
function RowSkeleton() {
  return (
    <Card aria-hidden="true">
      <div className="flex flex-col gap-4 px-(--card-spacing)">
        <div className="flex gap-4">
          <Skeleton className="aspect-4/3 w-20 shrink-0 rounded-lg sm:w-28" />
          <div className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-16 w-full rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>
    </Card>
  );
}

export { DashboardPageSkeleton };
