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
      className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 lg:px-6 lg:py-8"
      role="status"
      aria-label="Loading listing"
    >
      <Skeleton className="h-4 w-64" />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Skeleton className="aspect-4/3 w-full rounded-xl" />

          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-64" />
          </div>

          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
