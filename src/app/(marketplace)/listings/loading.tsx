import { ListingsGridSkeleton } from "@/components/marketplace/listing-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Streamed while the browse query runs.
 *
 * The header and footer live in the layout above this boundary, so they stay
 * rendered and interactive - only the results column swaps. The title block is
 * mirrored here as well as the grid, because it too is absent on a cold load.
 */
export default function BrowseListingsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 lg:px-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <ListingsGridSkeleton />
    </div>
  );
}
