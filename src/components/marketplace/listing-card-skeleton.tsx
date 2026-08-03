import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LISTINGS_PAGE_SIZE } from "@/lib/queries/listings";

/**
 * Placeholder matching one `ListingCard`.
 *
 * The proportions are copied from the real card - same `aspect-4/3` image box,
 * same two-line title height - so content arriving does not shift the grid. A
 * skeleton that is merely card-shaped still causes a jump.
 */
function ListingCardSkeleton() {
  return (
    <Card className="h-full gap-0 pt-0">
      <Skeleton className="aspect-4/3 w-full rounded-t-xl rounded-b-none" />

      <div className="flex flex-col gap-2 px-(--card-spacing) pt-(--card-spacing)">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />

        <div className="flex items-center justify-between gap-2 pt-1">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </Card>
  );
}

interface ListingsGridSkeletonProps {
  /** Defaults to a full page, which is what a cold browse load will render. */
  count?: number;
}

/**
 * A full grid of card skeletons for `loading.tsx`.
 *
 * The column classes are duplicated from `ListingsGrid` rather than shared, and
 * that is a real tradeoff: it keeps the skeleton free of any dependency on the
 * grid's props, at the cost of two places to edit if the breakpoints change.
 * They must stay in step or the skeleton will not align with the loaded grid.
 */
function ListingsGridSkeleton({
  count = LISTINGS_PAGE_SIZE,
}: ListingsGridSkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading listings"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      {Array.from({ length: count }, (_, index) => (
        <ListingCardSkeleton key={index} />
      ))}
    </div>
  );
}

export { ListingCardSkeleton, ListingsGridSkeleton };
