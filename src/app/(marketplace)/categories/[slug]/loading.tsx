import { ListingsGridSkeleton } from "@/components/marketplace/listing-card-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Streamed while the category and its listings are fetched.
 *
 * The site header and footer sit in the layout above this boundary and stay
 * interactive; only this column swaps. The icon, title, subcategory row and sort
 * control are all mirrored, because every one of them is absent on a cold load and
 * omitting them would shift the grid downward when content arrives.
 */
export default function CategoryLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 lg:px-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 shrink-0 rounded-xl sm:size-14" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5 overflow-hidden">
          {/* Five pills: the widest seeded category has five subcategories. */}
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-9 w-24 rounded-full" />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-10 w-72 max-w-[70%]" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      <ListingsGridSkeleton />
    </div>
  );
}
