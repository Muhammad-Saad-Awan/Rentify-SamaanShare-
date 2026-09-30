# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

Everything below was built after the 1.0.0 documentation release. It runs on
staging, deployed 9 September 2026. Nothing has shipped to production, so it all
stays unreleased; `TODO.md` holds what remains.

### Added

#### Foundation (Phase 0 — 27-28 July 2026)

- Next.js 15 App Router project, TypeScript strict mode, `@/` path aliases
- Tailwind CSS and shadcn/ui, with a light/dark theme provider
- Prisma with PostgreSQL on Neon, and the initial migration
- PKR currency formatting and Asia/Karachi date utilities
- ESLint, Prettier, and Node pinned to 24 in `.nvmrc` and `engines`

#### Authentication (Phase 1 — 29 July 2026)

- Auth.js v5 with the Prisma adapter, JWT sessions, credentials and Google sign-in
- Registration, login, password reset and email confirmation
- `requireUser()` (redirects) and `getActiveUser()` (returns), both verifying
  `status` against the database rather than trusting the JWT, which can be up to
  24h stale
- Route protection derived from a single `PROTECTED_PREFIXES` list, which the
  robots file later reuses so a protected route cannot be left crawlable

#### Dashboard and application shell (Phase 2.1 — 29 July-3 August 2026)

- Authenticated dashboard layout, header, mobile drawer and user menu
- Dashboard overview showing the member's real counts

#### Marketplace (Phase 2 — 3 August 2026)

- Public shell — `SiteHeader`, `SiteFooter`, brand and skip-to-content link
- Listings browse with pagination, keyword search, and filters for category,
  city, price, condition and availability dates; sorting by newest, price and
  rating
- Homepage with hero, category showcase, city shortcuts and how-it-works
- Category and subcategory pages
- Header search, with the search term highlighted in results
- Wishlist (saved listings), toggled optimistically
- Listing detail page — gallery, pricing panel, owner card, share
- `sitemap.xml` and `robots.txt`, both derived from live data rather than
  hand-written: the sitemap filters through the same visibility predicate the
  pages use, so it can never advertise a URL that answers 404
- schema.org structured data for listings, categories and the site

#### Listings (Phase 3 — 3 August 2026)

- Create and edit listing, with up to 10 images uploaded straight to Cloudinary
  through short-lived signed payloads, so no image transits the server
- Owner listing management — pause, activate, archive, delete
- Availability calendar
- `cleanup:uploads`, which removes images uploaded for a listing that was never
  saved

#### Booking system (Phase 4 — 4-11 August 2026)

- Booking requests with dates, notes and a PKR price breakdown
- The full lifecycle — PENDING → APPROVED → PAYMENT_PENDING → ACTIVE →
  COMPLETED → REVIEWED, plus DECLINED, CANCELLED and EXPIRED — with every legal
  transition in one pure, tested table
- Owner accept/decline, payment confirmation, renter cancellation
- Offline payments: cash and bank transfer instructions behind a payment
  abstraction layer, so an online provider can be added later without touching
  the lifecycle
- Conflict-safe creation — overlapping dates are refused *inside* the
  transaction, not by a check that could race it
- In-app notifications on every status change
- Vitest for the pure modules, and `verify:phase4`, which exercises the
  transactional paths against a real database

#### Reviews (Phase 5 — 12-17 August 2026)

- Two-way reviews after a completed booking, with reciprocal release: neither
  side sees the other's until both are in or the window closes, so a review
  cannot be written in retaliation for one already visible
- Star rating and comment, shown on both listings and profiles
- Rating aggregates split by direction, so a member's standing as an owner is not
  averaged together with their standing as a renter

#### Trust & Safety (17-18 August 2026)

- Reporting for listings and users, with reasons, and admin resolution
- Public trust profiles, and a trust score built from verification, history and
  reliability
- Identity verification and verified badges
- Value-gated access on high-deposit listings
- Handover protocol — sealed condition records with photos at pickup and return,
  written in the **same transaction** as the status change, and required at both.
  No update path exists and the database refuses a second record per direction: a
  record its author can revise afterwards is a claim, not evidence, and the moment
  it matters is exactly when they would want to revise it
- Damage claims against the deposit, linked to a booking, with admin resolution

#### Admin dashboard (Phase 6 — 27 August 2026)

- Admin layout, navigation, and an authorization guard shared by every admin route
- User management — search, view, suspend, restore, soft-delete — each write
  carrying an audit record naming the actor, the target and the reason
