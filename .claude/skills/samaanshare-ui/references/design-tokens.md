# Design tokens

The single source of truth is `src/app/globals.css`. This file explains what each token is *for*,
records the decided Navy + Emerald palette, and gives the scales for type, spacing, radius,
elevation and motion.

## Contents

1. Brand palette and roles
2. Palette status and migration
3. Semantic token map (light and dark)
4. Colour usage rules
5. Typography
6. Spacing and layout widths
7. Radius
8. Elevation
9. Motion
10. Iconography

---

## 1. Brand palette and roles

| Name | Hex | Role | Text on white? |
|---|---|---|---|
| Deep Navy | `#142B3B` | ink, primary actions, dark bands, active nav | 14.6:1 - yes |
| Emerald | `#047857` | brand accent, success, verified, focus ring | 5.48:1 - yes |
| Emerald 600 | `#059669` | non-text accents only: icons, chart marks, progress | 3.77:1 - **no** |
| Emerald 800 | `#065F46` | hover/pressed emerald; text on `#ECFDF5` | 7.68:1 - yes |
| Emerald 50 | `#ECFDF5` | success-soft surface (badges, banners) | n/a (surface) |
| Page | `#F8FAFC` | page background; cards stay white on it | n/a |
| Warning | `#D97706` | fills, icons, borders for "needs attention" | 3.19:1 - **no** |

Derived to make the palette usable (not part of the brief, chosen to pass AA):

| Hex | Used for | Why |
|---|---|---|
| `#F1F5F9` | `--muted`, `--secondary` | navy-tinted neutral surface |
| `#E9EEF3` | `--accent` (hover surface) | one step darker than muted, so hover is visible on muted |
| `#536273` | `--muted-foreground` | 5.7:1 on muted, safe at 12px |
| `#E2E8F0` | `--border` | dividers and card edges (decorative, no ratio required) |
| `#7B8A9A` | `--input` | 3.37:1 - control boundaries must meet 3:1 (WCAG 1.4.11) |
| `#92400E` on `#FFFBEB` | warning-soft text/surface | `#D97706` cannot carry text |

**Emerald is an accent and the success colour, not the primary.** Navy does the work - buttons,
headings, active states. Emerald appears where something is *good or trusted*: paid, verified,
rented out, a confirmed handover, a key conversion button on a light surface, the focus ring.
Emerald does **not** go on navy as a fill: `#047857` against `#142B3B` is 2.66:1, so a button there
has no visible edge. On a navy band the primary action is the inverted light button.
If more than roughly one emerald element competes for attention in a viewport, it stops meaning
anything.

## 2. Palette status and migration

`globals.css` shipped the monochrome redesign (black on white, `--primary: oklch(0 0 0)`); the
Navy + Emerald palette was applied on the `feat/premium-redesign` branch. Check which you have:

```bash
grep -n "\-\-primary:" src/app/globals.css
# applied   -> --primary: oklch(0.278 0.042 240.8);
# monochrome -> --primary: oklch(0 0 0);
```

**While monochrome is still in place:** write components against semantic tokens exactly as
below. They become navy/emerald automatically when the palette lands. Do not use `bg-brand`,
`bg-success` etc. until those tokens exist - Tailwind v4 emits nothing for an unknown colour, so
the element just renders unstyled, with no error.

**Applying the palette** (only when the user asks for it):

1. Replace the `:root` and `.dark` blocks with section 3 below, keeping the explanatory comments
   style of the file. Update the header comment that says no palette has been decided.
2. Add to `@theme inline`:
   ```css
   --color-brand: var(--brand);
   --color-brand-foreground: var(--brand-foreground);
   --color-brand-hover: var(--brand-hover);
   --color-brand-bright: var(--brand-bright);
   --color-success: var(--success);
   --color-success-foreground: var(--success-foreground);
   --color-success-soft: var(--success-soft);
   --color-success-soft-foreground: var(--success-soft-foreground);
   --color-warning: var(--warning);
   --color-warning-foreground: var(--warning-foreground);
   --color-warning-soft: var(--warning-soft);
   --color-warning-soft-foreground: var(--warning-soft-foreground);
   ```
