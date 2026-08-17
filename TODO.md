# SamaanShare - Development Backlog

**Last Updated:** 17 August 2026 (Phase 5 — directional rating aggregate; Trust & Safety — reporting and moderation; Stage A6 awaiting production env vars)
**Architecture Version:** 1.0 (Locked)

This document serves as the main development backlog for SamaanShare. Tasks are organized by phase and should be completed in order.

---

## Legend

- [ ] Not started
- [x] Completed
- 🚧 In progress (update manually)

---

## Phase 0 – Foundation

### Project Setup

- [x] Initialize Next.js 15 with App Router
- [x] Configure TypeScript strict mode
- [x] Set up path aliases (`@/` for `src/`)
- [x] Configure `next.config.ts`

### Styling

- [x] Install and configure Tailwind CSS
- [x] Set up Tailwind configuration with custom theme
- [x] Configure CSS variables for theming
- [x] Install and initialize shadcn/ui
- [x] Add base shadcn/ui components (Button, Input, Card, etc.)

### Code Quality

- [x] Configure ESLint with Next.js rules
- [x] Configure Prettier
- [x] Set up `.prettierrc` configuration
- [x] Configure `eslint.config.mjs`
- [ ] Add lint-staged for pre-commit hooks
- [ ] Set up Husky for Git hooks
- [x] Create `.nvmrc` with Node.js version
- [x] Set up Vitest for the pure modules (parsers, formatters, pricing, calendar,
      lifecycle, deposit window, notification copy, environment schema, reset
      tokens, email copy, view keys, nav map, review rules, report rules,
      moderation copy, trust score, email verification tokens) — 303 tests
- [x] Integration verification for the booking lifecycle — `npm run verify:phase4`
      exercises the transactional paths against a real database (conflict safety,
      date release, compare-and-swap, idempotency) and `npm run verify:phase4:ui`
      renders both dashboards at every status behind a real session. Both create
      their own throwaway rows and delete them. `npm run verify:stage-a` does the
      same for the reset-token lifecycle, and `npm run verify:phase5` for the
      review lifecycle - including the assertion that a *withheld* review does
      not move the rating aggregate, and that the average a listing prints is
      computed over exactly the reviews listed beneath it, and
      `npm run verify:trust-safety` for reporting and moderation.
      **Not** a substitute for a Vitest
      integration harness: they are scripts with assertions, not a suite, and they
      cannot run without a database.

### Database

- [x] Install Prisma
- [x] Configure Prisma for PostgreSQL
- [x] Create initial `schema.prisma` (from DATABASE.md)
- [x] Set up Prisma client singleton
- [x] Create seed script (`prisma/seed.ts`)
- [x] Run initial migration (`20260728105436_20260728_init`)
- [x] Seed categories and initial data (verified: 7 categories, 30 subcategories)

### Authentication

- [x] Install Auth.js v5
- [x] Configure Auth.js with JWT strategy
- [x] Set up Credentials provider (email/password)
- [x] Set up Google OAuth provider (registered only when keys are present)
- [x] Create auth configuration (`auth.ts` + edge-safe `auth.config.ts`)
- [x] Configure the Prisma Adapter
- [x] Mount the Auth.js route handler (`api/auth/[...nextauth]`)
- [x] Augment Auth.js types (`src/types/next-auth.d.ts`)
- [x] Set up middleware for protected routes
- [x] Create session utilities (`requireUser`, `requireActiveUser`, `requireAdmin`)
- [x] Gate suspended / banned / soft-deleted accounts at sign-in

### Environment Variables

- [x] Create `.env.example` template
- [x] Create `.env.local` (gitignored)
- [x] Set up environment validation with Zod (Stage A3)
- [x] Document all required variables

### Project Structure

- [x] Create folder structure per PROJECT_STRUCTURE.md
- [x] Set up `src/app` directory structure
- [x] Create `src/components` directory structure
- [x] Create `src/lib` directory structure
- [x] Create `src/types` directory
- [x] Create `src/hooks` directory
- [x] Create `src/stores` directory

### Base Layout

- [x] Create root layout (`app/layout.tsx`)
- [x] Create metadata configuration
- [x] Set up fonts (Inter or similar)
- [x] Create header component — the *dashboard* header exists
      (`DashboardHeader`, Phase 2.1). This item is the **public/marketing**
      header, still outstanding.
- [x] Create footer component
- [x] Create mobile navigation — the *dashboard* drawer exists
      (`DashboardMobileNav`, Phase 2.1). Public mobile nav still outstanding.
- [x] Add theme provider (light/dark mode ready)

### Utilities

- [x] Create PKR currency formatter (`formatPKR`)
- [x] Create date utilities (Asia/Karachi timezone)
- [x] Create validation schemas (Zod)
- [x] Create action result types
- [ ] Create error handling utilities

### Verification

- [x] Verify development server runs
- [x] Verify database connection
- [ ] Verify Prisma Studio works
- [x] Verify TypeScript compilation
- [x] Verify ESLint passes
- [ ] Deploy to Vercel (staging) — prepared, see `docs/DEPLOYMENT.md` (A6)

---

## Phase 1 – Authentication

### Registration

- [x] Create registration page (`/register`)
- [x] Create registration form component
- [x] Add form validation (Zod + React Hook Form)
- [x] Create `registerUser` server action
- [x] Hash passwords with bcrypt (bcryptjs, cost 12)
- [ ] Send verification email (placeholder for MVP)
- [x] Handle registration errors
- [x] Add success redirect

### Login

- [x] Create login page (`/login`)
- [x] Create login form component
- [x] Add form validation
- [x] Create credentials login flow
- [x] Add Google OAuth button (rendered only when Google is configured)
- [x] Handle login errors
- [ ] Add "Remember me" option — needs a per-session `maxAge`, which under the
      JWT strategy means overriding `jwt.encode`. Deferred deliberately rather
      than shipped as a checkbox that does nothing.
- [x] Add redirect after login (`callbackUrl`, sanitised against open redirect)

### Password Reset

Completed in Stage A2 — see that section for the security reasoning.