- Listing moderation, booking oversight and report handling
- Platform analytics
- `npm run admin:grant` to bootstrap the first administrator

#### Account management (8 September 2026)

- Profile editing — name, bio, city, phone, photo
- In-app password change, and a list of connected accounts
- Member preferences — default browse city, notification switches

#### Accessibility and end-to-end testing (15-24 September 2026)

- Playwright with `@axe-core/playwright`, run against a production build rather
  than `next dev` — the dev server injects its own overlay, and a scan cannot
  tell Next's markup from ours
- A throwaway account fixture created and removed per run, so no known password
  is ever seeded into a developer's database
- The critical path end to end: register, request, approve, pay, collect,
  return, review, in two browser contexts. Publishing a listing is the one step
  it cannot reach, because image verification calls Cloudinary's Admin API
- The in-process rate limiter measured rather than assumed. Ten registrations
  were obtained against a documented limit of five, because the limit is
  per-instance and a restart resets it

#### Custodial payments — collection through deposit return (27-30 September 2026)

- `computeCommission` in basis points, rounding down with the remainder to the
  owner. It takes a rental amount and nothing else, so it structurally cannot
  take a cut of a deposit or of damage compensation
- `Payment` gained evidence fields — submission, proof with a unique hash,
  rejection, and the commission rate frozen at verification
- `submitPaymentEvidence`, `verifyPayment`, `rejectPayment` and
  `reverseVerification`. Every write is a compare-and-swap; reversal is refused
  once the booking has left `PAYMENT_PENDING`, because by then an owner has
  handed over an item on the strength of it
- A `Settlement` model and `settleBooking`, deriving every figure rather than
  accepting any. Two conservation rules hold by construction: commission plus
  owner rental equals the rental, and damage compensation plus the returned
  deposit equals the deposit
- `recordOwnerPayout` and `recordDepositReturn` as separate acts, in either
  order — they go to different people and nothing makes one wait on the other
- `Booking.depositConfirmedAt`, the renter's half of a record that was
  one-sided. Whoever returns the deposit says they sent it; only the person
  waiting for it can say it arrived

#### Photo evidence integrity (29-30 September 2026)

- Handover condition photos come from the camera only — the gallery, the
  drag-and-drop target and the multi-file pick are all removed from that form
- Handover and claim photos carry Cloudinary's checksum, read server-side from
  the Admin API response that already supplies the URL, and unique per table. The
  same image cannot be submitted as evidence twice — most importantly not this
  rental's pickup photo offered again at return

#### Realtime notifications (29-30 September 2026)

- Pusher Channels, one private channel per member, with authorization derived
  from the session and compared against the requested name
- A dashboard subscriber that deduplicates by notification id, raises a toast and
  debounces a `router.refresh()`. Nothing is rendered from the payload but the
  toast's line; the badge, the panel, the feed and the booking cards are Server
  Components re-run against Postgres
- Reconnects refresh, which recovers everything missed with no cursor and no
  replay endpoint
- Five new notification types for the custodial money events, and two reused
  rather than duplicated
- A two-browser test that watches one page change because of another's action,
  and which was confirmed to fail with the refresh disabled

#### Smaller additions

- A show-password toggle on the sign-in form and on both settings password forms
- "Take a photo" on the listing uploader, for the phone in someone's hand

### Changed

- Read-only `$transaction([...])` pairs converted to `Promise.all` (Stage A4).
  The comments claiming they guaranteed a shared snapshot were **wrong**: Prisma
  uses the database default isolation level, and Postgres READ COMMITTED takes a
  new snapshot per statement, so the count and the page could already disagree
  inside the transaction. The guarantee was never there to lose; what the
  transaction did cost was a connection held across both statements, which is
  what timed out on a Neon cold start. Write-transaction `maxWait`/`timeout`
  raised from 2s/5s to 15s
- Migrations now run during the Vercel build (`db:migrate:deploy && build`), so a
  deploy cannot serve a build against a schema it does not match
- The generated Prisma client is no longer tracked in git
- `createNotifications` returns the rows it wrote rather than a count, through
  `createManyAndReturn`. The ids do not exist until the rows do, and the realtime
  subscriber deduplicates on them
- `depositState` carries the renter's confirmation as a nullable field on the
  existing `returned` state rather than as a new state, so every surface that
  handles "returned" keeps handling it. Null means unconfirmed, never "not
  received"