3. Update the `::selection` rule if desired (navy background, white text works).
4. Run `node .claude/skills/samaanshare-ui/scripts/contrast.mjs --tokens` - every pair must pass.
5. Fix the known off-system colours (`offer-card.tsx` emerald/amber borders -> `border-success` /
   `border-warning`; `member-avatar.tsx` `fill-sky-500` -> `fill-brand text-brand-foreground`).
6. The hand-inverted CTA band (`cta-section.tsx`) becomes navy automatically. Keep its inverted
   light primary button (navy text on `#F8FAFC`, 13.95:1) - an emerald fill on navy is 2.66:1 and
   loses its edge. Raise the outline button's `border-background/30` to `/50` (4.61:1); `/30`
   is 2.57:1 on navy, and already fails today on black (2.46:1).
7. Run `npm run test:a11y` and the dark-theme spec; verify the home, browse, listing, dashboard
   and admin pages visually.

## 3. Semantic token map

Validated with `scripts/contrast.mjs --tokens` - all light and dark pairs pass AA.

```css
:root {
  --background: oklch(0.984 0.003 247.9); /* #F8FAFC */
  --foreground: oklch(0.278 0.042 240.8); /* #142B3B deep navy */
  --card: oklch(1 0 0); /* #FFFFFF */
  --card-foreground: oklch(0.278 0.042 240.8);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.278 0.042 240.8);
  --primary: oklch(0.278 0.042 240.8); /* #142B3B */
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.968 0.007 247.9); /* #F1F5F9 */
  --secondary-foreground: oklch(0.278 0.042 240.8);
  --muted: oklch(0.968 0.007 247.9); /* #F1F5F9 */
  --muted-foreground: oklch(0.490 0.033 251.7); /* #536273 */
  --accent: oklch(0.947 0.009 247.9); /* #E9EEF3 hover surface, NOT emerald */
  --accent-foreground: oklch(0.278 0.042 240.8);
  --destructive: oklch(0.55 0.22 27);
  --brand: oklch(0.508 0.105 165.6); /* #047857 emerald */
  --brand-foreground: oklch(1 0 0);
  --brand-hover: oklch(0.432 0.086 166.9); /* #065F46 */
  --brand-bright: oklch(0.596 0.127 163.2); /* #059669 non-text only */
  --success: oklch(0.508 0.105 165.6); /* #047857 */
  --success-foreground: oklch(1 0 0);
  --success-soft: oklch(0.979 0.021 166.1); /* #ECFDF5 */
  --success-soft-foreground: oklch(0.432 0.086 166.9); /* #065F46 */
  --warning: oklch(0.666 0.157 58.3); /* #D97706 */
  --warning-foreground: oklch(0.278 0.042 240.8); /* navy on amber, 4.59:1 */
  --warning-soft: oklch(0.987 0.021 95.3); /* #FFFBEB */
  --warning-soft-foreground: oklch(0.473 0.125 46.2); /* #92400E */
  --border: oklch(0.929 0.013 255.5); /* #E2E8F0 */
  --input: oklch(0.627 0.030 250.0); /* #7B8A9A, 3:1 for control edges */
  --ring: oklch(0.508 0.105 165.6); /* emerald focus */
  --chart-1: oklch(0.278 0.042 240.8); /* navy */
  --chart-2: oklch(0.508 0.105 165.6); /* emerald */
  --chart-3: oklch(0.490 0.033 251.7); /* slate */
  --chart-4: oklch(0.596 0.127 163.2); /* emerald 600 */
  --chart-5: oklch(0.869 0.020 252.9); /* #CBD5E1 */
  --radius: 0.5rem;
  --sidebar: oklch(1 0 0);
  --sidebar-foreground: oklch(0.278 0.042 240.8);
  --sidebar-primary: oklch(0.278 0.042 240.8);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(0.968 0.007 247.9);
  --sidebar-accent-foreground: oklch(0.278 0.042 240.8);
  --sidebar-border: oklch(0.929 0.013 255.5);
  --sidebar-ring: oklch(0.508 0.105 165.6);
}

.dark {
  --background: oklch(0.210 0.029 239.3); /* #0B1A24 */
  --foreground: oklch(0.968 0.007 247.9); /* #F1F5F9 */
  --card: oklch(0.247 0.033 239.2); /* #11232F */
  --card-foreground: oklch(0.968 0.007 247.9);
  --popover: oklch(0.247 0.033 239.2);
  --popover-foreground: oklch(0.968 0.007 247.9);
  --primary: oklch(0.968 0.007 247.9);
  --primary-foreground: oklch(0.278 0.042 240.8);
  --secondary: oklch(0.320 0.043 237.2); /* #1C3646 */
  --secondary-foreground: oklch(0.968 0.007 247.9);
  --muted: oklch(0.320 0.043 237.2);
  --muted-foreground: oklch(0.711 0.035 256.8); /* #94A3B8 */
  --accent: oklch(0.320 0.043 237.2);
  --accent-foreground: oklch(0.968 0.007 247.9);
  /* Lighter than shadcn's 0.704: destructive text on its own /20 tint was 4.26:1 on navy cards. */
  --destructive: oklch(0.75 0.16 22);
  --brand: oklch(0.773 0.153 163.2); /* #34D399 */
  --brand-foreground: oklch(0.210 0.029 239.3);
  --brand-hover: oklch(0.845 0.130 165.0); /* #6EE7B7 */
  --brand-bright: oklch(0.773 0.153 163.2);
  --success: oklch(0.773 0.153 163.2);
  --success-foreground: oklch(0.210 0.029 239.3);
  --success-soft: oklch(0.319 0.052 173.1); /* #0F3B30 */
  --success-soft-foreground: oklch(0.845 0.130 165.0); /* #6EE7B7 */
  --warning: oklch(0.837 0.164 84.4); /* #FBBF24 */
  --warning-foreground: oklch(0.210 0.029 239.3);
  --warning-soft: oklch(0.297 0.050 80.3); /* #3A2A0C */
  --warning-soft-foreground: oklch(0.879 0.153 91.6); /* #FCD34D */
  --border: oklch(1 0 0 / 10%);
  --input: oklch(0.564 0.038 247.1); /* #64788B */
  --ring: oklch(0.773 0.153 163.2);
  --chart-1: oklch(0.968 0.007 247.9);
  --chart-2: oklch(0.773 0.153 163.2);
  --chart-3: oklch(0.711 0.035 256.8);
  --chart-4: oklch(0.845 0.130 165.0);
  --chart-5: oklch(0.376 0.044 237.2);
  --sidebar: oklch(0.247 0.033 239.2);
  --sidebar-foreground: oklch(0.968 0.007 247.9);
  --sidebar-primary: oklch(0.968 0.007 247.9);
  --sidebar-primary-foreground: oklch(0.278 0.042 240.8);
  --sidebar-accent: oklch(0.320 0.043 237.2);
  --sidebar-accent-foreground: oklch(0.968 0.007 247.9);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.773 0.153 163.2);
}
```

