# Page patterns

How to add or change a route in this App Router codebase without breaking status codes, auth,
hydration or layout. Next.js here is 15.x with React 19; `params` and `searchParams` are
**Promises** and must be awaited. If unsure about an API, read `node_modules/next/dist/docs/`
rather than relying on memory (AGENTS.md).

## Contents

1. Route groups and shells
2. The 404 / loading / Suspense rules
3. Server vs client split
4. Auth and data in pages
5. Page templates
6. Responsive patterns
7. Accessibility baseline for every page
8. Verification

---

## 1. Route groups and shells

| Group | URLs | Shell | Container |
|---|---|---|---|
| `(marketplace)` | `/`, `/listings`, `/listings/[id]`, `/categories/[slug]`, `/users/[id]`, `/listings/new` | `SiteHeader` + `SiteFooter` | `mx-auto max-w-7xl px-4 lg:px-6` per page |
| `(dashboard)` | `/dashboard/*`, `/admin/*`, `/profile`, `/settings`, `/saved` | sidebar + header, `requireUser()` | layout supplies `max-w-6xl px-4 py-8 lg:px-8 lg:py-10 gap-8` - pages return their children directly |
| `(auth)` | `/login`, `/register`, `/forgot-password`, ... | centred auth layout | form card |

A new authenticated section goes in `(dashboard)` - add it to `DASHBOARD_NAV` and `PATH_LABELS`
in `src/config/navigation.ts`, and to `PROTECTED_PREFIXES` in `src/config/routes.ts` if it is a
new top-level prefix.

## 2. The 404 / loading / Suspense rules

Next flushes the response with **200** as soon as a Suspense fallback is ready. A `notFound()`
after that renders the 404 page but cannot change the status - a soft 404. This shipped three
times here (`/categories/[slug]`, `/listings/[id]`, `/dashboard/listings/[id]`, plus once in
`admin/loading.tsx`).

1. **Validate the parameter in `[param]/layout.tsx`**, not the page. The layout fetches with a
   `cache()`-wrapped query (so page and `generateMetadata` reuse it) and calls `notFound()`.
2. **`not-found.tsx` goes one level up** (`listings/not-found.tsx`, not
   `listings/[id]/not-found.tsx`) - a `notFound()` from a layout bubbles past its own segment.
3. **No `loading.tsx` in any ancestor of that layout.** A `loading.tsx` *inside* the `[id]`
   segment is fine (it wraps the page, below the layout) - that is what `listings/[id]/loading.tsx`
   and `categories/[slug]/loading.tsx` do.
4. **Where a list page sits above a `[id]` route, use in-page Suspense** with a key derived from
   the request so the fallback reappears on navigation:

   ```tsx
   export default async function ClaimsPage({ searchParams }: ClaimsPageProps) {
     const { page: rawPage, status: rawStatus } = await searchParams;

     return (
       // In-page Suspense rather than a route-level loading.tsx - see the invariant in AGENTS.md.
       <Suspense
         key={`${String(rawStatus ?? "disputed")}:${String(rawPage ?? 1)}`}
         fallback={<DashboardPageSkeleton cards={3} />}
       >
         <ClaimQueue rawPage={rawPage} rawStatus={rawStatus} />
       </Suspense>
     );
   }
   ```
5. "Not found" and "not yours" render the **same** 404 - distinguishing them makes the route an
   existence oracle.
6. Do **not** add Suspense around async components inside the dashboard *shell* (layout, header,
   sidebar) - it broke Base UI id hydration. The shell awaits its data.

Current `loading.tsx` files: `dashboard/notifications`, `profile`, `saved`, `settings` (no
`[param]` children) and inside `listings/[id]`, `categories/[slug]`. Adding one anywhere else needs
a check of every descendant route.

## 3. Server vs client split

- Pages, layouts and data-display components are Server Components.
- `"use client"` only for: state/effects, event handlers, browser APIs, `react-hook-form`,
  `useTransition`/`useOptimistic`, `sonner` calls, realtime (Pusher).
- Push the boundary to the leaf: the page fetches and renders `ListingsGrid` (server); only
  `SaveListingButton` inside each card is client.
- Props crossing the boundary are serialisable plain objects (no Prisma `Decimal`, no functions,
  no Dates you have not considered - pass ISO strings or pre-formatted text).
- Never import `@/lib/prisma`, `@/lib/queries/*` or server-only modules into a client file.

## 4. Auth and data in pages

- Pages call `requireUser()` (redirects) even inside `(dashboard)`, because a layout is not
  re-run on client navigation. Admin pages use `requireAdmin()` (re-reads the role from the
  database - the JWT can be stale). New protected prefixes go in `PROTECTED_PREFIXES`
  (`src/config/routes.ts`).
