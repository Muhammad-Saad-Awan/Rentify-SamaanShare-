# SamaanShare - Development Backlog

**Last Updated:** 7 September 2026 (Phase 1 complete - profile editing, in-app password change, connected accounts, session invalidation; earlier: Trust & Safety complete — reporting, trust profiles, identity verification, value-gated access, handover protocol, damage claims; Stage A6 awaiting production env vars)
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
      moderation copy, trust score, email verification tokens, access tiers,
      handover rules, handover copy, claim rules, claim copy, admin rules) —
      431 tests
- [x] Integration verification for the booking lifecycle — `npm run verify:phase4`
      exercises the transactional paths against a real database (conflict safety,
      date release, compare-and-swap, idempotency) and `npm run verify:phase4:ui`
      renders both dashboards at every status behind a real session. Both create
      their own throwaway rows and delete them. `npm run verify:stage-a` does the
      same for the reset-token lifecycle, and `npm run verify:phase5` for the
      review lifecycle - including the assertion that a *withheld* review does
      not move the rating aggregate, and that the average a listing prints is
      computed over exactly the reviews listed beneath it, and
      `npm run verify:trust-safety` for reporting and moderation, and
      `npm run verify:handover` for the condition records — including that the
      seal is refused by the database rather than by a check that can lose a race —
      and `npm run verify:claims` for deposit claims, including that an unsettled
      claim leaves the full deposit owed.
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

Shipped 7 September 2026. The placeholder card is gone.

- [x] Create profile page (`/profile`)
- [x] Create profile view component — folded into the page rather than built
      separately. Once the fields are editable there is nothing left for a
      read-only view to show that the form does not, and two components rendering
      one identity is two places for them to disagree
- [x] Create edit profile form — `ProfileForm`, four fields, seeded from the
      DATABASE and not the session. The JWT's copy of `name` is up to 24h old, so
      a form defaulted from it could re-save a stale name over a newer one
- [x] Create `updateProfile` action — takes the whole profile, not a patch, for
      the reason `updateListingSchema` gives: a patch cannot express "clear my
      bio". Changing the number clears `phoneVerified`, which nothing sets yet
      (phone OTP is Phase 2) but which must hold from the first write or whatever
      does set it inherits a verified flag on a number nobody verified
- [x] Add profile image upload (Cloudinary) — `AvatarUploader`, same signed
      browser->Cloudinary path as listings. **Its own folder**,
      `samaanshare/avatars/{userId}`: `cleanup-pending-uploads.ts` keeps only what
      a `ListingImage` references, so an avatar parked in the pending tree would
      have been destroyed 24h after it was set
- [x] Create `updateProfileImage` action — writes `avatarUrl`, never `image`, so
      removing a SamaanShare photo falls back to the Google picture rather than to
      a blank circle. URL derived from the Admin API, id checked against the
      caller's own folder
- [x] Add Pakistani city selector — `CITY_VALUES` moved to `@/config/cities` and
      is now shared with the listing form, rather than copied
- [x] Add phone number field (+92 format) — accepts every spelling people type
      and stores one E.164 value. Mobile only: the number exists so a counterparty
      can reach a person mid-booking, and a landline reaches a building
- [x] **`requireUser()` now returns identity from the database**, not the token.
      It was already reading the row to check `status`, so `name` and
      `avatarUrl ?? image` ride along free. Without it a member saves a new photo
      and goes on seeing the old one in the header of every screen for 24h, which
      reads as the save having failed

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
- [x] Profile (`/profile`) — editable: name, bio, city, phone and photo
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

- [x] Create `startBooking` action (pickup done) — now also writes the PICKUP
      condition record in the same transaction (Trust & Safety, 17 August 2026)
