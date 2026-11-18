# Component guidelines

How SamaanShare's components look, behave and are put together. Read the source of any component
named here before using it - props change, and the comments in those files explain constraints
this summary cannot.

## Contents

1. Inventory - reuse before you build
2. Base UI specifics
3. Buttons
4. Cards
5. Badges and status
6. Forms
7. Dialogs, sheets, menus, confirmation
8. Feedback: toasts, inline alerts, pending states
9. Navigation
10. Dashboards and data display
11. Empty, placeholder and loading states
12. Marketplace patterns
13. Writing a new component

---

## 1. Inventory - reuse before you build

| Need | Use | Where |
|---|---|---|
| Any button or button-styled link | `Button` (`variant`, `size`, `render={<Link/>}`) | `components/ui/button.tsx` |
| Container | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` | `ui/card.tsx` |
| Pill | `Badge` (`success` and `warning` variants for attribute pills that are good / need action) | `ui/badge.tsx` |
| Lifecycle state (booking, payment, listing) | `StatusBadge` + mapper in `lib/bookings/status-badge.ts` | `shared/status-badge.tsx` |
| Form layout | `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription`, `FieldError`, `FieldSet`, `FieldLegend` | `ui/field.tsx` |
| Inputs | `Input`, `PasswordInput`, `Textarea`, `Switch`, `Label` | `ui/*` |
| Select | `NativeSelect` (styled native `<select>` + chevron, forwards ref for `register()`) | `ui/native-select.tsx` |
| Form/page message | `FormAlert` (`tone`: error -> `role=alert`, success, warning -> `role=status`) | `ui/form-alert.tsx` |
| Side panel / mobile drawer | `Sheet` (Base UI Dialog) | `ui/sheet.tsx` |
| Menu | `DropdownMenu*` | `ui/dropdown-menu.tsx` |
| Avatar | `Avatar`; in chat `MemberAvatar` (with verified tick) | `ui/avatar.tsx`, `chat/member-avatar.tsx` |
| Breadcrumbs | `Breadcrumb*`; dashboard uses `DashboardBreadcrumbs` (labels from `config/navigation.ts`) | |
| Dashboard page title | `PageHeader` (owns the `h1`) | `dashboard/page-header.tsx` |
| Homepage section title | `SectionHeading` (`h2`) | `marketplace/section-heading.tsx` |
| Metric tile | `StatCard` (value pre-formatted string) | `dashboard/stat-card.tsx` |
| Nothing to show | `EmptyState` | `shared/empty-state.tsx` |
| Not built yet | `PlaceholderCard` | `dashboard/placeholder-card.tsx` |
| Dashboard skeleton | `DashboardPageSkeleton` (`cards`, `withStats`) | `dashboard/dashboard-page-skeleton.tsx` |
| Generic skeleton | `Skeleton` | `ui/skeleton.tsx` |
| Pagination | `Pagination` (`page`, `totalPages`, `hrefFor`) - link-based, shareable | `shared/pagination.tsx` |
| Listing tile | `ListingCard` / `ListingsGrid` / `ListingCardSkeleton` | `marketplace/*` |
| Search term highlight | `HighlightText` | `shared/highlight-text.tsx` |
| Money | `formatPKR`, `formatPKRPerDay` | `lib/utils/currency.ts` |
| Class merging | `cn` | `lib/utils/cn.ts` |
| Brand mark | `Brand` / `DashboardBrand` | `shared/brand.tsx` |
| Skip link | `SkipToContent` + `MAIN_CONTENT_ID` | `shared/skip-to-content.tsx` |
| Focus helpers | `useFocusOnMount`, `useFocusReturn` | `src/hooks/` |

Not present yet: `Dialog`/`AlertDialog`, a custom `Select` listbox, `Tabs`, `Tooltip`, `Table`. If a design needs
one, add it with the shadcn CLI so it matches the `base-nova` style
(`npx shadcn@latest add dialog`), then read the generated file and align it with the local
primitives (radius, focus ring, tokens). Do not hand-roll a modal with `fixed inset-0` divs - it
will miss focus trapping, `Escape`, scroll locking and `aria-modal`.

## 2. Base UI specifics

The primitives are **Base UI** (`@base-ui/react`), not Radix. Generic shadcn snippets from the
internet will be wrong in small ways:

- Polymorphism is `render={<Link href="..." />}`, **not** `asChild`.
- `Button` derives `nativeButton` itself and renders links as real `<a>` (no `role="button"`).
  Do not pass `nativeButton` unless you know why.
- For a momentarily unavailable control that should keep focus, use `aria-disabled` (styled the
  same as `disabled`) and guard the handler. Use `disabled` when the control is meaningless.
- Sheet/Dialog parts: `Root`, `Trigger`, `Portal`, `Backdrop`, `Popup`, `Title`, `Description`,
  `Close`.
- An async Server Component inside a Suspense boundary *in the dashboard shell* caused Base UI id
  hydration mismatches - the layout awaits its data instead. Do not add Suspense to the shell.

## 3. Buttons

| Variant | When |
|---|---|
| `default` (navy) | the one primary action in a region |
| `outline` | secondary actions, filters, "Cancel" |
| `secondary` | low-emphasis action on a white card |
| `ghost` | toolbar/icon actions, menus, dense rows |
| `destructive` (tinted red) | delete, cancel booking, reject - irreversible or harmful |
| `link` | inline navigation inside text |

Sizes: `default` h-9, `lg` h-11 for hero/CTA and primary form submits on mobile, `sm`/`xs` for
dense rows, `icon*` for icon-only (with `aria-label`).

Rules:
- One primary per region. Two navy buttons side by side means one should be `outline`.
- Labels are verbs that say the outcome: "Request booking", "Approve request", not "Submit".
- A pending button keeps its width and shows progress: `<Loader2Icon className="animate-spin" />`
  plus pending copy ("Saving..."), with `aria-disabled` or `disabled` while pending.
- Emerald CTA (`bg-brand text-brand-foreground hover:bg-brand-hover`) is for the single most
  important conversion action on a **light** surface (hero, empty state) - not a general-purpose
  variant. Never on navy: emerald against navy is 2.66:1, so the button loses its edge. If it
  starts appearing in many places, add a `brand` variant to `buttonVariants` instead of
  repeating classes.
- On a navy band, the primary is the inverted light button; outline buttons need
  `border-background/50` or more. Fix the focus ring offset
  (`focus-visible:ring-offset-foreground`) - see `cta-section.tsx`.

## 4. Cards

`Card` is white (`bg-card`), `border`, `rounded-xl`, no shadow, 20px internal spacing. Use
`size="sm"` in dense lists. `CardFooter` is a muted strip for secondary meta or actions.

- Hierarchy inside a card: title (`CardTitle`) -> key fact (price, date, status) -> supporting
  meta in `text-muted-foreground text-xs/sm` -> actions trailing or in the footer.
- A whole-card link wraps the content in one `<Link>`; interactive children (save, menu) sit as
  *siblings* positioned absolutely - a button inside an anchor is invalid and races navigation
  (see `ListingCard`).
- Hover on clickable cards: subtle - border darkens (`hover:border-foreground/20`) or image scales
  `1.03`. No lift-and-shadow bounce.
- Do not invent a new card style per feature. Admin cards, booking cards and owner listing cards
  share the same shell; differences are content, not chrome.

## 5. Badges and status

`StatusBadge` encodes *state class* with a glyph so it reads without colour:

| Variant | Glyph | Meaning | Examples | Colour (once palette applied) |
|---|---|---|---|---|
| `default` | filled dot | settled in the user's favour | Paid, Live, Rented out | success-soft bg, success-soft-foreground text, emerald dot |
| `secondary` | open ring | waiting on someone | Awaiting owner, Awaiting payment | muted bg, foreground text |
| `outline` | dash | closed, nothing to do | Completed, Cancelled, Expired | border, muted-foreground text |
| `destructive` | cross | went wrong | Declined, Failed, Rejected | destructive tint |

Moving `default` to success-soft is **two** changes, not one: today its glyph is
`bg-primary-foreground` (white, for a navy pill), which is 1.05:1 on `#ECFDF5` and disappears. Add
a `success` variant to `Badge` used only by `StatusBadge`, and make the filled dot `bg-success`
(5.21:1). Do not recolour `Badge`'s own `default` - plain attribute pills would turn green.

Rules:
- Labels come from the mapper (`bookingBadge` etc.), which reads *facts* (the Payment row), not
  just the status enum. Do not re-derive labels in a component.
- If a new state needs "attention required from you", that is a warning concept: warning-soft
  surface + `TriangleAlertIcon`. Add it as a deliberate variant, do not reuse `destructive`.
- Plain `Badge` is for attributes (condition, category, counts), not lifecycle.
- Keep badges short (1-3 words, `·` to join a qualifier: "Approved · not paid yet").

## 6. Forms

Pattern (see `profile-form.tsx`, `listing-fields.tsx`):

```tsx
<form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
  {formError && (
    <div role="alert" className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm">
      {formError}
    </div>
  )}
  <FieldGroup>
    <Field data-invalid={Boolean(errors.name)}>
      <FieldLabel htmlFor="name">Display name</FieldLabel>
      <Input id="name" autoComplete="name" aria-invalid={Boolean(errors.name)}
             disabled={isSubmitting} {...form.register("name")} />
      <FieldDescription>Shown on your listings and public profile.</FieldDescription>
      <FieldError errors={[errors.name]} />
    </Field>
  </FieldGroup>
  <Button type="submit" disabled={isSubmitting || !isDirty}>Save changes</Button>
</form>
```

- `react-hook-form` + `zodResolver`, schema from `src/lib/validations/` - the same schema the
  Server Action re-validates. Never validate only on the client.
- Every control has a visible `<FieldLabel htmlFor>`; placeholder is an example, not a label.
- Errors: `aria-invalid` on the control, `data-invalid` on the `Field`, message via `FieldError`.
  Server errors from `ActionResult` go in the `role="alert"` block or a toast.
- Selects are `NativeSelect` (`components/ui/native-select.tsx`) - never a bare `<select>` or a
  local class string; the old `SELECT_CLASS` copies were removed for drifting.
- Group related fields with `FieldSet` + `FieldLegend`. Use `autoComplete` attributes.
- Prices are PKR integers; show the currency in the label or as an inline prefix, and format
  display values with `formatPKR`.
- Mobile: single column; `Input` is 16px below `md` to stop iOS zoom. Submit can go full width
  (`w-full sm:w-auto`).

## 7. Dialogs, sheets, menus, confirmation

- `Sheet` for filters on mobile (`ListingsFiltersSheet`) and mobile nav (`DashboardMobileNav`).
- `DropdownMenu` for overflow actions and the user menu. Menu items use `--accent` for hover - this
  is why emerald must never go into `--accent`.
- Confirmation of destructive actions currently uses `window.confirm` (`owner-listing-card.tsx`,
  `edit-listing-form.tsx`, `connected-accounts.tsx`). It is accessible and honest; replacing it
  with an `AlertDialog` is an improvement only when done for all three consistently.
- Any dialog: title, description, focus moves in on open and returns to the trigger on close
  (`useFocusReturn`), `Escape` closes, primary action last, destructive actions use the
  `destructive` variant and say exactly what will happen.

## 8. Feedback: toasts, inline alerts, pending states

- Server Actions return `ActionResult<T>` (`{ success: true, data } | { success: false, error }`
  from `src/types`). Callers branch on it: `toast.error(result.error)` or
  `toast.success("Booking requested.")`, and roll back any optimistic update. Actions never
  redirect - pages do (see AGENTS.md).
- Toasts (`sonner`) are the inverted slip defined in `ui/sonner.tsx`: confirmation of something
  that just happened. Persistent or blocking information is inline, not a toast.
- Inline banners: `role="status"` for neutral info, `role="alert"` for errors. Success banners use
  success-soft; warnings warning-soft with a `TriangleAlertIcon`.
- Pending: `useTransition` + `isPending`; keep layout stable; announce via button copy.
- Toast copy is a past-tense fact plus consequence: "Claim decided. Both parties have been told."

## 9. Navigation

- Marketplace: sticky `SiteHeader` (`h-16`, `border-b`, `bg-background`), `max-w-7xl`
  container; `SiteFooter`.
- Dashboard: `DashboardSidebar` (desktop) + `DashboardMobileNav` (sheet), items from
  `DASHBOARD_NAV` in `src/config/navigation.ts` - add routes there, plus `PATH_LABELS` for
  breadcrumbs. Active item: `bg-sidebar-primary text-sidebar-primary-foreground` and
  `aria-current="page"`; inactive `text-foreground/70 hover:bg-sidebar-accent`.
- Every nav landmark has an `aria-label` ("Marketplace", "Dashboard").
- Badges on nav items (unread counts) come from the layout via `navBadges`, not fetched per item.

## 10. Dashboards and data display

- Page anatomy: `PageHeader` (title, one-line description, actions) -> optional `StatCard` row
  (`grid gap-4 sm:grid-cols-2 xl:grid-cols-4`; two-column content `grid gap-4 lg:grid-cols-2`) -> content cards/lists -> `Pagination`.
- Stat values are real aggregates from a Server Component query, formatted by the caller. Never
  fill a stat with a placeholder number in shipped code.
- Lists of records are cards on mobile; a table only when users compare columns, wrapped in
  `overflow-x-auto` inside a `min-w-0` parent.
- Charts: single-series bars in navy (`--chart-1`); title names the measure, so no legend for one
  series (see `admin/city-bar-chart.tsx`). Add emerald only to highlight one series or value.
- Dates via `lib/utils/date.ts`; money via `formatPKR`; cities via `formatCity`.

## 11. Empty, placeholder and loading states

- `EmptyState` = the feature works, there is nothing here; offer the recovery (`action`).
  Copy: what is empty + what to do ("No bookings yet" / "When someone requests one of your
  items it will appear here.").
- `PlaceholderCard` = not built yet. Never use it for an empty result.
- Skeletons mirror the final layout (same grid, same card heights) so nothing jumps.
  Route-level `loading.tsx` only where no descendant can 404 - see `page-patterns.md`.

## 12. Marketplace patterns

- Listing card: frameless (image + text, no card border), 4:3 image `rounded-xl`, condition badge
  top-right, save button top-left, category eyebrow, 2-line clamped title with `min-h-10` so
  prices align, price in `font-heading`, city with `MapPinIcon`.
- Images: `next/image` with `fill` + accurate `sizes`; `priority` only for the first row; alt is
  the listing title.
- Hero: left-aligned and type-led, not a stock-photo carousel. CTA band: full-bleed navy
  (`bg-foreground text-background` today -> navy automatically).
- Trust elements (verified owner, rental protection, reviews) are calm and factual - a badge and
  a sentence, never a wall of shields.

## 13. Writing a new component

```tsx
import { SomeIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

import type { ReactNode } from "react";

interface ThingSummaryProps {
  title: string;
  /** Pre-formatted - the caller knows whether this is PKR, a count or a date. */
  value: string;
  className?: string;
}

/**
 * One-paragraph explanation of what this is for and why it is shaped this way.
 */
function ThingSummary({ title, value, className }: ThingSummaryProps) {
  return <Card className={cn("gap-3", className)}>...</Card>;
}

export { ThingSummary };
```

- kebab-case file in the feature folder (`components/bookings/booking-summary.tsx`); shared
  pieces in `components/shared/`; primitives in `components/ui/`.
- Named export at the bottom; props interface `XxxProps`; accept `className` and merge with `cn`.
- Import order: packages, blank line, `@/` modules, blank line, `import type`.
- Server Component by default; a client component takes serialisable props and lives at the
  leaf.
- Strict TS with `exactOptionalPropertyTypes`: spread optional handlers
  (`{...(onClick ? { onClick } : {})}`) rather than passing `undefined`.
- A docblock explaining *why*, matching neighbouring files; no comments that restate the code.
