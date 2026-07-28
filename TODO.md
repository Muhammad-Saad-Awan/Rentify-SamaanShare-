# SamaanShare - Development Backlog

**Last Updated:** July 2026
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

### Database

- [ ] Install Prisma
- [ ] Configure Prisma for PostgreSQL
- [ ] Create initial `schema.prisma` (from DATABASE.md)
- [ ] Set up Prisma client singleton
- [ ] Create seed script (`prisma/seed.ts`)
- [ ] Run initial migration
- [ ] Seed categories and initial data

### Authentication

- [ ] Install Auth.js v5
- [ ] Configure Auth.js with JWT strategy
- [ ] Set up Credentials provider (email/password)
- [ ] Set up Google OAuth provider
- [ ] Create auth configuration (`auth.ts`)
- [ ] Set up middleware for protected routes
- [ ] Create session utilities

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
- [ ] Create header component
- [ ] Create footer component
- [ ] Create mobile navigation
- [x] Add theme provider (light/dark mode ready)

### Utilities

- [ ] Create PKR currency formatter (`formatPKR`)
- [ ] Create date utilities (Asia/Karachi timezone)
- [ ] Create validation schemas (Zod)
- [ ] Create action result types
- [ ] Create error handling utilities

### Verification

- [x] Verify development server runs
- [ ] Verify database connection
- [ ] Verify Prisma Studio works
- [x] Verify TypeScript compilation
- [x] Verify ESLint passes
- [ ] Deploy to Vercel (staging)

---

## Phase 1 – Authentication

### Registration

- [ ] Create registration page (`/register`)
- [ ] Create registration form component
- [ ] Add form validation (Zod + React Hook Form)
- [ ] Create `registerUser` server action
- [ ] Hash passwords with bcrypt
- [ ] Send verification email (placeholder for MVP)
- [ ] Handle registration errors
- [ ] Add success redirect

### Login

- [ ] Create login page (`/login`)
- [ ] Create login form component
- [ ] Add form validation
- [ ] Create credentials login flow
- [ ] Add Google OAuth button
- [ ] Handle login errors
- [ ] Add "Remember me" option
- [ ] Add redirect after login

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

- [ ] Create session provider
- [ ] Add session to client context
- [ ] Create `useSession` hook
- [ ] Handle session expiration
- [ ] Add logout functionality

### Protected Routes

- [ ] Configure middleware for auth routes
- [ ] Create auth guard wrapper
- [ ] Handle unauthorized access
- [ ] Add redirect to login

---

## Phase 2 – Marketplace (Browse & Search)

### Homepage

- [ ] Create homepage (`/`)
- [ ] Add hero section (Pakistani context)
- [ ] Add category showcase grid
- [ ] Add featured listings section
- [ ] Add "How it works" section
- [ ] Add city selector (Karachi, Lahore, Islamabad)
- [ ] Add call-to-action sections
- [ ] Optimize for SEO

### Listings Browse

- [ ] Create listings page (`/listings`)
- [ ] Create listings grid component
- [ ] Create listing card component
- [ ] Add pagination
- [ ] Add loading skeletons
- [ ] Add empty state

### Search

- [ ] Create search input component
- [ ] Implement keyword search
- [ ] Add search to header
- [ ] Create search results page
- [ ] Highlight search terms

### Filters

- [ ] Create filter sidebar component
- [ ] Add category filter
- [ ] Add subcategory filter
- [ ] Add city filter (Pakistani cities)
- [ ] Add min price filter (PKR)
- [ ] Add max price filter (PKR)
- [ ] Add condition filter (New, Like New, Good, Fair)
- [ ] Add availability date filter
- [ ] Create filter state management (URL params)
- [ ] Add "Clear filters" button

### Sorting

- [ ] Create sort dropdown component
- [ ] Add sort by newest
- [ ] Add sort by price (low to high)
- [ ] Add sort by price (high to low)
- [ ] Add sort by rating
- [ ] Persist sort in URL

### Category Pages

- [ ] Create category page (`/categories/[slug]`)
- [ ] Create category navigation
- [ ] Add subcategory links
- [ ] Display category-specific listings

### Wishlist

- [ ] Create saved listings page (`/saved`)
- [ ] Create `saveListing` action
- [ ] Create `unsaveListing` action
- [ ] Add save button to listing cards
- [ ] Show saved state on cards

---

## Phase 3 – Listings

### Create Listing