- [x] Create `completeBooking` action (return done) — same, for RETURN
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
      - [x] **Session invalidation on password change** — closed 7 September 2026,
            alongside in-app password change. `User.tokenVersion`, incremented by
            `changePassword` and by `resetPassword`, compared against the token in
            the database read `requireUser` / `getActiveUser` already make for
            `status` — so it costs no extra query and lands on the next request
            rather than at token expiry.
            **Not** checked in the `jwt` callback as this note originally proposed:
            `updateAge` re-issues a token every 24h, so a check there would have
            handed the revoked session a fresh token instead of refusing it. The
            comparison has to happen where the token is *read*, not where it is
            minted.
            A counter and not `passwordChangedAt` vs the token's `iat`, for the same
            reason — `iat` moves on its own.
            Mismatch, not "less than": a token claiming a version *ahead* of the
            column is not a newer session.
            `DEFAULT 0` and `token.tokenVersion ?? 0`, so cookies minted before the
            column existed stay valid — signing out the whole userbase on deploy
            would be a worse bug than the one being fixed. `npm run verify:security`
            asserts exactly that, in both directions.
            Both flows re-authenticate afterwards, which is what stops the person who
            just changed their password being signed out with everybody else.
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
- [x] Add admin header — shipped 27 August 2026. **The boundary made visible.**
      The admin area rendered inside the member dashboard with no visual
      difference whatsoever — same shell, same top bar — so the only signal that
      a click suspends somebody's account rather than pausing your own listing
      was the URL. `AdminHeader` carries the Restricted marker, one line naming
      the consequences ("affect other people's accounts, listings and money, and
      are recorded against your name"), and a horizontally scrolling tab row.
      Rendered from `admin/layout.tsx`, so a new route under that folder inherits
      it the way it inherits the gate
- [x] **Its links come from `DASHBOARD_NAV`**, through `adminNavItems()`, which
      matches sections by `requiredRole` rather than by title — the heading is
      copy and will be reworded, the role is what actually makes a section
      administrative. A second hand-written list would drift from the sidebar, and
      the failure mode is a queue that exists but is unreachable from one of the
      two navigations. Pinned by four tests, including that `/admin` stays `exact`
      so it does not light up alongside every child route
- [x] **No counts in it, deliberately.** A badge on a persistent header must be
      either always-true — which means counting reports and claims on every admin
      page load, and `getOpenClaimCount` escalates overdue claims, so a *layout*
      would be writing to the database on every navigation — or possibly-stale,
      which is a number that lies in the one place it is always on screen. "What
      is waiting" lives on `/admin`, the first tab in the row. The home's own
      duplicate Restricted badge came off
- [x] Implement admin route protection — `requireAdmin()` re-reads role from the
      database, because middleware sees only the JWT and a demoted admin carries
      `role: "ADMIN"` in their cookie for up to 24h
- [x] Create admin dashboard home — **what needs a decision, not what the
      numbers are.** Completed 27 August 2026. The two are different jobs and the
      landing page is only the first: a home that opens with a growth chart
      buries the two reports waiting for somebody. Reports and claims are counted
      as work; bookings awaiting a party are shown as **context**, with an outline
      badge rather than a destructive one, because nobody here can act on them —
      a badge that looks identical for "two reports await your decision" and "two
      rentals are between two other people" trains an administrator to ignore
      both. Every admin surface is listed with what it is for
- [x] **The claims count keeps its sweep, and that is not a contradiction.**
      `getOpenClaimCount` escalates overdue claims before counting. Expiring a
      stale booking is the parties' business — it releases their calendar and
      notifies them, so an administrator's lookup must not do it. Escalating a
      lapsed claim moves it into *this* queue, and a count taken without it hides
      claims nobody will decide because nobody was told they were ready

### User Management

Completed 18 August 2026.

- [x] Create users list page (`/admin/users`)
- [x] Add user search — **search-first, never browse-first.** `email` is selected
      here and nowhere public, because it is the only reliable way to tell two
      members with the same display name apart
- [x] Add user filters (status, role, verified) — as URL links, matching the
      reports and claims queues, so a filtered view stays shareable.
      **A filter opens the listing that an empty search does not.** "Show me the
      suspended accounts" is an operational question with a bounded answer;
      "show me everyone" is a dossier, and that is what search-first refuses
- [x] Create user detail view (`/admin/users/[id]`) — profile, counts, reports
      against them, and the full administrator history. The id is validated in
      `layout.tsx`, per the AGENTS.md invariant
- [x] Create `suspendUser` action — reversible hold
- [x] Create `banUser` action — **terminal.** This is what finally gives `BANNED`
      a meaning: both statuses blocked sign-in identically and always have, and
      the difference is that reinstatement is offered from one and not the other.
      Permitted from `SUSPENDED` as well as `ACTIVE`, so a hold can be escalated
      without briefly restoring access to an account being removed for cause
- [x] Create `reinstateUser` action — `SUSPENDED` only
- [x] Create `changeUserRole` action — with the **last-administrator guard**, the
      only mistake here with no in-app recovery: demote the final active admin and
      nobody can reach the admin area, including to undo it. The count is read
      *inside* the transaction, or two concurrent demotions would each see two
      admins and leave none

### The audit record

- [x] `AdminAction` — one append-only row per administrator action: actor,
      subject, type, **required** reason, previous and new value, and an optional
      link to the report that prompted it.
      **A log rather than columns on `User`.** `verifiedAt`/`verifiedById` record
      the current state of one flag, which is all the trust score needs.
      Suspension is different: "was this account ever suspended" stays a real
      question after reinstatement, and a column pair would have the second
      suspension overwrite the first
- [x] **`resolveReport` now writes the same row**, with `reportId` set. Before
      this, a suspension through the queue left the Report as its only evidence
      and the User row said nothing but `SUSPENDED`; a suspension by hand would
      have left nothing at all. The link is what stops the two paths producing
      different kinds of evidence
- [x] `setIdentityVerified` writes one too, so the whole admin surface produces
      one shape of record
- [x] `actorId` is **nullable, for the bootstrap grant alone** — there is no
      administrator to attribute the first one to, and recording a fiction would
      be worse than recording the gap

### Shared authorization

- [x] `src/lib/admin/rules.ts` — `canSuspendUser`, `canBanUser`,
      `canReinstateUser`, `canChangeRole`, pure and tested (25 tests).
      **Extracted rather than copied.** These rules already existed inline in
      `applyReportAction`; a standalone suspension would have meant a second copy,
      and two copies of an authorization rule is how one ends up missing the
      clause that mattered. `resolveReport` now calls them, and the moderation
      panel imports the same predicates to decide which controls to show — a
      button the action would refuse is a button that only produces an error

### Bootstrap

- [x] `npm run admin:grant -- someone@example.com [--confirm]`.
      **There were zero active administrators**, so every route under `/admin` was
      unreachable by anyone — including the control that would have fixed it.
      Deliberately a script and not a page: the alternative is shipping a web path
      that grants administrator rights based on a row count, a condition that is
      wrong once, briefly, and catastrophically. Dry run by default

### Fixed along the way

- [x] **`admin/loading.tsx` was breaking the new detail route's 404.** A
      route-level `loading.tsx` covers its own segment *and everything nested
      under it*, so `admin/users/[id]/layout.tsx` rendered inside that boundary
      and Next had already flushed a 200 by the time it called `notFound()` — an
      unknown member id returned 200 with a 404 page painted over it. Exactly the
      failure AGENTS.md records from three earlier routes, found by asserting on
      the status code rather than looking at the page. The skeleton moved to an
      in-page `<Suspense>` in `/admin/page.tsx`

### Listing Moderation

Completed 27 August 2026.

- [x] Create listings list page (`/admin/listings`) — **browse-first, unlike the
      members screen.** Search-first exists there because a default listing of
      every account is a directory of the user base with email addresses
      attached; a listing is public by construction, so there is nothing for
      that rule to protect here, and triage means looking at what was posted
      rather than looking up something already known by name
- [x] Add listing search — title only. A moderator working from a report has the
      title; matching 5,000-character descriptions with a leading wildcard is a
      sequential scan of every listing on the platform for mostly noise
- [x] Add listing filters — status, city, reported-only and one owner's
      inventory, as URL links like every other queue. **Removed listings are in
      the default view**, flagged rather than filtered out: somebody who has just
      taken down the wrong listing will search for its title, not think to apply
      a status filter first. The `Removed` filter matches **either** the DELETED
      status or a non-null `deletedAt` — D3 pairs them, and matching only the
      status would leave a half-written row out of the removed view while also
      showing it under Active
- [x] Create listing detail view (`/admin/listings/[id]`) — the listing, its
      owner with their standing, the reports against it, and its own moderation
      history. The id is validated in `layout.tsx`, per the AGENTS.md invariant,
      and the list page uses an in-page `<Suspense>` so no boundary sits above it
- [x] **The screen says whether the public can actually see it**, which the
      status badge cannot answer on its own: `VISIBLE_LISTING_WHERE` also
      requires the owner to be active, so an ACTIVE listing owned by a suspended
      account is already invisible. A moderator removing something that is
      already gone from the marketplace is deciding on a false premise
- [x] Create `adminRemoveListing` action — soft delete, status and timestamp
      together, and **reversible**
- [x] Create `adminRestoreListing` action — not in the original list, and the
      reason it was added is that without it a misapplied `REMOVE_LISTING` was
      permanent: the owner's own screens exclude soft-deleted rows, so nobody on
      either side could reach the listing again. **Restores to PAUSED, never
      ACTIVE** — republishing on the owner's behalf makes a commercial decision
      for them, and a listing removed while ACTIVE would otherwise go straight
      back onto the market the instant a removal is reversed, including when the
      reversal is itself the mistake
- [x] Create `adminEditListing` action — **title and description only.** The
      moderation need is a legitimate listing whose copy says something it must
      not: a phone number in the description, an inflated claim in the title.
      Prices, photos, city and category are absent deliberately — a booking is a
      contract over the price, the photos are the owner's evidence of the item's
      condition at handover, and a listing wrong in those ways is one that comes
      down rather than one that gets silently rewritten. It enforces the **same
      length limits the owner's own form does**, imported rather than restated:
      a three-character title written by moderation would make the owner's edit
      form refuse to save their own listing
- [x] **The old text goes in the audit row.** This is the one administrator
      action that destroys information rather than changing a flag — a status is
      recoverable from the enum, a sentence is not — so `previousValue` holds the
      title and description verbatim and that row is the only remaining copy. A
      no-op edit is refused rather than recorded, since saving an untouched form
      would otherwise assert permanently that moderation rewrote a listing
- [x] **One removal path, shared with the report queue**
      (`src/lib/admin/listing-moderation.ts`). `applyReportAction`'s
      `REMOVE_LISTING` branch got there first and wrote **no audit row at all**:
      the Report was the only evidence and the listing said nothing but DELETED.
      Both paths now call `removeListing`, so a removal by hand and one through
      the queue are the same row, distinguished only by `reportId`. Same
      reasoning as extracting `src/lib/admin/rules.ts` for accounts
- [x] **The audit subject is the OWNER, with `AdminAction.listingId` recording
      which listing.** "This account has had three listings taken down" is the
      question somebody deciding about a person actually has, and it is only
      answerable if the rows land on the account. A real foreign key, unlike
      `Report.targetId`: a report is polymorphic across three kinds of target
      and cannot have one, this column is only ever a listing
- [x] **A live booking does not block a removal**, and is stated loudly instead.
      An unsafe item has to be able to come down while it is out on rent — that
      is when it matters most — but removing the listing does not cancel the
      booking, release the dates or return the deposit, and somebody still has
      to deal with the rental itself
- [x] Pure rules in `src/lib/admin/listing-rules.ts` (17 tests), imported by the
      moderation panel so a control the action would refuse is never shown.
      **No self-action guard and no administrator exemption**, unlike the account
      rules: exempting a listing because of who owns it would make an
      administrator's listing the only unmoderatable listing on the platform
- [x] Integration verification — `npm run verify:admin-listings`, 27 checks,
      including that a second removal writes no second row, that a removed
      listing stays inspectable while invisible to the public, that a restore
      does not repost, that an edit preserves what it overwrote, and that a
      suspended owner cannot hide their inventory from moderation

#### Fixed along the way

- [x] **The breadcrumb said "My Listings" under Admin.** `SEGMENT_LABELS` is
      keyed by segment name, and `listings` means the owner's own inventory under
      `/dashboard` and every listing on the platform under `/admin`. Added
      `PATH_LABELS`, checked first and keyed by the full path, so the more
      specific answer wins
- [x] **`verify:admin-users` had started failing on a rule that was fine.** Its
      last-administrator check read `activeAdminCount` from the database, so it
      only held while the environment contained no administrators besides the two
      the script creates — granting a real one made it report the guard as broken.
      The count is the *input* being tested, so it is now stated as 1
- [x] **The audit log rendered an edit's before/after inline.** Fine for
      `ACTIVE → SUSPENDED`; an EDIT_LISTING row carries a whole title and
      description, which turned one entry into a wall of somebody else's listing
      copy on the account history. Long or multi-line values now collapse into a
      `<details>`, chosen by the shape of the value rather than by action type

#### Left open, deliberately

- [ ] **The owner is not notified when their listing is removed or edited.** Not
      an oversight: the only moderation notification that exists goes to the
      *reporter*, once a decision is made, and nothing in this codebase has ever
      told the subject of a moderation action about it — see the reasoning in
      `notifications/report-messages.ts`. Telling an owner is defensible and
      probably right, but it is a product decision about a new class of
      notification rather than part of this slice, and it would change what the
      already-shipped report queue does

### Booking Management

Completed 27 August 2026.

- [x] Create bookings list page (`/admin/bookings`) — every booking, newest
      request first, with both parties named. `BookingCard` shows "the
      counterparty" because a renter already knows which side they are; an
      administrator knows neither, and "who is the owner here" is usually the
      first question
- [x] **Read-only, and that is a decision rather than a scope cut.** Every step
      of a booking is one of the two parties asserting something about their own
      rental, and an administrator doing it for them would write that assertion
      under the wrong name — `Booking` has no actor column on most transitions
      (`cancelledById` is the exception, and exists precisely because "who did
      this" could not otherwise be answered), so an admin-driven transition would
      be indistinguishable from the owner's own. The platform's real levers are
      elsewhere and all audited: the claims queue settles a disputed deposit, the
      reports queue takes a listing down, the members screen suspends an account.
      All three are linked from the detail view
- [x] **Nothing here sweeps.** `getRenterBookings` and
      `getOwnerBookingRequests` run `expireStalePendingBookings`,
      `releaseDueReviews` and `escalateOverdueClaims` before reading, because a
      list that offers an action has to tell the truth as it renders. This one
      offers no actions, and an oversight screen that mutates what it reports on
      cannot be read as evidence — an administrator would change a booking's
      history by looking at it. A stale request is flagged **past the 48h
      window** instead, with a sentence saying it will expire on the next read by
      either party and that nothing on this screen triggers that
- [x] Add booking filters (status, date) — plus **Awaiting a party**, which is
      three statuses rather than one: PENDING, APPROVED and PAYMENT_PENDING are
      all a booking waiting on a person, and asking "what is stuck" one status at
      a time misses two thirds of it. ACTIVE is deliberately excluded — an item
      out on rent is the system working, which is the distinction between
      `AWAITING_ACTION_STATUSES` and `holdsDates`
- [x] **The date filter matches the rental period, not `createdAt`.** The support
      question is "the rental of the 12th"; a booking made in June for an August
      rental would be missing from a June search of creation dates. Overlap, not
      containment, so a single day inside a week-long rental finds it. Parsed
      through `calendarDateSchema` and built as UTC midnight, matching the
      `@db.Date` columns — a local-time `new Date("2026-08-12")` would shift the
      boundary by the server's offset and quietly drop a day's rentals
- [x] Search by booking id, listing title, or either party's name **or email**.
      The id matches exactly rather than by fragment — a cuid fragment collides
      with unrelated bookings, and a ticket quotes the whole thing. Email is a
      lookup key here and is not rendered as a column
- [x] Create booking detail view (`/admin/bookings/[id]`) — the rental, both
      parties with addresses, the payment record, what each side wrote, the
      condition records with photographs, the claim, and the timeline. The id is
      validated in `layout.tsx` per the AGENTS.md invariant, with the list page's
      skeleton as an in-page `<Suspense>`
- [x] **Both condition records, including the pickup baseline.** The claims queue
      shows only the return handover; a defence of "it was already cracked when I
      collected it" is only checkable against the pickup record, and the photos
      are the whole reason it is on screen rather than summarised
- [x] **A withheld review is visible to an administrator.** Reciprocal
      withholding is a rule between the two parties — neither can write in
      response to what the other said — not a secret from the platform, and the
      moderation queue already hydrates unpublished reviews for the same reason.
      In a dispute the review is often the evidence
- [x] **The payment section says what the record is not.** Payment is offline: a
      confirmation is the owner's assertion, the platform never saw the money and
      never held it. An administrator is the person most likely to repeat "our
      records show you were paid" back to a renter, so the caveat sits next to the
      figures
- [x] View booking history — `src/lib/bookings/timeline.ts`, pure, 12 tests.
      Oldest first, unlike every queue here: this is one story, and a story told
      backwards has to be reversed in the reader's head. Handover, claim and
      review milestones fold in chronologically, each carrying the fact a dispute
      turns on rather than just that something happened
- [x] **A transition with no timestamp is marked approximate, not guessed.**
      There is no `approvedAt`, `declinedAt` or `expiredAt` column. A decline
      shows the row's `updatedAt` labelled "as last changed, not a recorded
      time", and approval simply does not appear. Inventing a precise moment from
      `updatedAt` would be worse than admitting the gap — a deposit dispute is
      exactly where a confidently wrong time does damage
- [x] Cross-links both ways: a member's screen reaches their listings and their
      bookings **on both sides**, and a listing's screen reaches the bookings on
      it — which is what the live-booking warning on a removal decision refers to
- [x] Integration verification — `npm run verify:admin-bookings`, 27 checks,
      including that reading a stale request leaves it PENDING with its dates
      still held and nobody notified, that a partial booking id finds nothing,
      that an explicit status beats the awaiting filter rather than being silently
      overwritten, and that a suspended party does not hide the rental

#### Left open, deliberately

- [ ] **No `approvedAt` column.** Adding one would make the timeline complete for
      bookings approved from then on, and it is the obvious follow-up — but it is
      a schema change for a nice-to-have, and backfilling it for existing rows is
      impossible, so the screen is honest about the gap instead

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

Completed 27 August 2026. **Phase 6 is finished.**

- [x] Create analytics page (`/admin/analytics`) — totals, money, breakdowns, two
      city charts and the activity feed. Read-only, and it runs **no sweeps**: a
      screen whose numbers are used to judge the platform must not change the
      platform by being opened, or the figures describe a state the act of reading
      them created
- [x] Total users count — with the standing breakdown, because "1,200 members" and
      "1,200 members, 340 of them banned" are different platforms. Soft-deleted
      accounts are excluded from the total and counted separately (D3: they are
      never removed)
- [x] Total listings count — and separately, **what the public can actually
      see**, through `VISIBLE_LISTING_WHERE`. Per the AGENTS.md invariant, a count
      computed with a looser predicate than the page it describes advertises items
      that are not there — and worse here than on a category tile, because
      somebody would use this number to decide whether supply is sufficient. The
      gap between `ACTIVE` and `live` is named on screen: it is exactly the supply
      moderation has taken out of the market, since a suspended owner keeps their
      listings
- [x] Total bookings count — split by lifecycle state, plus the share of requests
      that **ended without a rental**. A marketplace where most requests expire
      unanswered is a specific, fixable problem and it is invisible in a total
- [x] GMV tracking (PKR) — **and the definition matters more than the number.**
      Payment is offline: the money moves directly between two people,
      SamaanShare charges nothing, holds nothing and cannot verify that any of it
      moved. So this is rent *recorded on bookings*, never revenue:
        - only ACTIVE, COMPLETED and REVIEWED count — a PENDING request is a hope
          and APPROVED is a commitment that has not started, both reported
          separately as pipeline and never added in;
        - **deposits are excluded**, because they are returned — on a high-value
          item the deposit dwarfs the rent, so including it would inflate every
          figure several times over;
        - failed bookings contribute nothing and are counted, so the ratio shows.
      The paragraph saying all of this sits next to the figures rather than in a
      comment, because a number on a dashboard gets quoted — to an investor, or
      to a renter asking whether the platform has their deposit
- [x] City distribution chart — two charts, not two axes on one: listings and
      rupees are different scales, and a second y-scale lets whoever set the
      ranges decide where the lines cross. Single-hue bars from the app's own
      `--primary` token (a single series has no identity to encode, so there is
      nothing for a palette to distinguish and no legend to explain), every bar
      **directly labelled** so the chart reads identically to a screen reader with
      no tooltip and no client JavaScript, and a non-zero value floored at 2%
      width so "a little" never renders as "none"
- [x] **The city list comes from the data, not from `PAKISTANI_CITIES`.** Reading
      the configured launch cities would silently drop a city that exists in the
      database ahead of the config — which is what a launch looks like from the
      inside, and the screen reporting the expansion is the last place that should
      be blind to it
- [x] Recent activity feed — six sources merged, newest first, every row linking
      somewhere an administrator can act. **There is no global event log** (the
      models were never given one, and adding it would mean writing to it from
      every action), so this reads the newest few of each kind and merges: honest
      for recency, wrong for completeness. So it **says when a source filled its
      window** rather than looking complete while truncating
- [x] **No email addresses in the feed**, unlike the members and bookings screens.
      Those are lookups an administrator arrived at with a person in mind; this is
      a window that opens itself. It is bounded, unpaginated and unsearchable, so
      it cannot be walked to enumerate the user base — the distinction that makes
      `searchUsers` search-first
- [x] Integration verification — `npm run verify:admin-analytics`, 24 checks,
      asserting **deltas rather than totals** so it runs against a database with
      real rows in it. Includes that a deposit four times the rent does not leak
      into GMV, that suspending an owner moves their listing out of `live` but not
      out of `active`, that an unconfigured city still appears, that the feed
      admits truncation, and that three analytics reads leave a stale request
      PENDING. The last check re-reads the totals after cleanup and asserts they
      are back where they started — a verification script that leaves rows behind
      poisons every later reading of the numbers it checks

---

## Phase 2.1 revisited – the dashboard overview

Fixed 27 August 2026, found while finishing Phase 6.

- [x] **The member dashboard was still advertising unbuilt features that had
      shipped.** Four stat tiles reading `—` with hints "Available in Phase 3",
      "Available in Phase 4", "Available in Phase 2.2", and two placeholder cards
      promising listings and activity — all of it landed months ago. A
      placeholder that outlives its phase is worse than an empty state: it tells
      a member a working feature does not exist, and they stop looking for it
- [x] `getMemberOverview` — live listings, requests to answer, rentals in
      progress and saved items, in five concurrent counts
- [x] **"Live listings" goes through `VISIBLE_LISTING_WHERE`**, which also
      requires the owner to be active — so a suspended member is told zero rather
      than shown a count of listings nobody can reach. The AGENTS.md invariant
      applied to somebody's own dashboard, which is where being wrong about it is
      least forgivable. The hint names the gap when the two numbers differ
- [x] **The wishlist count uses the same relation predicate as
      `getSavedListings`**, so an item whose owner was suspended leaves the tile
      and the page together. Counted more loosely, the tile would promise a
      wishlist that renders empty
- [x] **The unread-notifications tile is gone**, replaced by requests awaiting an
      answer. The unread count is already in the header bell on every page, and
      two surfaces showing one number are two surfaces that can disagree. What
      was missing was the only tile that is actually a task
- [x] **This screen sweeps, unlike the admin queues.** `expireStalePendingBookings`
      runs first, because the tile links to the requests screen and that screen
      sweeps on read — without it the tile would count a request the page it links
      to expires on arrival. Expiry belongs to the two parties, and this is one of
      them; `searchAdminBookings` reports a stale request and leaves it alone for
      exactly the same reason
- [x] The two placeholder cards became real: the newest three listings (read-only
      rows, not `OwnerListingCard` — a destructive control beside a glanceable row
      is a control pressed by accident), and the newest five notifications, which
      *are* the member's activity record since every booking transition writes one
- [x] Integration verification — `npm run verify:member-overview`, 10 checks:
      that another member's inventory cannot leak in, that a suspension drops the
      live count to zero while the rows stay, that a request the member *made* is
      not one they answer, that reading the overview expires a stale request, and
      that a paused or suspended-owner wishlist item leaves the count

### Upload retention - fixed 7 September 2026

- [x] **`cleanup-pending-uploads.ts` knew only about listings.** It lists everything
      under `samaanshare/pending/` and destroys whatever the database does not
      reference, but it only ever queried `ListingImage` - which was correct when
      listings were the only feature with photos. Handover condition photos and
      damage-claim evidence arrived later, stored their ids under the same prefix
      via `resolveOwnedPhotos`, and inherited a sweeper that did not know they
      existed: every one of them was eligible for deletion 24h after upload. They
      are evidence in disputes over deposits, and they would have gone quietly
- [x] The reference lookup now lives in `src/lib/uploads/referenced-ids.ts`, next to
      `resolveOwnedPhotos` rather than inside the script - a fourth feature that
      accepts photos is adding a fourth table there, and the directory is where
      someone will actually see that
- [x] **`npm run cleanup:uploads` could not run at all.** The script called
      `dotenv.config()` in its body, but its imports reach `@/config/env`, which
      validates at module load - and ES imports are hoisted above the call, so env
      validation threw before dotenv ran. Now passes `--env-file=.env.local` like
      every other script in `package.json`. Verified against the real database and
      Cloudinary: 1 pending asset, correctly reported as in use

### Account security - shipped 7 September 2026

- [x] **In-app password change** (`/settings`) — the current password is re-checked
      even though the caller is signed in, because a live session is not proof that
      the person at the keyboard is the account holder; an unattended laptop is
      exactly what this form defends against
- [x] **Setting a first password** on a Google-only account — no current password to
      ask for, so the session is the proof of control, the same standing a reset link
      has. Its `password: null` predicate is an authorization check, not a
      convenience: without it this action would be the way to overwrite a password
      without knowing it, which is the thing `changePassword` demands one to prevent.
      A compare-and-swap, so two concurrent calls cannot both write
- [x] **Changing a password spends every outstanding reset token.** An attacker can
      mint one at any time - `requestPasswordReset` needs only an email address - so a
      password changed while a live link sits in their inbox is not changed at all.
      `resetPassword` already spent its siblings; this is the same rule from the other
      direction, and both are in one transaction with the password write
- [x] **Session invalidation** — see A2 above, now closed
- [x] **Connected accounts** — Google connect and disconnect. Connecting is an OAuth
      round trip rather than an action, because only Google can authorise a link;
      `signIn("google")` with a live session makes Auth.js link to the current user
      (`handleLoginOrRegister` takes that branch when it can decode the cookie)
- [x] **An account can never be left with no way in.** Disconnecting the last sign-in
      method is refused by `disconnectAccount`, not merely hidden by the UI - a member
      who removed their only credential would be locked out of an account they were
      still looking at, and could not recover it
- [x] Password policy parity is now a test. Four routes reach `User.password` -
      registration, a reset link, a change from settings, a first password on a Google
      account - and the moment one accepts what the others refuse, that one *is* the
      policy
- [x] Integration verification — `npm run verify:security`, against a real session:
      that a revoked cookie is locked out, that a versionless one is not, that a token
      claiming a version ahead is refused, that the bounce says `SessionRevoked` rather
      than `AccountSuspended`, and that `/settings` offers the right form for each
      account shape. Needs the dev server, like `verify:phase4:ui`

### Still genuinely placeholders

- [ ] `/settings` — the **Preferences** card only: notification preferences and a
      default city for browsing. Phase 2.2. Security is built


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

### Handover Protocol

Shipped 17 August 2026. `startBooking` and `completeBooking` were each one party's
unilateral click, recording that a handover happened and nothing about the state
of the thing handed over — so when a deposit dispute followed, the platform's
answer to "it came back damaged" was necessarily "we have no idea".

- [x] `HandoverRecord` + `HandoverPhoto` — one record per booking per direction,
      with condition, notes and up to six Cloudinary photos
- [x] **Required at both transitions.** Neither `startBooking` nor
      `completeBooking` can run without one, written in the **same transaction**
      as the status change: a record without the transition describes a
      collection that never happened, and a transition without the record is the
      evidence-free state this exists to end
- [x] **Requiring it cannot deadlock** — the party performing the transition is
      the party writing the record, so they are never waiting on anyone. This is
      why the gate is on the record and not on the agreement
- [x] **Sealed on write.** No update path exists, and `@@unique([bookingId, type])`
      refuses a second attempt — enforced by the *database*, because the
      application check and the insert are not atomic. A record its author can
      revise afterwards is a claim, not evidence, and the moment it matters is
      exactly when they would want to revise it
- [x] **The counterparty's agreement is recorded but never required.** Blocking
      on it would let a silent party freeze someone else's rental and deposit
      indefinitely. What is stored instead is which of **agreed / disputed /
      unanswered** happened — three distinct facts, and treating silence as
      disagreement would punish everyone who never opens the app again after
      returning a drill
- [x] `confirmHandover` — the other party only, answered once, by compare-and-swap
      on `PENDING`. An author confirming their own record would read as
      corroboration while being nothing of the kind
- [x] Photos are **public ids only**, URLs derived server-side from Cloudinary's
      Admin API, ids checked against the caller's own pending folder. Same guard
      as `listingImagePublicIdSchema`, and it matters more here: a handover photo
      that actually belonged to someone else would be evidence of nothing while
      looking exactly like proof
- [x] **Only a dispute notifies** (`HANDOVER_DISPUTED`), and only the record's
      author. Agreement is the expected path, and notifying the expected path is
      what makes an unread badge untrustworthy
- [x] **No automatic consequence.** `DAMAGED` is one person's account written at a
      door, not a finding. Nothing follows from it, and tests assert the copy
      states no verdict and no consequence — a withheld deposit on an owner's
      say-so alone is not a process
- [x] Integration verification — `npm run verify:handover`, 13 checks, including
      that the seal is refused by the database, that exactly one of two concurrent
      answers takes effect, and that a booking cannot be deleted out from under
      its record

**Known limit, recorded rather than hidden:** both transitions are owner-driven,
so the owner always writes the record and the renter always answers it. A renter
who thinks an item arrived scratched can only say so in the dispute note, and
cannot attach their own photos. Letting either side file an independent record is
the natural extension; it needs a second record per direction rather than a
schema change.

---

### Damage Claims

Shipped 18 August 2026, and this completes Trust & Safety.

**A claim cannot move money.** The deposit passes directly between the two people
and SamaanShare never holds it — `src/lib/bookings/deposit.ts` says every function
there is about *stating an obligation, never custody*. So a claim changes the
amount the platform **states** is owed back: settle one for PKR 15,000 of a
PKR 60,000 deposit and the obligation becomes PKR 45,000. Same act, applied to a
disagreement.

- [x] `DamageClaim` + `ClaimPhoto` — a **real foreign key to `Booking`**, which is
      the whole reason it is not another `ReportReason`. `ITEM_DAMAGED` and
      `ITEM_NOT_RETURNED` already exist there, but a report targets a *person*
      through a polymorphic `targetId` with no foreign key: it can reach neither
      the booking, nor its deposit, nor the return condition record
- [x] One claim per booking (`@@unique`), so the owner states everything at once
      rather than filing again after the first is answered
- [x] Both parties **derived from the booking**, never from input — a
      client-supplied respondent would aim a demand for money at someone who was
      not party to the rental
- [x] **Capped at the deposit.** That is the only obligation the platform has
      standing to describe; a larger figure would imply an enforcement power that
      does not exist. Damage beyond it is between the two people
- [x] `fileDamageClaim`, `respondToDamageClaim`, `withdrawDamageClaim`
- [x] **Renter acceptance settles it with no administrator** — the parties agree,
      so there is nothing left for a third to decide. Only a dispute reaches the
      queue
- [x] **Silence is never acceptance.** An unanswered claim escalates to a human
      after 7 days rather than succeeding by default. Unlike a handover record, a
      claim has a price attached, and letting a missed notification cost someone
      money is a way of collecting from the inattentive. `respondedAt` stays null
      through an escalation, so an absence stays distinguishable from a dispute
- [x] **The deposit clock pauses while a claim is live, with a hard cap** at the
      same 7 days — one constant used twice, so the pause can never outlast the
      renter's chance to answer. Without the cap, filing a claim would be the
      most effective way to hold a deposit indefinitely
- [x] **An unsettled claim deducts nothing.** `upheldAmount` returns `null` while
      open or disputed, so the full deposit stays owed — the platform does not act
      on one party's assertion
- [x] A claim **cannot be filed once the deposit has gone back**, which stops
      "return it, then claim it"
- [x] `resolveDamageClaim` — admin only, `DISPUTED` only, compare-and-swap,
      bounded at the amount claimed (awarding beyond it would decide something
      nobody put to the administrator). Resolution note **required**, unlike a
      report's, because a determination neither party can read the reasoning for
      is one neither can accept or appeal
- [x] `/admin/claims` — oldest first, the opposite of the report queue, because a
      claim holds somebody's money and has a clock on it
- [x] **The contradiction is the headline.** When the owner's own return record
      graded the item as fine and they are now claiming damage, the queue flags it
      first. Not a refusal — hidden faults are real — but it is the strongest
      evidence available either way
- [x] Photo resolution moved to `src/lib/uploads/resolve-photos.ts` and shared
      with handovers. Both checks in it are security boundaries, and a second copy
      is a second place for one to be dropped
- [x] Integration verification — `npm run verify:claims`, 13 checks, including
      that an unsettled claim leaves the full deposit owed, that silence escalates
      without being recorded as a dispute, and that two administrators cannot
      decide the same claim twice
- [x] **End-to-end verification — `npm run verify:claims:ui`, 43 checks.** Drives
      the real Server Actions over HTTP with real Auth.js session cookies for
      three parties, then asserts on the HTML each is actually served. Covers
      what a database script cannot: session authentication, the authorization
      inside each action, the Server Action pipeline, and what the owner, renter
      and administrator see on screen.
      Action ids are **read from the built client chunks at runtime**, never
      hardcoded — they change on every build, and a pinned id would turn a broken
      action into a passing test the day someone edited an unrelated file.
      Requires `npm run build && npm run start`: a turbopack dev server would not
      answer to production ids.

**Deliberately not wired:** an upheld claim is a strong negative signal about a
renter, but it does not feed `assessTrust`. Coupling the reputation system to a
money dispute deserves its own decision rather than arriving as a side effect.

---

**Next:** Trust & Safety is complete — reporting and moderation, public trust profiles and the trust
score, identity verification, value-gated access, the handover protocol, and damage claims.

What remains before launch sits in **Phase 6** (the rest of admin: user filters, suspension and role
actions, listing moderation, analytics) and **Phase 7** (error handling, loading states, SEO,
accessibility, a real test setup, deployment). Stage A6 is still blocked on production
infrastructure, and `docs/DEPLOYMENT.md` has the full checklist.

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

### Value-Gated Access

Shipped 17 August 2026. What a stranger has to have shown before they can ask to
rent something, scaled to what is at stake.

Payment is offline and there is no escrow, so when an owner hands over a
generator the platform is holding nothing that could make them whole. On a
PKR 800 drill that is fine. On something worth six figures it is not.

- [x] `src/lib/trust/access.ts` — pure, 20 tests. Three tiers on
      `Listing.securityDeposit`: open below PKR 25,000, **elevated** to
      PKR 100,000, **high-value** above it
- [x] **Gated on what the owner said is at risk**, not a number the platform
      invented. An owner wanting fewer hurdles can ask for a smaller deposit and
      carries that risk themselves, so the incentive points the right way with no
      extra machinery. A listing with no deposit gates nothing — that is the
      owner's call
- [x] Elevated requires a confirmed email address — one click, and it is the
      difference between an account with a reachable person behind it and one
      made in ten seconds with a throwaway address
- [x] High-value requires a confirmed address **and** either a verified identity
      **or** 3 completed rentals. **The "or" is load-bearing**: identity
      verification is granted by an administrator out of band, so requiring it
      alone would make every high-value listing unbookable by everyone at launch.
      A rule so strict it stops the feature working is an outage, not a safety
      measure. Completed rentals are different evidence for the same thing — an
      account with a history it would lose
- [x] **Every gate is clearable, and every refusal says how.** Asserted across
      all tiers: a gate that cannot be passed is a dead end wearing the costume
      of a safety feature. All unmet requirements are reported at once, because
      naming one at a time is how someone gives up on the second refusal
- [x] Enforced in `createBookingRequest`, which is the boundary. The listing page
      shows the gate instead of the date fields, but that is a courtesy — the
      form is a rendering decision and the action is a public endpoint
- [x] Signals read from the **database, never the session**. A withdrawn
      verification would otherwise keep clearing high-value gates for up to 24h
      while the JWT went stale — the same reasoning that made `requireUser`
      re-read `status`
- [x] The rule is stated on the listing to everyone who can see it, **including
      the owner**: setting a large deposit narrows who may ask to rent the item,
      and that consequence should not be discovered through an empty inbox
- [x] Nothing promises safety. Asserted — clearing a gate does not make a rental
      safe, and the copy never implies SamaanShare stands behind it