- Deposit wording is neutral between the two flows: "Returned." rather than
  "Returned by the owner", because under the custodial flow the platform returns
  it

### Fixed

- Google's `email_verified` claim is carried onto `User.emailVerified`, and
  persisted through the `linkAccount` event rather than only at first sign-in
- The upload cleanup job was deleting handover and claim photos, which are not
  listing images and are evidence in a deposit dispute
- An owner could approve a booking without giving the renter any way to reach
  them, leaving two people with each other's first name and no way to meet
  (Stage A1)
- `viewCount` was shown to owners but never incremented, so every owner saw 0
  forever. It is now recorded from the browser rather than on render: a GET that
  mutates fires on every crawler hit, link preview and prefetch, so the number
  would have measured indexing rather than interest (Stage A5)
- The decline and cancel reason panels were declared *inside* their parent
  component, making them a new component type on every render, so React remounted
  the field and the caret jumped out after each keystroke. Server-rendered HTML is
  identical either way, which is what hid it
- Base UI is now told when a `Button` is not rendering a `button`
- **Clicking the notification bell replaced the whole application** with
  "SamaanShare could not load". The panel used `DropdownMenuLabel`, which is Base
  UI's `Menu.GroupLabel` and throws without a `Menu.Group` around it — as the
  popup mounts, which is why the page loaded fine and only the click failed. The
  bell lives in the dashboard layout, and a segment's `error.tsx` does not cover
  its own layout, so the throw reached `global-error.tsx`. In production the
  message is minified to "Base UI error #31"
- A link styled as a button announced itself as a button, across 42 modules
- Muted text on a muted surface sat below the AA contrast threshold
- The notification switches had no accessible name
- Panels and list changes dropped keyboard focus to `<body>`
- A `loading.tsx` above a 404-able route flushed a 200 before `notFound()` could
  change it

### Removed

- `picsum.photos` from the `next.config.ts` image `remotePatterns`, which is now
  Cloudinary-only. Every entry there is a host `next/image` will fetch, proxy and
  cache arbitrary bytes from on request, so that list is a security boundary and
  not a convenience. The demo seed returned on 9 September without images, and
  stays development-only

### Security

- **Password reset** (Stage A2) — tokens are 256 bits of CSPRNG output stored as
  a SHA-256 hash, never in plaintext, in their own table rather than sharing
  Auth.js's `VerificationToken`, which has no type discriminator and would let a
  reset token be redeemed as a verification token. Single-use by compare-and-swap,
  with every sibling token spent on success so a parallel request cannot take the
  account straight back. Enumeration-safe: registered, unregistered, suspended,
  OAuth-only and rate-limited all receive one neutral response
- **Session invalidation on password change** — `User.tokenVersion`, compared
  where the token is *read* rather than in the `jwt` callback, because
  `updateAge` re-issues a token every 24h and a check at mint time would have
  handed the revoked session a fresh token instead of refusing it
- **Environment validation** with Zod at import (Stage A3), split into a pure
  schema, a server-only parser and a `NEXT_PUBLIC_*` half, with empty strings
  treated as absent — that is how a hosting dashboard records a cleared field
