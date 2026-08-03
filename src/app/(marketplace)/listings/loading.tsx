import { ListingsGridSkeleton } from "@/components/marketplace/listing-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Streamed while the browse queries run.
 *
 * The header and footer live in the layout above this boundary, so they stay
 * rendered and interactive - only the results column swaps. The toolbar and
 * sidebar are mirrored as well as the grid, because all three are absent on a
 * cold load and a skeleton that omits them shifts the layout when content lands.
 */
export default function BrowseListingsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 lg:px-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Skeleton className="h-8 sm:flex-1" />
        <Skeleton className="h-8 w-52 shrink-0" />
      </div>

      <div className="flex gap-6">
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="flex flex-col gap-5">
            {/*
              Six groups, matching the sidebar's category, subcategory, city,
              price, condition and availability sections.
            */}
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <ListingsGridSkeleton />
        </div>
      </div>
    </div>
  );
}