Dark mode is wired but switched off (`THEME_CONFIG.darkMode.enabled = false` in
`src/config/theme.ts`). Still give every new token a `.dark` value - `tests/e2e/dark-theme.spec.ts`
measures it, and enabling dark mode is meant to be a one-line change.

## 4. Colour usage rules

| Need | Use | Not |
|---|---|---|
| Page canvas | `bg-background` | `bg-white` |
| Card / panel | `bg-card` + `border` | shadow-only cards |
| Body text | `text-foreground` | `text-black`, `text-slate-900` |
| Secondary text | `text-muted-foreground` | `text-foreground/60` (unmeasured opacity) |
| Primary action | `Button` default (navy) | emerald for every button |
| Brand highlight / key CTA on a light surface | `bg-brand text-brand-foreground hover:bg-brand-hover` | `#059669` behind white text (3.77:1) |
| Primary action on a navy band | inverted: `bg-background text-foreground hover:bg-background/90` | emerald fill on navy (2.66:1 edge) |
| Positive state | `StatusBadge` default -> success-soft styling | green text alone |
| Needs attention | `warning` fill or icon + navy text; `warning-soft` banner | `text-[#D97706]` |
| Failure / irreversible | `destructive` | warning |
| Hover surface | `hover:bg-muted` / `hover:bg-accent` | `hover:bg-brand/10` everywhere |
| Focus | `focus-visible:ring-2 ring-ring ring-offset-2 ring-offset-background` | removing outlines |
| Dark band | `bg-primary text-primary-foreground` (navy) | gradients |