- [x] Create forgot password page (`/forgot-password`) — 404s when email is
      unconfigured, mirroring the Google button: a recovery form that accepts an
      address and silently sends nothing is worse than none
- [x] Create `requestPasswordReset` action
- [x] Generate reset tokens — 32 random bytes, base64url, stored as SHA-256
- [x] Create reset password page (`/reset-password`) — deliberately does **not**
      404 when email is unconfigured, since an already-emailed token must stay
      redeemable; and deliberately does not validate the token on render, or a
      link preview would consume a single-use token before the user clicked
- [x] Create `resetPassword` action — signs the user in on success
- [x] Validate reset tokens — expired, spent and never-existed all report one
      identical message
- [x] Handle expiration — 1 hour, and single use is the stronger protection

### Email Verification

Shipped 17 August 2026 with the Identity Verification slice. Uses the Resend
integration Stage A2 added, so no new dependency.

- [x] Create verification page (`/verify-email`) — renders a **button**, not an
      effect on render. Redeeming is a write, and a write triggered by loading a
      page fires on every link preview, mail scanner and prefetch; a scanner
      spending the token would leave the person who actually clicked staring at
      "no longer valid". Same call as `viewCount` and `/reset-password`
- [x] Generate verification tokens — own `EmailVerificationToken` table. Sharing
      `PasswordResetToken` or Auth.js's `VerificationToken` would let a token
      minted to confirm an address be redeemed to reset a password: a privilege
      escalation between two credentials of very different strength
- [x] Create `verifyEmail` action — single-use by compare-and-swap on `usedAt`,
      and **requires the session to belong to the token's owner**, so a link
      forwarded or scraped from a mailbox cannot confirm the address on its own
- [x] **The token carries the address it was minted for.** Without it, changing
      an email to one you do not control and clicking an older link would mark
      the new address confirmed. Checked at redemption *and* enforced in the
      `updateMany` predicate, closing both ends of the race
- [x] Handle verification success/failure — expired, spent, stale and
      never-existed all report one identical message; distinguishing them would
      tell someone holding a leaked link whether it was ever real
- [x] Resend verification option — on `/profile`, and takes **no address
      parameter**. One would let any signed-in account send SamaanShare-branded
      mail to anyone, which is a spam relay with a login form in front of it
- [x] Sent on registration, best-effort — a Resend outage must not turn a
      completed signup into an error the user answers by registering again,
      straight into the "already exists" branch
- [x] 24-hour TTL, against the reset token's one hour. The threat is different:
      the worst a stale confirmation link can do is confirm an address that
      receiving it already confirmed, while a one-hour window would punish anyone
      who registers in the evening and reads their email next morning
- [x] **No enumeration rule here**, unlike password reset. That flow takes an
      address from an anonymous visitor, so any difference in its response leaks
      who has an account. This one only acts on the caller's own session, so the
      messages can be specific and useful

### User Profile

- [ ] Create profile page (`/profile`)
- [ ] Create profile view component
- [ ] Create edit profile form
- [ ] Create `updateProfile` action
- [ ] Add profile image upload (Cloudinary)
- [ ] Create `updateProfileImage` action
- [ ] Add Pakistani city selector
- [ ] Add phone number field (+92 format)

### Public Profile

Shipped 17 August 2026 as the Trust Profile & Reputation slice. This is what the
directional rating split was for: a reader here may be asking either question.

- [x] Create public profile page (`/users/[id]`) — the id is validated in
      `layout.tsx`, **not** the page, per the invariant in AGENTS.md. Verified
      with `curl -w '%{http_code}'`: unknown 404, suspended 404, soft-deleted
      404, active 200 — real statuses, not soft 404s
- [x] Display user info (name, bio, city) — never `email` or `phone`. The column
      is not even selected, so `getDisplayName`'s email fallback cannot fire
- [x] Display user's listings — through `VISIBLE_LISTING_WHERE`, composed rather
      than hand-written even though the owner is already known to be active
- [x] Display user's reviews — **both directions, as separate sections with their
      own averages**, which closes the Phase 5 item that was blocked on this page
- [x] Calculate and show trust score — `src/lib/trust/score.ts`, pure, 20 tests
- [x] `getUserReviewStats` — specced at `docs/API.md:691` with `asOwner`/`asRenter`
      from the start and unanswerable until the split. Deviates from that doc in
      one way: the averages are `number | null`, because an unrated person is not
      rated zero
- [x] **noindex.** Every fact here is already public on the member's listings, so
      this is not secrecy — it is aggregation. A listing page is about an item;
      this collects one person's whole history, location and reviews into a
      single document, and indexing that turns a marketplace profile into a
      searchable dossier on a named individual

### Session Management

- [x] Create session provider
- [x] Add session to client context
- [ ] Create `useSession` hook — `next-auth/react` already exports one; only
      needed if we want a project-specific wrapper
- [ ] Handle session expiration
- [x] Add logout functionality (`UserMenu` in the dashboard header, Phase 2.1)

### Protected Routes

- [x] Configure middleware for auth routes
- [x] Create auth guard wrapper (`requireUser` / `requireActiveUser` / `requireAdmin`)
- [x] Handle unauthorized access
- [x] Add redirect to login

---

## Phase 2.1 – Dashboard & Application Shell

Shell, routing and navigation only. Every section below is a placeholder page —
no listing, booking, search, review or admin functionality was implemented.

### Shell

- [x] Create authenticated dashboard layout (`(dashboard)` route group)
- [x] Create navigation config (`src/config/navigation.ts`)
- [x] Create responsive sidebar (`DashboardSidebar`, desktop `lg+`)
- [x] Create mobile drawer navigation (`DashboardMobileNav`, Sheet-based)
- [x] Create top header (`DashboardHeader`, sticky)
- [x] Create user menu with sign-out (`UserMenu`)
- [x] Create notification placeholder (`NotificationBell`)
- [x] Create breadcrumb support (`DashboardBreadcrumbs` + `buildBreadcrumbs`)
- [x] Create reusable layout components (`PageHeader`, `PlaceholderCard`,
      `StatCard`, `DashboardPageSkeleton`)
