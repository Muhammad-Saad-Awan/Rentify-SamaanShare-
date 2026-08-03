import { ListingsGridSkeleton } from "@/components/marketplace/listing-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Streamed while the wishlist query runs.
 *
 * The sidebar and header live in the `(dashboard)` layout above this boundary and
 * stay interactive; only the content column swaps. The title block is mirrored
 * alongside the grid because it too is absent on a cold load.
 */
export default function SavedListingsLoading() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-label="Loading saved listings"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      <ListingsGridSkeleton />
    </div>
  );
}