Opacity modifiers (`/70`, `/85`) on text are allowed only where the result has been measured.
Measure with alpha: `node scripts/contrast.mjs '#F8FAFC@0.7' '#142B3B'`, and `--base <colour>` for
a translucent background sitting on something other than white.

### Verified combinations (WCAG 2.x, measured with `contrast.mjs`)

| Combination | Ratio | Result |
|---|---|---|
| navy text on page `#F8FAFC` / white card | 13.95 / 14.62 | AA |
| white on navy button; on navy `/85` hover | 14.62 / 9.10 | AA |
| `text-foreground/70` (inactive nav) on white | 5.55 | AA |
| muted text on page / card / muted / accent / `muted/60` footer | 5.97 / 6.25 / 5.70 / 5.35 / 5.91 | AA |
| white on emerald `#047857` | 5.48 | AA |
| emerald `#047857` text on white / page / `#ECFDF5` | 5.49 / 5.24 / 5.21 | AA |
| `#065F46` on `#ECFDF5` (success badge) | 7.28 | AA |
| navy on `#D97706` (warning fill) | 4.59 | AA |
| `#92400E` on `#FFFBEB` (warning banner) | 6.85 | AA |
| destructive on its `/10` and `/8` tints (light) | 4.57 / 4.73 | AA |
| `#F8FAFC/70` on navy band (CTA copy) | 7.57 | AA |
| inverted light button on navy (and `/90` hover) | 13.95 / 11.56 | AA |
| outline border `background/50` on navy | 4.61 | 3:1 UI |
| `--input` `#7B8A9A` on white / page | 3.53 / 3.37 | 3:1 UI |
| emerald focus ring on page | 5.24 | 3:1 UI |
| `#059669` on white | 3.77 | icons/large text only |
| `#D97706` on white / `#FFFBEB` | 3.19 / 3.07 | icons/borders only |
| `#E2E8F0` border on white | 1.23 | decorative dividers only - never the sole edge of a control |
| emerald `#047857` fill on navy | 2.66 | **do not use** |
| `background/30` outline border on navy | 2.57 | **do not use** (use `/50`) |
| dark: muted `#94A3B8` on card / secondary | 6.28 / 4.92 | AA |
| dark: `#34D399` on card; dark text on `#34D399` | 8.37 / 9.20 | AA |
| dark: destructive `oklch(0.75 0.16 22)` on its `/20` tint / card | 4.77 / 6.62 | AA |
| dark: `#0B1A24/70` on light CTA band | 6.29 | AA |
| dark: `--input` `#64788B` on background | 3.87 | 3:1 UI |

Re-run `node .claude/skills/samaanshare-ui/scripts/contrast.mjs --tokens` after any token edit.

**No gradients** as decoration. A subtle image scrim (`bg-gradient-to-t from-black/50`) for text
over a photo is the one acceptable use.

## 5. Typography

- `font-sans` - Inter: body, labels, controls, tables.
- `font-heading` - Schibsted Grotesk (500-800): headings, prices, stat values, brand moments.
- Body defaults: `text-sm` in the dashboard, `text-[0.9375rem]`/`text-base` for marketing copy.
  Inputs are `text-base md:text-sm` (16px on mobile prevents iOS zoom - keep it).

