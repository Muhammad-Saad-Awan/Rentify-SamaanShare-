<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project invariants

Learned the hard way in this codebase. Each one cost a real bug.

## A `loading.tsx` above a route that can 404 will break its status code

Next flushes the shell with **200** as soon as a Suspense fallback is ready. A `notFound()`
thrown *after* that point renders the 404 page but cannot change a status already sent - a
soft 404, which tells crawlers a dead URL is live and hides authorization outcomes from
anything reading status codes.

This bit three separate routes: `/categories/[slug]`, `/listings/[id]`, and the owner routes
under `/dashboard/listings/[id]`. In the last case two boundaries were involved, and removing
only one changed nothing.

So:

- Validate the parameter in a **`layout.tsx`**, which runs before the first byte - never in
  the page.
- Ensure **no `loading.tsx` sits above** that layout, in any ancestor segment. A route-level
  skeleton covers its segment *and every route nested under it*.
- Where a skeleton is still wanted, render it from an in-page `<Suspense>` with a `key`
  derived from the request, so the fallback still reappears between navigations.
- A `notFound()` thrown from a layout bubbles **past that layout's own segment**, so the
  matching `not-found.tsx` belongs one level up.

Verify with `curl -o /dev/null -w '%{http_code}'`, not in a browser - the browser shows the
right page either way, which is what makes this easy to miss.

## Public listing reads go through `VISIBLE_LISTING_WHERE`

Never hand-write the predicate. It covers listing status, soft deletion **and** owner status:
users are soft-deleted rather than removed, and `Listing.owner` is `onDelete: Restrict`, so a
banned account keeps its listings. Any count computed with a looser predicate than the page it
labels will advertise items that are not there.

## Server Actions return results; pages redirect

`requireUser()` redirects and belongs in pages. Actions invoked from a button must return an
`ActionResult` so the caller can roll back an optimistic update and explain itself -
`getActiveUser()` is the non-redirecting equivalent. Both verify against the database, because
`status` in the JWT is up to 24h stale.