- [x] Add `loading.tsx` to every dashboard route
- [x] Add `sheet` and `breadcrumb` shadcn/ui primitives

### Placeholder pages

- [x] Dashboard Home (`/dashboard`)
- [x] My Listings (`/dashboard/listings`)
- [x] My Bookings (`/dashboard/bookings`)
- [x] Saved Listings (`/dashboard/saved`) — **note:** this file previously
      specified `/saved`. Moved under `/dashboard` so it inherits the existing
      `PROTECTED_PREFIXES` guard and matches the other dashboard sections.
- [x] Notifications (`/dashboard/notifications`)
- [x] Profile (`/profile`) — read-only session summary; editing still open
- [x] Settings (`/settings`)
- [x] Admin (`/admin`) — gated by `requireAdmin()` in `admin/layout.tsx`

### Protected routing

- [x] All dashboard routes protected via existing session utilities
- [x] Unauthenticated users redirected to login with `callbackUrl`
- [x] Authenticated users bounced away from `/login` and `/register`
- [x] Non-admins bounced from `/admin` (middleware) and rejected by the
      database re-read in `requireAdmin()`

### Sign-out

- [x] Add logout functionality (`UserMenu`, `signOut({ redirectTo: "/" })`) —
      closes the Phase 1 "Session Management" item that was blocked on having a
      header to hang it off

---

## Phase 2 – Marketplace (Browse & Search)

### Homepage

- [x] Create homepage (`/`)
- [x] Add hero section (Pakistani context)
- [x] Add category showcase grid
- [x] Add featured listings section
- [x] Add "How it works" section
- [x] Add city selector (Karachi, Lahore, Islamabad)
- [x] Add call-to-action sections
- [x] Optimize for SEO

### Listings Browse

- [x] Create listings page (`/listings`)
- [x] Create listings grid component
- [x] Create listing card component
- [x] Add pagination
- [x] Add loading skeletons
- [x] Add empty state

### Search

- [x] Create search input component
- [x] Implement keyword search
- [x] Add search to header
- [x] Create search results page — results render on `/listings?q=`; a separate
      route would be a second surface over identical data, splitting crawl signals
- [x] Highlight search terms

### Filters

- [x] Create filter sidebar component
- [x] Add category filter
- [x] Add subcategory filter
- [x] Add city filter (Pakistani cities)
- [x] Add min price filter (PKR)
- [x] Add max price filter (PKR)
- [x] Add condition filter (New, Like New, Good, Fair)
- [x] Add availability date filter
- [x] Create filter state management (URL params)
- [x] Add "Clear filters" button

### Sorting

- [x] Create sort dropdown component — built as a segmented link group, not a
      dropdown: four options fit inline, and links keep each ordering shareable
      and reachable with the back button
- [x] Add sort by newest
- [x] Add sort by price (low to high)
- [x] Add sort by price (high to low)
- [x] Add sort by rating
- [x] Persist sort in URL

### Category Pages

- [x] Create category page (`/categories/[slug]`)
- [x] Create category navigation
- [x] Add subcategory links
- [x] Display category-specific listings

### Wishlist

- [x] Create saved listings page (`/saved`)
- [x] Create `saveListing` action
- [x] Create `unsaveListing` action
- [x] Add save button to listing cards
- [x] Show saved state on cards

---

## Phase 3 – Listings

**Note:** this section was left unchecked after the work shipped in `e63e4ed` and
`27840ac`. Corrected on 11 August 2026 against the code, not against memory.

### Create Listing

- [x] Create new listing page (`/listings/new`)
- [x] Create multi-step listing form
- [x] Step 1: Basic info (title, description, category)
- [x] Step 2: Pricing (daily/weekly/monthly in PKR)
- [x] Step 3: Location (city, area)
- [x] Step 4: Images (up to 10)
- [x] Step 5: Review and submit
- [x] Create `createListing` action
- [x] Add form validation
- [x] Handle submission errors

### Image Upload

- [x] Set up Cloudinary integration (signed direct uploads)
- [x] Create image upload component
- [x] Add drag-and-drop support
- [x] Add image preview
- [ ] Implement image reordering — `updateListing` reconciles additions and
      removals only; see the note at `src/actions/listing-management.ts:126`
- [x] Add image deletion
- [x] Enforce 10 image limit
- [x] Compress images before upload
- [x] Create `addListingImages` action — folded into `updateListing` rather than
      a separate action, so one submission is one transaction
- [x] Create `removeListingImage` action — same
- [ ] Create `reorderListingImages` action — blocked on reordering above

### Listing Detail

- [x] Create listing detail page (`/listings/[id]`)
- [x] Create image gallery component
- [x] Add image zoom/lightbox
- [x] Display listing information
- [x] Show pricing breakdown (PKR)
- [x] Show security deposit
- [x] Display owner profile card
- [ ] Add contact owner button — no messaging system exists to hang it off;
      `Conversation`/`Message` are deferred to Phase 2 of the roadmap
- [x] Add save to wishlist button
- [x] Add share button (WhatsApp focus)
- [x] Show similar listings
- [x] Add breadcrumb navigation
- [x] Optimize for SEO (dynamic metadata)

### Edit Listing

- [x] Create edit listing page (`/listings/[id]/edit`)
- [x] Pre-populate form with existing data
- [x] Create `updateListing` action
- [x] Handle image changes
- [x] Add delete listing option

### Listing Management

- [x] Create my listings page (`/dashboard/listings`)
- [x] Show listing statistics (views) — fixed in Stage A5; see that section.
      Views are now recorded from a browser effect, so the detail page still does
      not mutate on GET.
- [ ] Show listing statistics (inquiries) — no source until messaging exists
- [x] Add listing status controls (active/paused)
- [x] Create `updateListingStatus` action
- [x] Add quick edit actions
- [x] Create `deleteListing` action (soft delete)

### Availability Calendar

- [x] Create availability calendar component
- [x] Mark available/unavailable dates
- [x] Create `updateListingAvailability` action (`toggleListingAvailability`)
- [x] Show booked dates
- [x] Sync with bookings — booking-held days are refused by the availability
      screen; only the booking actions release them