- [ ] Create new listing page (`/listings/new`)
- [ ] Create multi-step listing form
- [ ] Step 1: Basic info (title, description, category)
- [ ] Step 2: Pricing (daily/weekly/monthly in PKR)
- [ ] Step 3: Location (city, area)
- [ ] Step 4: Images (up to 10)
- [ ] Step 5: Review and submit
- [ ] Create `createListing` action
- [ ] Add form validation
- [ ] Handle submission errors

### Image Upload

- [ ] Set up Cloudinary integration
- [ ] Create image upload component
- [ ] Add drag-and-drop support
- [ ] Add image preview
- [ ] Implement image reordering
- [ ] Add image deletion
- [ ] Enforce 10 image limit
- [ ] Compress images before upload
- [ ] Create `addListingImages` action
- [ ] Create `removeListingImage` action
- [ ] Create `reorderListingImages` action

### Listing Detail

- [ ] Create listing detail page (`/listings/[id]`)
- [ ] Create image gallery component
- [ ] Add image zoom/lightbox
- [ ] Display listing information
- [ ] Show pricing breakdown (PKR)
- [ ] Show security deposit
- [ ] Display owner profile card
- [ ] Add contact owner button
- [ ] Add save to wishlist button
- [ ] Add share button (WhatsApp focus)
- [ ] Show similar listings
- [ ] Add breadcrumb navigation
- [ ] Optimize for SEO (dynamic metadata)

### Edit Listing

- [ ] Create edit listing page (`/listings/[id]/edit`)
- [ ] Pre-populate form with existing data
- [ ] Create `updateListing` action
- [ ] Handle image changes
- [ ] Add delete listing option

### Listing Management

- [ ] Create my listings page (`/dashboard/listings`)
- [ ] Show listing statistics (views, inquiries)
- [ ] Add listing status controls (active/paused)
- [ ] Create `updateListingStatus` action
- [ ] Add quick edit actions
- [ ] Create `deleteListing` action (soft delete)

### Availability Calendar

- [ ] Create availability calendar component
- [ ] Mark available/unavailable dates
- [ ] Create `updateListingAvailability` action
- [ ] Show booked dates
- [ ] Sync with bookings

### Categories

- [ ] Seed all categories from PRD
- [ ] Create category management (admin)
- [ ] Add category icons
- [ ] Create category tree structure

---

## Phase 4 – Booking System

### Booking Request

- [ ] Create booking request component
- [ ] Add date range picker
- [ ] Show pricing calculation (PKR)
- [ ] Show security deposit
- [ ] Add payment method selection (Cash/Bank Transfer)
- [ ] Add booking notes field
- [ ] Create `createBookingRequest` action
- [ ] Check availability before booking
- [ ] Handle booking conflicts

### Booking Lifecycle

- [ ] Implement PENDING status
- [ ] Implement APPROVED status
- [ ] Implement PAYMENT_PENDING status
- [ ] Implement ACTIVE status
- [ ] Implement COMPLETED status
- [ ] Implement REVIEWED status
- [ ] Implement DECLINED status
- [ ] Implement CANCELLED status
- [ ] Implement EXPIRED status (auto-expire after 48h)

### Owner Actions

- [ ] Create booking requests page (`/dashboard/requests`)
- [ ] Show pending requests
- [ ] Create `acceptBooking` action
- [ ] Add pickup instructions form
- [ ] Create `declineBooking` action
- [ ] Add decline reason

### Payment Flow (Offline MVP)

- [ ] Create payment instructions component
- [ ] Show Cash payment instructions
- [ ] Show Bank Transfer instructions
- [ ] Create `confirmPaymentReceived` action
- [ ] Update booking to ACTIVE after payment
- [ ] Create `markDepositReturned` action

### Renter Actions

- [ ] Create my bookings page (`/dashboard/bookings`)
- [ ] Show booking status
- [ ] Display pickup instructions (after approved)
- [ ] Create `cancelBooking` action
- [ ] Show cancellation policy

### Booking Completion

- [ ] Create `startBooking` action (pickup done)
- [ ] Create `completeBooking` action (return done)
- [ ] Trigger review prompts
- [ ] Handle deposit return tracking

### Notifications

- [ ] Create notification system (in-app)
- [ ] Notify owner on new request
- [ ] Notify renter on approval/decline
- [ ] Notify on payment confirmation
- [ ] Notify on booking completion
- [ ] Create notification bell component
- [ ] Mark notifications as read

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

*Last reviewed: Pre-implementation*
