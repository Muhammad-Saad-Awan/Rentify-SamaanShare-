# UI review checklist

Use this to review a diff, PR, file or screen. Run the audit script first so your attention goes to
the judgement calls, not to grepping:

```bash
node .claude/skills/samaanshare-ui/scripts/audit-ui.mjs              # whole src/
node .claude/skills/samaanshare-ui/scripts/audit-ui.mjs $(git diff --name-only main...HEAD)
node .claude/skills/samaanshare-ui/scripts/contrast.mjs --tokens     # if globals.css changed
```

The script flags candidates; verify each in context before reporting it (a raw colour in a third-
party logo is fine, one in a booking card is not).

## Severity

| Level | Meaning | Examples |
|---|---|---|
| **Blocker** | breaks behaviour, status codes, security or a11y for real users | soft 404 from `loading.tsx`, `notFound()` in a page under a fallback, lost auth check, button inside a link, control without a label, AA failure on body text, changed action/query logic in a "UI" change, fake data or a no-op button |
| **Major** | visibly off-brand or inconsistent, or a degraded experience | raw palette colours / hex, new one-off card or button style, emerald used as `--accent`, missing empty/loading/error state, no mobile layout, colour as the only state signal, missing focus style |
| **Minor** | polish | off-scale spacing or type, inconsistent tracking, extra shadow, icon sizing, copy tone |
| **Nit** | optional | naming, comment wording, class order (prettier handles most) |

## 1. Architecture and conventions (check first - these are the expensive bugs)

- [ ] `[param]` routes validate and `notFound()` in `layout.tsx`; `not-found.tsx` one level up.
- [ ] No new `loading.tsx` in or above a segment with a 404-able descendant; list pages above
      `[id]` routes use keyed in-page `<Suspense>`.
- [ ] No Suspense added inside the dashboard shell.
- [ ] Server Component unless it needs client features; `"use client"` at the leaf; no server
      imports (`@/lib/prisma`, `@/lib/queries`) in client files; props serialisable.
- [ ] Pages: `requireUser()` / `requireAdmin()` still present; actions return `ActionResult`, do
      not redirect.
- [ ] Public listing reads use `VISIBLE_LISTING_WHERE`; counts use the same predicate as lists.
- [ ] Business logic, Server Actions, existing queries, the Prisma schema and validation schemas
      untouched by a UI change. A new read-only query is acceptable if it is scoped to the session
      user (or `VISIBLE_LISTING_WHERE`), selects only displayed fields, and is called out.
- [ ] No fake functionality: every button does something real, every number is real, unbuilt
      sections use `PlaceholderCard` honestly.
- [ ] Existing components reused (`PageHeader`, `EmptyState`, `StatusBadge`, `StatCard`, `Button`
      with `render={<Link/>}`...). No near-duplicates.
- [ ] Base UI idioms: `render` not `asChild`; no `role="button"` on links; no hand-rolled modal.
- [ ] kebab-case filenames, named exports, `XxxProps`, `cn` for classes, import grouping, why-
      comments matching the file.
- [ ] `metadata` exported on new pages.

## 2. Colour and tokens

- [ ] Only semantic tokens (`bg-primary`, `text-muted-foreground`, `border-border`, `bg-brand`,
      `bg-success-soft`...). No `bg-emerald-*`, `text-slate-*`, `#hex`, `oklch()` in components.
- [ ] Brand tokens used only if they exist in `globals.css` (palette status - see
      `design-tokens.md` §2).
- [ ] Emerald used sparingly for brand/success/verified/focus - not for generic buttons, not in
      `--accent`, not as large background areas.
- [ ] `#059669` / `--brand-bright` and `#D97706` / `--warning` never carry text on light surfaces.
- [ ] Colour never the only signal (glyph, label, icon or text alongside).
- [ ] No decorative gradients, glows, glassmorphism.
- [ ] Every new token has a `.dark` value.

## 3. Typography