### Categories

- [x] Seed all categories from PRD (7 categories, 30 subcategories)
- [ ] Create category management (admin) — belongs with Phase 6 admin work
- [x] Add category icons (`Category.icon` + `categoryIcon()`)
- [ ] Create category tree structure

---

## Phase 4 – Booking System

### Booking Request

- [x] Create booking request component
- [x] Add date range picker
- [x] Show pricing calculation (PKR)
- [x] Show security deposit
- [x] Add payment method selection (Cash/Bank Transfer) — on `Payment`, not `Booking`, and
      narrowed to the two offline methods by `offlinePaymentMethodSchema`. The wallet and card
      values in `PaymentMethod` are deliberately unreachable: nothing can process them yet, so
      accepting one would write a payment no code path can complete.
- [x] Add booking notes field
- [x] Create `createBookingRequest` action
- [x] Check availability before booking
- [x] Handle booking conflicts — PENDING reserves the dates, and the
      `@@unique([listingId, date])` constraint decides the race inside the same transaction

### Booking Lifecycle

- [x] Implement PENDING status
- [x] Implement APPROVED status
- [x] Implement PAYMENT_PENDING status — entered when the renter chooses a method, which is what
      creates the `Payment` row. Payment confirmation does **not** leave this state: confirming
      money and handing over an item are separate events, often days apart for a transfer.
- [x] Implement ACTIVE status — `startBooking`, owner-driven, gated on a *confirmed* payment
- [x] Implement COMPLETED status — `completeBooking`, releases the held dates and stamps
      `completedAt`, which the deposit window is measured from
- [x] Implement REVIEWED status — driven by `createReview` when the second review lands, in the
      same transaction that publishes both. Tolerant of failure by design: if the booking has moved
      on, the reviews are still correctly published - the status is a convenience for the
      dashboards, not the source of truth for whether reviews exist.
- [x] Implement DECLINED status
- [x] Implement CANCELLED status — renter-driven, and refused once the owner has confirmed
      receiving payment. Payment is offline, so the platform cannot refund what it never held;
      a Cancel button there would imply a refund it cannot perform. See `canRenterCancel`.
- [x] Implement EXPIRED status (auto-expire after 48h) — lazy, not scheduled: swept on the
      read and write paths that care, so it cannot rot the way a stopped cron would

### Owner Actions

- [x] Create booking requests page (`/dashboard/requests`)
- [x] Show pending requests
- [x] Create `acceptBooking` action
- [x] Add pickup instructions form — collected as part of approving (Stage A1). Approval opens an
      inline panel prompting for a phone number, because until profiles carry a verified phone
      this field is the **only** channel between the two parties: the booking queries select the
      counterparty's `name` and nothing else. Editable for the whole live part of the booking via
      `updateBookingInstructions`, and editing notifies the renter — they may already have
      travelled on the old address.
- [x] Create `declineBooking` action
- [x] Add decline reason — inline panel on the card, no new UI primitive

### Payment Flow (Offline MVP)

- [x] Create payment instructions component (`PaymentInstructions`)
- [x] Show Cash payment instructions
- [x] Show Bank Transfer instructions — cannot include an account number: SamaanShare stores no
      owner bank details, deliberately, so the renter is told to ask the owner
- [x] Create `confirmPaymentReceived` action — records `confirmedAt` and `confirmedById`, so the
      row says *who* vouched for the money arriving. Idempotent: the timestamp cannot move.
- [x] Update booking to ACTIVE after payment — via `startBooking`, not as a side effect of
      confirmation. Keeping them separate is what gives the Trust & Safety handover record a
      place to attach.
- [x] Create `markDepositReturned` action

### Renter Actions

- [x] Create my bookings page (`/dashboard/bookings`)
- [x] Show booking status
- [x] Display pickup instructions (after approved)
- [x] Create `cancelBooking` action — releases the held dates
- [x] Show cancellation policy — stated where it applies rather than as a separate document: the
      card explains why cancelling is refused once payment is confirmed, and points the renter at
      the owner. A policy page claiming more than the platform can enforce would be worse.

### Booking Completion

- [x] Create `startBooking` action (pickup done)
- [x] Create `completeBooking` action (return done)
- [x] Trigger review prompts — `REVIEW_REMINDER` to both parties on completion. The prompt only;
      the review form and the `REVIEWED` transition are Phase 5.
- [x] Handle deposit return tracking — 48-hour window from `completedAt`, with a countdown and an
      overdue state on both dashboards (`src/lib/bookings/deposit.ts`). Records an owner's claim
      that they returned the money; the platform is not in the money path and says so.

### Notifications

- [x] Create notification system (in-app) — written inside the same transaction as the status
      change, so a booking cannot move without the other party being told
- [x] Notify owner on new request
- [x] Notify renter on approval/decline
- [x] Notify on payment confirmation
- [x] Notify on booking completion
- [x] Create notification bell component — real unread count, capped at 9+
- [x] Mark notifications as read — one, or all; opening the panel deliberately does not, since it
      shows six of what may be fifty
- [x] Notify owner when a request expires — not in the original list. An owner who silently lost
      a booking is the one person who can change that.
- [x] Notify owner on renter cancellation

---

---

## Stage A – Production-critical fixes

Between Phase 4 and Trust & Safety. Approved 12 August 2026.

- [x] **A1. Owner pickup / contact gap** — see Owner Actions above. Added
      `src/components/ui/textarea.tsx` (no such primitive existed), the
      approve-with-details panel, `updateBookingInstructions`, and
      `canEditInstructions` in the pure lifecycle module beside its siblings.
      Both dashboards now warn when an approved booking has no collection
      details, since that state leaves two people with each other's first name
      and no way to meet.
      Also fixed a focus bug this surfaced: the decline and cancel reason panels
      were declared *inside* `BookingActions`, making them a new component type
      on every render, so React remounted the field and the caret jumped out
      after each keystroke. Server-rendered HTML is identical either way, which
      is why the render checks missed it. Extracted to module scope as
      `EditPanel`.