- **Security headers** on every route: `X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS. No CSP
  yet, deliberately — one loose enough to work without per-request nonces would
  look like protection without being it
- **Public listing reads go through one `VISIBLE_LISTING_WHERE` predicate**
  covering listing status, soft deletion *and* owner status, so a suspended
  owner's listings cannot resurface through a hand-written query
- Cloudinary uploads are signed server-side and short-lived
- Every administrative write is recorded in an audit log
- **Realtime channels are private and authorized server-side.** The channel a
  client asks for is never trusted: the endpoint builds the channel the session is
  entitled to and compares, rather than parsing an id out of the requested name,
  which is what a prefix trick slips past. The session is re-read from the
  database, because a subscription outlives the request that authorized it
- **Realtime payloads carry an id, a type, a title and a link target** — no body,
  no amounts, no counterparty. Less of a member's business crosses a third party,
  and a client with nothing to render from cannot drift from the database
- **Evidence photos cannot be reused.** Cloudinary's checksum is read
  server-side, never accepted from the browser, because anybody willing to reuse
  a photo is equally willing to send a hash that does not match it

---

## [1.0.0] - 2026-07-27

### Added

#### Documentation
- **PRD.md** - Complete Product Requirements Document for Pakistan market
  - Target users and personas (Ayesha, Ahmed, Fatima)
  - Core features specification
  - User stories
  - Success metrics (KPIs)
  - Non-functional requirements
  - Category taxonomy
  - Pakistani cities (Karachi, Lahore, Islamabad)

- **ARCHITECTURE.md** - Technical Architecture Document
  - High-level architecture diagram
  - Technology stack decisions
  - Payment abstraction layer design
  - Authentication architecture (Auth.js v5)
  - Admin dashboard architecture
  - Data flow diagrams
  - Security architecture
  - Localization configuration (PKR, Asia/Karachi)
  - Deployment architecture

- **DATABASE.md** - Database Schema Design
  - Complete Prisma schema
  - Entity Relationship Diagram (ERD)
  - User, Listing, Booking, Payment, Review models
  - Report model for moderation
  - Booking status enum (PENDING → APPROVED → PAYMENT_PENDING → ACTIVE → COMPLETED → REVIEWED)
  - Indexing strategy
  - Data integrity constraints

- **API.md** - API Design Document
  - Server Actions specification
  - Authentication actions
  - Listing actions
  - Booking actions with lifecycle
  - Payment actions (offline MVP)
  - Review actions
  - Report actions
  - Admin actions
  - Standard response format

- **PROJECT_STRUCTURE.md** - Folder Organization
  - Complete project structure
  - Feature-based organization
  - File naming conventions
  - Component organization
  - Route structure

- **ROADMAP.md** - Development Phases
  - Phase 0: Foundation
  - Phase 1: MVP features
  - Phase 2: Trust & Pakistani Payments
  - Phase 3: Growth
  - Phase 4: Scale
  - MoSCoW prioritization
  - Implementation order
  - Success milestones

- **ENGINEERING_GUIDELINES.md** - Coding Standards
  - Folder structure conventions
  - Naming conventions
  - TypeScript best practices
  - Component architecture
  - Server Actions vs Route Handlers
  - API response format
  - Error handling patterns
  - Validation standards (Zod)
  - Security checklist
  - Performance checklist
  - Git commit conventions
  - Code review checklist
  - Environment variables
  - Documentation standards

#### Project Setup
- Initialized Git repository
- Created `.gitignore` for Next.js + TypeScript + Prisma
- Created `.editorconfig` for consistent formatting
- Created `.gitattributes` for Git file handling
- Added MIT License
- Created `README.md` with project overview
- Created `TODO.md` development backlog
- Created `CHANGELOG.md` (this file)

### Architecture Decisions

- **Target Market:** Pakistan (PKR currency, Asia/Karachi timezone)
- **Framework:** Next.js 15 with App Router
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** Auth.js v5 (Email + Google OAuth)
- **Images:** Cloudinary (up to 10 per listing)
- **Payments:** Provider-agnostic abstraction layer
  - MVP: Offline (Cash, Bank Transfer)
  - Future: JazzCash, Easypaisa, Safepay, PayFast, Stripe
- **Hosting:** Vercel
- **Styling:** Tailwind CSS + shadcn/ui

### Booking Lifecycle

Standardized booking status workflow:
```
PENDING → APPROVED → PAYMENT_PENDING → ACTIVE → COMPLETED → REVIEWED
Additional: DECLINED, CANCELLED, EXPIRED
```

### MVP Scope

Included in MVP:
- User authentication (email verification, Google OAuth)
- Listing management (up to 10 images)
- Search with filters (keyword, category, city, price, condition, availability)
- Sorting (newest, price, rating)
- Booking system with offline payments
- Two-way review system
- User reporting (listings, users)
- Admin dashboard (users, listings, bookings, reports)

Deferred to Phase 2:
- Real-time messaging/chat
- Online payment processing
- Phone OTP verification
- CNIC verification

### Security

- Role-Based Access Control (USER, ADMIN)
- Auth.js CSRF protection
- Prisma parameterized queries (SQL injection prevention)
- Input validation with Zod
- httpOnly session cookies

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| Unreleased | — | Phases 0-6 and Stage A built; staging deployed 9 September 2026 |
| 1.0.0 | 2026-07-27 | Architecture locked, documentation complete |

---

## Links

- [Repository](https://github.com/Muhammad-Saad-Awan/Rentify-SamaanShare-)
- [Documentation](docs/)
- [TODO Backlog](TODO.md)

---

*Generated as part of SamaanShare project initialization*
