# SamaanShare - Development Backlog

**Last Updated:** 11 August 2026 (Phase 4 — Booking System, complete)
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
      lifecycle, deposit window, notification copy) — 133 tests
- [x] Integration verification for the booking lifecycle — `npm run verify:phase4`
      exercises the transactional paths against a real database (conflict safety,
      date release, compare-and-swap, idempotency) and `npm run verify:phase4:ui`
      renders both dashboards at every status behind a real session. Both create
      their own throwaway rows and delete them. **Not** a substitute for a Vitest
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
- [ ] Set up environment validation with Zod
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
- [ ] Deploy to Vercel (staging)

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

- [ ] Create forgot password page (`/forgot-password`)
- [ ] Create `requestPasswordReset` action
- [ ] Generate reset tokens
- [ ] Create reset password page (`/reset-password`)
- [ ] Create `resetPassword` action
- [ ] Validate reset tokens
- [ ] Handle expiration

### Email Verification

- [ ] Create verification page (`/verify-email`)
- [ ] Generate verification tokens
- [ ] Create `verifyEmail` action
- [ ] Handle verification success/failure
- [ ] Resend verification option

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

- [ ] Create public profile page (`/users/[id]`)
- [ ] Display user info (name, bio, city)
- [ ] Display user's listings
- [ ] Display user's reviews
- [ ] Calculate and show trust score

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
- [ ] Show listing statistics (views, inquiries) — **partly broken.** The owner
      card renders `listing.viewCount` (`owner-listing-card.tsx:155`) but nothing
      ever increments it: the detail page deliberately does not, because a GET
      that mutates fires on prefetch. So every owner sees 0 views. Either drop
      the stat or increment it from somewhere safe. "Inquiries" has no source at
      all until messaging exists.
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
- [ ] Implement REVIEWED status — Phase 5. The `COMPLETED -> REVIEWED` edge exists in the
      transition table but nothing drives it; writing a `Review` and recalculating
      `User.ratingAverage` belongs with reviews.
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
- [x] Add pickup instructions form — the action accepts and stores them, and the renter is shown
      them once approved. The owner-facing *input* is still absent: approval is a single click,
      and there is no dialog primitive in the project to collect the text without one.
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

### Create Review

- [ ] Create review form component
- [ ] Add star rating (1-5)
- [ ] Add review comment
- [ ] Create `createReview` action
- [ ] Enforce one review per booking
- [ ] Only allow after COMPLETED status

### Two-Way Reviews

- [ ] Owner reviews renter
- [ ] Renter reviews owner
- [ ] Create `markBookingReviewed` action
- [ ] Show review status in booking

### Display Reviews

- [ ] Show reviews on listing detail
- [ ] Show reviews on user profile
- [ ] Calculate average rating
- [ ] Sort reviews by date
- [ ] Add pagination for reviews

### Trust Score

- [ ] Calculate trust score algorithm
- [ ] Display trust badges
- [ ] Show verification status

### Review Moderation

- [ ] Create `reportReview` action
- [ ] Add report reasons
- [ ] Show in admin dashboard

---

## Phase 6 – Reporting & Admin Dashboard

### User Reporting

- [ ] Create report listing component
- [ ] Create report user component
- [ ] Create `reportListing` action
- [ ] Create `reportUser` action
- [ ] Add report reasons (predefined)
- [ ] Add report description (optional)

### Admin Layout

- [ ] Create admin layout (`/admin/layout.tsx`)
- [ ] Add admin sidebar navigation
- [ ] Add admin header
- [ ] Implement admin route protection
- [ ] Create admin dashboard home

### User Management

- [ ] Create users list page (`/admin/users`)
- [ ] Add user search
- [ ] Add user filters (status, role)
- [ ] Create user detail view
- [ ] Create `suspendUser` action
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

- [ ] Create reports page (`/admin/reports`)
- [ ] Show reported listings
- [ ] Show reported users
- [ ] Create `resolveReport` action
- [ ] Create `dismissReport` action
- [ ] Add resolution notes

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

- [ ] Optimize images (Next.js Image)
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

**Next:** Trust & Safety (identity verification, value-gated access, handover protocol, damage
claims). Phase 4 was built to receive it: `canStartBooking` and the completion guard are the two
points a sealed handover record becomes a condition rather than a rewrite, and no copy anywhere
claims SamaanShare holds a deposit — so escrow can be added without walking a promise back.