| Role | Classes |
|---|---|
| Hero h1 (marketplace, once per site) | `font-heading text-[2.75rem] sm:text-6xl lg:text-7xl leading-[0.95] font-extrabold tracking-[-0.035em]` - `hero-section.tsx` |
| Band / CTA h2 | `font-heading text-3xl sm:text-4xl leading-[1.05] font-extrabold tracking-[-0.03em]` - `cta-section.tsx` |
| Page h1 (dashboard) | `font-heading text-2xl sm:text-3xl font-bold tracking-[-0.025em]` - via `PageHeader` only |
| Section h2 | `font-heading text-2xl sm:text-3xl font-bold tracking-[-0.025em]` - via `SectionHeading` |
| Card title | `CardTitle` (`font-heading text-base font-semibold tracking-tight`) |
| Stat value | `font-heading text-3xl font-bold tracking-[-0.025em]` |
| Price | `font-heading font-bold tracking-tight`, formatted with `formatPKR` / `formatPKRPerDay` |
| Eyebrow / meta | `text-xs text-muted-foreground` (sentence case; `uppercase tracking-wide` sparingly) |
| Long text | `max-w-[65ch] leading-relaxed text-pretty` |

Rules: tracking is `tracking-tight` or `tracking-[-0.025em]` for headings, `-0.03em`/`-0.035em`
for display sizes only - do not invent new values. Avoid `text-[10px]`/`text-[11px]`: 12px
(`text-xs`) is the floor for anything a person must read; tiny counters inside badges are the
only exception. Headings use `text-wrap: balance` globally.

## 6. Spacing and layout widths

Tailwind's 4px scale. Prefer `gap-*` on flex/grid over margins.

| Context | Value |
|---|---|
| Dashboard content | `mx-auto max-w-6xl px-4 py-8 lg:px-8 lg:py-10 gap-8` (set by the layout - do not repeat) |
| Marketplace container | `mx-auto max-w-7xl px-4 lg:px-6` |
| Marketplace page body | `flex flex-col gap-20 py-16 lg:py-20` between sections; `gap-7` heading-to-content inside a section |
| Full-bleed band | `<section>` edge to edge, inner container `py-16 sm:py-20` |
| Card padding | `Card` sets `--card-spacing: 5` (20px), `size="sm"` -> 16px |
| Stack inside a card | `gap-3` to `gap-4`; between form fields `gap-5` (`FieldGroup`) |
| Grid gaps | listing grid `gap-x-5 gap-y-10`, `1 / sm:2 / lg:3 / xl:4` cols; tiles `gap-3 sm:gap-4` |
| Inline icon + text | `gap-1.5` (small) / `gap-2` |

## 7. Radius

`--radius: 0.5rem`. Inputs and buttons `rounded-lg`, small buttons `rounded-md`, cards and
listing images `rounded-xl`, chat bubbles and offer cards `rounded-2xl`, badges and avatars
`rounded-full`. Do not mix radii inside one component, and nested radii shrink inward (outer
`rounded-xl`, inner `rounded-lg`).

## 8. Elevation

Borders carry structure; shadows are rare and mean "floating above the page".

| Level | Use |
|---|---|
| none + `border` | cards, panels, tiles - the default |
| `shadow-xs` | chat offer cards, small raised controls |
| `shadow-md` | dropdowns, popovers, toasts |
| `shadow-lg` | sheets and dialogs |

Never stack a heavy shadow and a strong border, and never use coloured glows.

## 9. Motion

- `transition-colors duration-150` for hovers; `transition-[color,background-color,border-color,box-shadow]`
  on primitives.
- Listing image hover: `transition-transform duration-500 ease-out group-hover:scale-[1.03]`.
- Press feedback: buttons already `active:translate-y-px`.
- Entrances use `tw-animate-css` (`animate-in fade-in-0 slide-in-from-*`) for overlays only.
- `prefers-reduced-motion` is handled globally in `globals.css`; do not override it.
- Nothing loops except a spinner (`Loader2Icon animate-spin`) while work is pending.

## 10. Iconography

`lucide-react` only, imported as `XxxIcon`. Default `size-4`; `size-3`/`3.5` in small buttons and
meta rows; `size-5` in empty states (`strokeWidth={1.75}`). Decorative icons get
`aria-hidden="true"`; an icon-only button needs an `aria-label` or `sr-only` text. Do not put an
icon in front of every heading.