- Server Actions (`src/actions/*`) use `getActiveUser()` and return `ActionResult` - they never
  redirect. UI work does not change action signatures.
- Public listing reads go through `VISIBLE_LISTING_WHERE` - never a hand-written predicate, and
  any count shown beside a list must use the same predicate as the list.
- Read data through existing `src/lib/queries/*`. If a design needs a field the query does not
  select, extend the query's projection deliberately (and keep card projections narrow).
- `export const metadata` (or `generateMetadata`) on every page: specific `title`, one-sentence
  `description`.

## 5. Page templates

### Dashboard list page

```tsx
import { InboxIcon } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { requireUser } from "@/lib/auth/session";
import { parsePageParam } from "@/lib/utils/pagination";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bookings",
  description: "Rentals you have requested on SamaanShare.",
};

interface BookingsPageProps {
  searchParams: Promise<{ page?: string | string[] }>;
}

/** Why this page exists and anything non-obvious about its data. */
export default async function BookingsPage({ searchParams }: BookingsPageProps) {
  const user = await requireUser();
  const { page: rawPage } = await searchParams;
  const page = parsePageParam(rawPage);
  const result = await getSomething(user.id, page); // existing query in src/lib/queries

  return (
    <>
      <PageHeader title="Bookings" description="Rentals you have requested." />
      {result.items.length === 0 ? (
        <EmptyState icon={InboxIcon} title="No bookings yet" description="..." />
      ) : (
        <>
          <ul className="flex flex-col gap-4">...</ul>
          <Pagination page={page} totalPages={result.totalPages} hrefFor={(p) => `/dashboard/bookings?page=${p}`} />
        </>
      )}
    </>
  );
}
```

If this page has a `[id]` child route, wrap the data part in keyed `<Suspense>` (section 2) instead
of adding `loading.tsx`.

### Dashboard detail page with `[id]`

```
dashboard/things/
├── page.tsx              # list; in-page Suspense, no loading.tsx
├── not-found.tsx         # EmptyState-based, one level above [id]
└── [id]/
    ├── layout.tsx        # requireUser + scoped cache() query + notFound()
    ├── loading.tsx       # optional - below the layout, safe
    └── page.tsx          # renders; re-reads via the same cached query
```

### Marketplace page

`<div className="mx-auto flex w-full max-w-7xl flex-col gap-20 px-4 py-16 lg:px-6 lg:py-20">`
containing `<section className="flex flex-col gap-7">` blocks, each starting with `SectionHeading`.
Exactly one `h1` (hero or page title). Add `JsonLd` where the page represents an entity.

## 6. Responsive patterns

Design desktop-first for quality, then make sure mobile is excellent - most SamaanShare users are
on phones on slower networks.

- Check at 360px, 768px, 1024px, 1280px. No horizontal scroll at 360px.
- Flex children that hold text or tables need `min-w-0`; long strings `truncate` or `break-words`.
- Header actions: `flex-col gap-4 sm:flex-row sm:items-end sm:justify-between` (as `PageHeader`).
- Grids step up: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.
- Filters: sidebar on `lg`, `Sheet` below it. Dashboard nav: sidebar on `lg`, sheet below.
- Touch targets at least 36-44px tall (`h-9` minimum, `h-10`/`h-11` for primary mobile actions).
- Images: `next/image` with `sizes` matching the grid; avoid layout shift with `aspect-*`.
- Sticky elements: only the site header (`sticky top-0 z-30`), and in-page anchors use
  `scroll-mt-24` to clear it.

## 7. Accessibility baseline for every page

- One `h1` (from `PageHeader` / hero), then `h2` for sections, no skipped levels.
- Landmarks: the shell provides `main#main-content` and the skip link - do not add another `main`.
- Visible focus on everything interactive (`focus-visible:ring-2 ring-ring ring-offset-2`).
- `aria-current="page"` on active nav, `aria-label` on icon buttons and on each `<nav>`.
- Status changes announced (`role="status"` / toasts); errors `role="alert"`.
- Lists of things are `<ul>`/`<li>`; a results grid is a list.
- Text contrast >= 4.5:1, large text and UI boundaries >= 3:1 (`scripts/contrast.mjs`).
- Respect reduced motion (global rule already does this - do not force animations).

## 8. Verification

```bash
npm run lint && npm run type-check
curl -o /dev/null -s -w '%{http_code}\n' http://localhost:3000/<route>/does-not-exist   # expect 404
npm run test:a11y        # axe on public pages (needs a build)
```

Report which of these you ran. If you could not run something (no dev server, no browser), say so
plainly rather than implying it was checked.