- [x] **A2. Password reset** — Resend, called over `fetch` rather than via the
      SDK (one authenticated POST; same trade as `cloudinary.ts` rejecting the
      Cloudinary SDK, so **no new dependency**). Its own
      `PasswordResetToken` model storing a **SHA-256 hash, never the token** —
      Auth.js's `VerificationToken` has no type discriminator and no used-marker,
      so reusing it would let a reset token be redeemed as a verification token
      and would make replay undetectable. SHA-256 rather than bcrypt is correct
      here: the value is 256 bits of CSPRNG output, so there is nothing to
      brute-force, and a fast hash keeps lookup a single indexed probe.
      Single-use enforced by compare-and-swap (`usedAt: null` in the predicate),
      token claimed *before* the password is written so a losing racer changes
      nothing, and every sibling token spent on success so an attacker's parallel
      request cannot take the account straight back. Enumeration-safe: one
      neutral response for registered, unregistered, suspended and OAuth-only —
      including when rate-limited, since a distinct 429 would be the same leak.
      Suspended and soft-deleted accounts are refused at request *and* at
      redemption, because an account can be suspended inside the 1-hour window.
      - [ ] **Verified sending domain still needed.** `EMAIL_FROM` defaults to
            `onboarding@resend.dev`, which only delivers to the Resend account
            owner's own address. Set a verified domain before staging.
      - [ ] **Session invalidation on password change** — known gap. Under the
            JWT strategy a session is a signed cookie with no server-side record,
            so a stolen session survives a reset until the token expires. Needs a
            token version on `User` checked in the `jwt` callback. Worth doing
            before launch.
- [x] **A3. Zod environment validation** — three modules, and the split is
      load-bearing: `env.schema.ts` is pure (so the rules are testable without a
      valid secret-bearing environment), `env.ts` parses `process.env` at import
      and is server-only, `env.public.ts` handles the `NEXT_PUBLIC_*` half
      because unprefixed names do not exist in the browser. Empty strings are
      treated as absent — that is how a hosting dashboard records a cleared
      field, and an empty string satisfies `.optional()`. Cloudinary, Google and
      Resend stay optional; each already degrades honestly when absent.
- [x] **A4. Neon cold start / P2028** — six read-only `$transaction([...])` pairs
      converted to `Promise.all`, and the comments claiming they guaranteed a
      shared snapshot were **wrong**: Prisma uses the database default isolation
      level, and Postgres READ COMMITTED takes a new snapshot per statement, so
      the count and the page could already disagree inside the transaction. The
      guarantee was never there to lose; what the transaction did cost was a
      connection held across both statements, which is what timed out. Plus
      `transactionOptions.maxWait`/`timeout` raised from 2s/5s to 15s for the
      genuine write transactions. Measured 12 Aug: first request after idle 61s,
      warm 2.7s in dev.