- [ ] Headings `font-heading`, body `font-sans`; prices and stat values `font-heading`.
- [ ] Sizes on the scale in `design-tokens.md` §5; no new `text-[Npx]`; nothing a user must read
      under 12px.
- [ ] Tracking from the approved set; long text constrained (`max-w-[65ch]`).
- [ ] One `h1`, sequential heading levels; headings are real `h*` elements, not styled divs.

## 4. Spacing, layout, elevation

- [ ] Uses `gap-*` and the spacing table; consistent within a component and with siblings.
- [ ] Dashboard pages do not re-add the layout's container padding/max width.
- [ ] Radius consistent (`rounded-lg` controls, `rounded-xl` cards); nested radii shrink inward.
- [ ] Borders for structure; shadows only for floating layers.
- [ ] Alignment: baselines line up across cards in a grid (fixed title height, `mt-auto` footers).

## 5. Components and states

- [ ] One primary button per region; labels are specific verbs.
- [ ] Loading (skeleton matching layout), empty (`EmptyState` with a way forward), error, success
      and pending states all present.
- [ ] Pending: `useTransition`, button shows progress, no double submit.
- [ ] Forms: visible labels, `aria-invalid` + `FieldError`, `autoComplete`, client and server
      validation from the same schema, server error surfaced.
- [ ] Destructive actions confirmed and labelled with the consequence.
- [ ] Status shown through `StatusBadge` + the shared mapper, not ad-hoc badges.

## 6. Accessibility

- [ ] Text contrast >= 4.5:1, large text and control borders >= 3:1 (measure with
      `contrast.mjs`).
- [ ] Every interactive element keyboard reachable, visible `focus-visible` ring, logical order.
- [ ] Icon-only buttons have `aria-label`; decorative icons `aria-hidden`.
- [ ] No interactive element nested in another (button in link).
- [ ] Dynamic updates announced (`role="status"`/`alert`, toast); focus managed on open/close.
- [ ] Images: meaningful `alt` or `alt=""` when decorative; `next/image` with `sizes`.
- [ ] Touch targets >= 36px; reduced motion respected.

## 7. Responsive

- [ ] Works at 360px with no horizontal scroll (`min-w-0` on flex children, truncation).
- [ ] Layout steps up sensibly at `sm`/`lg`/`xl`; filters and nav move into `Sheet` on mobile.
- [ ] Inputs 16px on mobile (the `Input` default) - not overridden to `text-sm` everywhere.

## 8. Visual quality ("does it look like SamaanShare")

- [ ] Calm, confident hierarchy: one focal point per section, generous whitespace, left-aligned
      text.
- [ ] Navy carries authority, emerald marks what is good/trusted, neutrals do the rest.
- [ ] No generic AI-template tells: centred everything, emoji, icon on every heading, gradient
      hero, three identical feature cards with blobs, rainbow badges.
- [ ] Consistent with the neighbouring screens - would a user notice the seam?

## Report format

```markdown
## UI review: <scope>

**Summary:** <1-3 sentences: overall quality, the most important issue, ship/no-ship opinion>

### Blockers
1. **<short title>** - `path/to/file.tsx:42`
   <what is wrong> -> <why it matters for users/the codebase>
   **Fix:** <concrete change, with the class names or code>

### Major
...

### Minor
...

### Nits
...

### What is good
- <specific things worth keeping, so they are not "fixed" away>

**Checked with:** audit-ui.mjs, contrast.mjs, <lint/type-check if run>. **Not verified:** <e.g. no browser - visual/responsive checks are from code only>
```

Omit empty severity sections. Order by severity, then by user impact. Every finding has a
`file:line` and a concrete fix. Do not pad the report with checklist items that passed.

**Do not modify files during a review** unless the user explicitly asked for fixes. When asked to
fix: apply Blockers and Majors first, keep each fix minimal, preserve behaviour, re-run the audit
script, and list what was changed and what was left.
