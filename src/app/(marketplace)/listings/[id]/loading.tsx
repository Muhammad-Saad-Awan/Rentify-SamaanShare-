import { Skeleton } from "@/components/ui/skeleton";

/**
 * Streamed while the listing and its similar row are fetched.
 *
 * Mirrors the two-column layout, including the sidebar's width, so the price card
 * does not jump in from the side when content lands. The site header and footer sit
 * in the layout above this boundary and stay interactive.
 */
export default function ListingLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 lg:gap-10 lg:px-6 lg:py-10"
      role="status"
      aria-label="Loading listing"
    >
      <Skeleton className="h-4 w-64 max-w-full" />

      {/* Same three-part grid as the page, so the booking panel holds its place on every width. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-10">
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-1">
          <Skeleton className="aspect-4/3 w-full rounded-xl" />

          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-4 w-64 max-w-full" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="size-9 rounded-lg" />
              <Skeleton className="h-9 w-40 rounded-lg" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>

        <div className="flex min-w-0 flex-col gap-3 border-t pt-8 lg:col-start-1 lg:row-start-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