- [x] **A5. viewCount** — was rendered to owners and never incremented, so every
      owner saw 0 forever. The detail page still refuses to write it on render,
      and that refusal was always right: a GET that mutates fires on every
      crawler hit, link preview and prefetch, so the number would have measured
      indexing rather than interest. `ListingViewTracker` records it from a
      browser effect instead — a prefetch fetches the RSC payload without
      mounting the tree, so it does not count, and anything executing no
      JavaScript is not counted either, which for this metric is correct.
      Three overlapping guards: a ref (React's double-invoke and re-renders), a
      `sessionStorage` key (back-navigation and refresh within a tab), and a
      six-hour server window per viewer. Owner views excluded on the page *and*
      re-checked in the action, since the action is a public endpoint. Hidden
      listings are not countable — the lookup goes through
      `VISIBLE_LISTING_WHERE`. **Never revalidates**: `revalidatePath` here would
      discard the cached page on every view, so a popular listing would be
      cached less and each fresh render would trigger another view.
      Dedupe is best-effort by construction — the rate limiter is in-process, so
      across instances the same viewer can be counted more than once. Acceptable
      for a view counter; would not be for anything a decision hangs on.
- [ ] **A6. Staging deployment** — **fully prepared, blocked on infrastructure.**
      See `docs/DEPLOYMENT.md` for the complete checklist: what is needed from
      you, every environment variable and what happens when each is absent, the
      migration sequence, and the eight things to verify once it is up. The
      `picsum.photos` pattern and the demo seed are now removed. The
      verification section is the actual point of A6: rate limiting is
      in-process by design and its real behaviour across instances has never
      been measured.

### Left open in Phase 4, deliberately

- [ ] Owner-initiated cancellation — the transition table permits `CANCELLED` from `APPROVED` and
      `PAYMENT_PENDING` for either side, and `buildBookingNotifications` already handles
      `by: "owner"`. Only the action and the button are missing. Left out because the brief scoped
      renter cancellation, and an owner cancelling an approved booking needs a reliability
      consequence attached or it becomes free to do.
- [ ] Pickup-instructions input for the owner — see Owner Actions above
- [ ] Owner bank/wallet details for transfer instructions — a payments concern, and putting an
      unverified stranger's account number on a page needs more thought than a column

---

## Phase 5 – Reviews & Trust

Reciprocal release is the design decision everything else follows from. A review
is withheld until the counterpart submits theirs, or until the 14-day window
closes — otherwise whoever writes second reads the first and answers it, and
ratings compress towards 5 because nobody risks going first.

The non-obvious consequence: the stored rating counts **released reviews only**.
If it moved when a review was written, an owner watching their average drop would
learn the renter left a bad one before being able to read it, and could retaliate.
That is why `Review.publishedAt` is a column rather than a derived flag, and why
publishing and recomputing the aggregate are one transaction
(`src/lib/reviews/publish.ts`). Asserted by `npm run verify:phase5`.

The aggregate is stored **once per direction** — being a reliable owner and being
a reliable renter are different claims, and one average over both answers neither.
See "Directional aggregate" below.

### Create Review

- [x] Create review form component — stars are real radio buttons in a
      `radiogroup`, and **no rating is preselected**: a default of 5 would be
      answered by inertia and the average would be manufactured by the form
- [x] Add star rating (1-5)
- [x] Add review comment — optional; an empty string is normalised away rather
      than stored, so it cannot render as an empty quote
- [x] Create `createReview` action
- [x] Enforce one review per booking — `@@unique([bookingId, reviewerId])` plus
      the `alreadyReviewed` guard
- [x] Only allow after COMPLETED status — and refused on every non-finished
      status, so a cancelled or declined request can never be used as a free
      shot at someone's rating

### Two-Way Reviews

- [x] Owner reviews renter
- [x] Renter reviews owner — direction is **derived from the caller's role**,
      never accepted from input. A client-supplied `type` would let a renter file
      an owner-to-renter review: their words on the owner's record, the rating
      aimed at themselves.
- [x] Create `markBookingReviewed` action — folded into `createReview` rather
      than a separate action: `COMPLETED -> REVIEWED` happens in the same
      transaction as the second review, guarded by the usual compare-and-swap
- [x] Show review status in booking — four states on both dashboards: offered,
      refused-with-reason, written-but-withheld, and released
- [x] Lazy release sweep (`releaseDueReviews`) — publishes reviews whose window
      closed unanswered, swept on the read paths that care. Not a cron, for the
      same reason as booking expiry: one that stopped running would leave reviews
      invisible forever with nothing noticing.
- [x] `REVIEW_RECEIVED` notification — fired on **release**, never on submission.
      Telling someone a review exists the moment it is written hands them the one
      fact withholding exists to withhold.
- [x] Closed the dead-end `REVIEW_REMINDER` — it now points at screens that can
      actually take a review

### Display Reviews

- [x] Show reviews on listing detail — filtered to `RENTER_TO_OWNER`, because a
      browser wants to know what renting *from* this person is like, not what
      they are like as a customer
- [x] Show reviews on user profile — unblocked and shipped 17 August 2026.
      `/users/[id]` renders **both** directions as separate sections, each with
      the aggregate for its own direction
- [x] Calculate average rating — `ratingAggregate`; an empty set yields `null`
      not `0`, or a brand-new owner would sort below the worst-reviewed one on
      the sort-by-rating filter
- [x] Sort reviews by date — newest first
- [ ] Add pagination for reviews — the query supports it; the listing page shows
      the five newest with an honest total rather than adding a second control
      that loses your scroll position

### Directional aggregate

- [x] **Split `User.ratingAverage` by direction** (17 August 2026). It was a
      single aggregate over **both** directions, so the average printed on a
      listing could contradict the `RENTER_TO_OWNER` reviews listed directly
      beneath it as soon as that person had also rented — a figure and its own
      evidence disagreeing, with nothing to tell a reader which to believe.
      Now `ownerRating{Average,Count}` and `renterRating{Average,Count}`, fed by
      the `[revieweeId, type]` index that existed for this from the start.
      The mixed columns are **dropped**, not kept: derived data with no reader
      left is data that drifts silently. The migration backfills both pairs from
      the reviews themselves, so nothing is lost.
      `recomputeUserRating` writes both pairs on every recompute from one read —
      refreshing only the triggering direction would knowingly leave a value it
      already knew was stale. Sort-by-rating and the owner card now read the
      `asOwner` half, which is the same set of reviews each surface displays.

### Trust Score

- [x] Calculate trust score algorithm — `src/lib/trust/score.ts`. Four weighted
      components: reputation (0.45), experience (0.25), reliability (0.20),
      verification (0.10).
      **A trust score that is mostly the star average adds nothing but false
      authority**, so this deliberately carries what a rating cannot: how much
      evidence there is, whether the person finishes what they start, and whether
      the account is anchored to a real identity.
      Ratings are **shrunk towards a 3.5 prior by their own count**, so a perfect
      average from one rental does not outrank a strong one from fifty.
      Experience **saturates** at ten rentals — on a marketplace where an owner
      can list ten cheap items, linear growth would make trust purchasable.
      Reliability counts only cancellations *they* made; being cancelled on is
      not evidence about you, and counting it would let one party damage the
      other's standing by cancelling.
- [x] Display trust badges — **only positive bands exist**. A "low trust" badge
      is a published accusation assembled from proxies, and falling short earns
      no badge rather than a negative one. The score itself is **never printed**:
      "73 out of 100" implies a precision four weighted proxies cannot support,
      so the panel shows the checkable evidence instead
- [x] **A new account scores `null`, not zero** — the same argument as
      `ratingAggregate` returning null. "Not yet established" and "established as
      unreliable" are opposite claims, and a number cannot say the first
- [x] Show verification status — stated either way, since omitting it would let a
      reader assume the badge above covers it
- [x] **The top band requires a verified identity**, as an explicit gate rather
      than as arithmetic. Weighting verification at 0.1 does not achieve it: the
      other three carry 0.9 between them, so a flawless unverified record reaches
      ~0.94 and clears any threshold worth setting. Everything else feeding the
      score is behaviour reported by other users, which a determined person can
      manufacture; the strongest claim the platform makes should rest on
      something outside the reputation system.
      **Currently unreachable** — nothing writes `isVerified` yet. Identity
      verification is what makes it attainable

### Review Moderation

Shipped with the Trust & Safety reporting slice below — see Phase 6 "User
Reporting" and "Reports Management".

- [x] Create `reportReview` action — the subject is the review's **author**, not
      the person it is about. A suspension arising from this report has to land
      on whoever wrote it; the obvious mistake would suspend the person the
      review was already unfair to.
- [x] Add report reasons — `FAKE_REVIEW`, harassment, offensive language,
      inappropriate content, spam and other. Reasons are scoped per target type
      (`REPORT_REASONS_BY_TYPE`); offering all fifteen everywhere would make the
      queue untriageable by reason, which is what `@@index([reason])` is for.
- [x] Show in admin dashboard — `/admin/reports`
- [x] `Review.removedAt` — soft removal, **distinct from `publishedAt: null`**.
      Unpublishing to hide a review would have it republished by the release
      sweep a fortnight later. A removed review also leaves both rating
      aggregates, or the score would keep reflecting words nobody may read.

---

## Phase 6 – Reporting & Admin Dashboard

### User Reporting

Shipped 17 August 2026 as the first Trust & Safety slice. The `Report` model,
`ReportReason`, `ReportStatus` and `ReportAction` were fully designed in the
schema and entirely unused; this is what connects them.

- [x] Create report listing component — one `ReportButton` serves all three
      targets, built from the same `REPORT_REASONS_BY_TYPE` map the server
      validates against, so the form cannot offer a reason the action rejects
- [x] Create report user component — same component
- [x] Create `reportListing` action
- [x] Create `reportUser` action
- [x] Add report reasons (predefined) — scoped per target type
- [x] Add report description (optional) — empty is normalised away rather than
      stored, so it cannot render as a blank quote in the queue
- [x] **The type is fixed by which action you call**, never accepted as input.
      `Report.targetId` is polymorphic with no foreign key, so a client able to
      pair `type: LISTING` with a review's id would be choosing which table a
      moderator's later `REMOVE_LISTING` runs against
- [x] **You can only report what you can see** — each target is looked up through
      the same predicate that governs reading it. Otherwise the form is an oracle
      for probing ids: file a report, read the error, learn whether a hidden
      listing exists
- [x] **Nothing is notified on filing** — not the reported account, which would
      hand them the warning and the motive to retaliate against whoever could
      plausibly have filed it; and not moderators, whose queue would then be
      floodable. Same reasoning as withholding a review until its counterpart lands

### Admin Layout

- [x] Create admin layout (`/admin/layout.tsx`) — shipped in Phase 2.1 as the
      boundary new admin routes inherit automatically; `/admin/reports` is the
      first route to rely on that
- [x] Add admin sidebar navigation — an `Administration` section in the shared
      dashboard nav map, filtered by `requiredRole`. Hiding a link is not
      authorization; the real gate is `requireAdmin()` plus `ADMIN_PREFIXES`
- [ ] Add admin header — the dashboard header is shared; a distinct admin one is
      still open
- [x] Implement admin route protection — `requireAdmin()` re-reads role from the
      database, because middleware sees only the JWT and a demoted admin carries
      `role: "ADMIN"` in their cookie for up to 24h
- [ ] Create admin dashboard home — still the Phase 6 placeholder

### User Management

- [x] Create users list page (`/admin/users`) — **scoped to identity
      verification only.** Suspension, banning and role changes are deliberately
      not on it: they are the platform's most consequential controls, and
      attaching them to a search box built for a different task is how one gets
      used by accident
- [x] Add user search — **search-first, never browse-first.** Nothing renders
      until a query is entered, so this cannot be left open as a directory of the
      user base with email addresses attached. `email` is selected here and
      nowhere public, because it is the only reliable way to tell two members
      with the same display name apart
- [ ] Add user filters (status, role)
- [ ] Create user detail view
- [ ] Create `suspendUser` action — note `resolveReport` can already suspend
      through the moderation queue, with a report attached as the reason. A
      standalone action still needs one
- [ ] Create `banUser` action
- [ ] Create `changeUserRole` action

### Listing Moderation

- [ ] Create listings list page (`/admin/listings`)
- [ ] Add listing search
- [ ] Add listing filters
- [ ] Create listing detail view
- [ ] Create `adminRemoveListing` action
- [ ] Create `adminEditListing` action

### Booking Management

- [ ] Create bookings list page (`/admin/bookings`)
- [ ] Add booking filters (status, date)
- [ ] Create booking detail view
- [ ] View booking history

### Reports Management

- [x] Create reports page (`/admin/reports`) — pending / resolved / dismissed as
      links rather than a client filter, so a report can be linked to a colleague
- [x] Show reported listings
- [x] Show reported users — and reported reviews. The polymorphic `targetId`
      cannot be joined, so targets are hydrated in one query per kind for the
      page. A card that showed only "LISTING, id abc123" would make every
      decision start in another tab, and a moderator working that way decides
      from the reason alone — which is the reporter's opinion, not evidence
- [x] Create `resolveReport` action — the decision and its consequence are **one
      transaction**. Split apart, the failure modes are a suspension nobody is
      accountable for and an audit trail describing something that never
      happened, and neither would ever be detected
- [x] Create `dismissReport` action — kept separate from resolving with `NONE`,
      because the two say different things: nothing-warranted versus the
      complaint did not hold. A target with ten dismissals reads very differently
      from one with ten investigated-no-action decisions
- [x] Add resolution notes — and an **absent** note is shown as absent rather
      than hidden, since a suspension with no reasoning recorded is exactly the
      decision someone will need to review later
- [x] **The action must fit the report type** (`REPORT_ACTIONS_BY_TYPE`).
      `REMOVE_LISTING` on a review report would run against whatever row shares
      that id; the database has no opinion, so this is caught here or not at all
- [x] **Resolved once**, by compare-and-swap on `status`. Two moderators on one
      queue is the normal case, and without it a report resolves twice and
      suspends an account twice for a single complaint
- [x] **Admins cannot be suspended through the queue**, and nobody can suspend
      themselves. A report queue that can disable an administrator is a way to
      take the platform's own controls away from it
- [x] `getActiveAdmin()` — the non-redirecting counterpart to `requireAdmin()`.
      A redirect from a Server Action would discard whatever the moderator had
      typed into the resolution note
- [x] Integration verification — `npm run verify:trust-safety`, 16 checks,
      including that a removed review leaves the public list **and** both rating
      aggregates together, that the release sweep will not resurrect one, and
      that a report whose target was deleted still renders and can still be closed

### Analytics Dashboard

- [ ] Create analytics page (`/admin/analytics`)
- [ ] Total users count
- [ ] Total listings count
- [ ] Total bookings count
- [ ] GMV tracking (PKR)
- [ ] City distribution chart
- [ ] Recent activity feed

---

## Phase 7 – Polish & Deployment

### Error Handling

- [ ] Create error boundary components
- [ ] Create 404 page
- [ ] Create 500 page
- [ ] Add toast notifications
- [ ] Improve error messages

### Loading States

- [ ] Add skeleton loaders
- [ ] Add page transitions
- [ ] Add loading indicators
- [ ] Implement optimistic updates

### Performance

- [ ] Optimize images (Next.js Image) — `remotePatterns` is Cloudinary-only as of
      Stage A6; `next/image` throws on an unlisted host rather than degrading, so
      that list is a security boundary
- [ ] Add lazy loading
- [ ] Implement pagination
- [ ] Add infinite scroll (where appropriate)
- [ ] Analyze and optimize bundle size
- [ ] Add caching strategies

### SEO

- [ ] Add metadata to all pages
- [ ] Create sitemap.xml
- [ ] Create robots.txt
- [ ] Add Open Graph tags
- [ ] Add Twitter cards
- [ ] Implement structured data

### Accessibility

- [ ] Audit with axe-core
- [ ] Fix accessibility issues
- [ ] Add keyboard navigation
- [ ] Test with screen reader
- [ ] Ensure color contrast

### Testing

- [ ] Set up Jest
- [ ] Set up React Testing Library
- [ ] Write unit tests for utilities
- [ ] Write integration tests for actions
- [ ] Set up Playwright for E2E
- [ ] Write critical path E2E tests

### Documentation

- [ ] Update README with final instructions
- [ ] Document environment variables
- [ ] Create API documentation
- [ ] Add JSDoc comments

### Deployment

- [ ] Set up Vercel project
- [ ] Configure environment variables
- [ ] Set up PostgreSQL (Vercel Postgres or external)
- [ ] Configure Cloudinary
- [ ] Set up custom domain
- [ ] Configure SSL
- [ ] Run production build
- [ ] Deploy to production
- [ ] Verify production deployment
- [ ] Set up monitoring (Vercel Analytics)

### Launch Checklist

- [ ] Seed production categories
- [ ] Create admin account
- [ ] Test all critical flows
- [ ] Verify mobile responsiveness
- [ ] Check all environment variables
- [ ] Enable error tracking
- [ ] Announce launch

---

## Future Features (Post-MVP)

### Phase 2: Trust & Payments

- [ ] JazzCash integration
- [ ] Easypaisa integration
- [ ] Safepay integration
- [ ] PayFast integration
- [ ] Phone OTP verification (+92)
- [ ] Real-time messaging system
- [ ] CNIC verification (NADRA)
- [ ] Escrow payment system
- [ ] Platform fee implementation
- [ ] Dispute resolution workflow
- [ ] Email notifications (Resend)
- [ ] Rate limiting (Upstash)

### Phase 3: Growth

- [ ] React Native mobile app
- [ ] Urdu language support (i18n)
- [ ] RTL layout support
- [ ] Delivery integration (Bykea)
- [ ] Delivery integration (Careem)
- [ ] Owner analytics dashboard
- [ ] Saved searches
- [ ] Price alerts
- [ ] Instant booking
- [ ] Referral program

### Phase 4: Scale

- [ ] City expansion (Rawalpindi, Faisalabad, Peshawar, Multan)
- [ ] Business accounts (NTN verification)
- [ ] Bulk listing management
- [ ] Subscription plans
- [ ] Promoted listings
- [ ] Stripe integration (international)
- [ ] Insurance partnerships (EFU, Jubilee)
- [ ] API for third-party integrations

---

## Notes

- Update this file as tasks are completed
- Add new tasks as they are discovered
- Reference this file in PR descriptions
- Keep phases in order

---

*Last reviewed: 11 August 2026, against the code — Phase 4 complete, Phase 3 checkboxes corrected.*

**Next:** Trust & Safety continues. Shipped 17 August 2026 — reporting and moderation, public trust
profiles and the trust score, and identity verification. What remains is **value-gated access**, the
**handover protocol** and **damage claims**. Phase 4 was built to receive the last two:
`canStartBooking` and the completion guard are the points a sealed handover record becomes a
condition rather than a rewrite, and no copy anywhere claims SamaanShare holds a deposit — so escrow
can be added without walking a promise back.

Value-gated access is now buildable and was not before: `assessTrust` and `isVerified` are the inputs
a rule like "items above PKR 50,000 require a verified renter" would read.

### Identity Verification

Shipped 17 August 2026. Closes the gap recorded here previously: `User.isVerified`
rendered a "Verified" badge on `OwnerCard` and **nothing ever wrote it**, so the
badge was unreachable and the trust score's top band was gated on a flag that
could never be true.

- [x] **Two claims, kept apart.** `emailVerified` proves an inbox was reachable —
      minutes of work for anyone with a mail account. `isVerified` is meant to
      mean a human checked a document against a person. The trust score weights
      them 1.0 against 0.4 and gates its top band on the second, so nothing in
      the email-confirmation path may set the first. A test greps the
      confirmation email copy for "identity", "verified" and "badge" to keep the
      wording from blurring them
- [x] `setIdentityVerified` — one action for grant and withdrawal. Reversal is
      not exceptional (a forged document, an account changing hands), and
      splitting it would give the reversal its own untested path
- [x] **Recorded, not just set** — `verifiedAt` and `verifiedById`, the same way
      `Payment.confirmedById` records who vouched for money arriving. A claim
      this strong, made by the platform about a person, has to be attributable
- [x] **An admin cannot verify themselves.** The whole value of the flag is that
      someone other than its subject decided it, and a self-grant is the first
      thing a compromised admin account would reach for
- [x] A suspended account cannot be granted verification — publishing the
      platform's strongest endorsement about someone moderation just acted
      against. Withdrawal from a suspended account stays permitted, which is the
      direction that case actually needs
- [x] Withdrawal clears the timestamp too. A `verifiedAt` left on an unverified
      account reads as a current grant to anything querying the column
- [ ] Phone OTP verification (+92) — **blocked on an SMS provider**, which this
      deployment does not have. `User.phoneVerified` stays honestly `false`; no
      fake OTP was built. Listed under Phase 2 below
- [ ] CNIC verification (NADRA) — Phase 2. Until it exists, verification is an
      administrator confirming a document out of band, which is a perfectly
      ordinary way to run this **provided the decision is attributable** — which
      is what the two columns above are for
