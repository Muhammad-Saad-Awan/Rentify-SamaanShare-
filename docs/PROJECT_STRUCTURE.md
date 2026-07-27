# SamaanShare - Project Structure

**Version:** 1.0 - Architecture Locked
**Last Updated:** July 2026
**Target Market:** Pakistan
**Status:** Final - Ready for Implementation

---

## 1. Overview

This document defines the folder structure and file organization conventions for the SamaanShare codebase.

### Design Principles

1. **Feature-based organization** - Group related files together
2. **Co-location** - Keep components, types, and tests close
3. **Clear boundaries** - Separate concerns into distinct directories
4. **Scalability** - Structure that grows with the project
5. **Discoverability** - Easy to find what you're looking for

---

## 2. Complete Project Structure

```
samaanshare/
├── .github/
│   └── workflows/
│       ├── ci.yml                    # CI: lint, type-check, test
│       └── deploy.yml                # CD: Vercel deployment
│
├── docs/                             # Project documentation
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── PROJECT_STRUCTURE.md
│   ├── ROADMAP.md
│   └── ENGINEERING_GUIDELINES.md
│
├── prisma/
│   ├── schema.prisma                 # Database schema
│   ├── seed.ts                       # Seed data script
│   └── migrations/                   # Database migrations
│
├── public/
│   ├── images/
│   │   ├── logo.svg
│   │   ├── logo-dark.svg
│   │   └── placeholder.jpg
│   ├── fonts/                        # Self-hosted fonts (if any)
│   └── favicon.ico
│
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (auth)/                   # Auth route group
│   │   │   ├── layout.tsx
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── register/
│   │   │   │   └── page.tsx
│   │   │   ├── forgot-password/
│   │   │   │   └── page.tsx
│   │   │   ├── reset-password/
│   │   │   │   └── page.tsx
│   │   │   └── verify-email/
│   │   │       └── page.tsx
│   │   │
│   │   ├── (main)/                   # Main app route group
│   │   │   ├── layout.tsx            # Header + Footer
│   │   │   ├── page.tsx              # Homepage
│   │   │   │
│   │   │   ├── listings/
│   │   │   │   ├── page.tsx          # Browse all listings
│   │   │   │   ├── loading.tsx
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── page.tsx      # Listing detail
│   │   │   │   │   ├── loading.tsx
│   │   │   │   │   └── not-found.tsx
│   │   │   │   └── new/
│   │   │   │       └── page.tsx      # Create listing
│   │   │   │
│   │   │   ├── search/
│   │   │   │   ├── page.tsx          # Search results
│   │   │   │   └── loading.tsx
│   │   │   │
│   │   │   ├── categories/
│   │   │   │   └── [slug]/
│   │   │   │       └── page.tsx      # Category listings
│   │   │   │
│   │   │   ├── cities/               # Pakistani cities
│   │   │   │   └── [city]/
│   │   │   │       └── page.tsx      # Listings by city
│   │   │   │
│   │   │   ├── u/                    # User profiles
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx
│   │   │   │
│   │   │   └── how-it-works/
│   │   │       └── page.tsx
│   │   │
│   │   ├── dashboard/                # Protected user dashboard
│   │   │   ├── layout.tsx            # Dashboard sidebar layout
│   │   │   ├── page.tsx              # Dashboard overview
│   │   │   │
│   │   │   ├── listings/
│   │   │   │   ├── page.tsx          # My listings
│   │   │   │   └── [id]/
│   │   │   │       └── edit/
│   │   │   │           └── page.tsx  # Edit listing
│   │   │   │
│   │   │   ├── bookings/
│   │   │   │   ├── page.tsx          # My bookings (as renter)
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # Booking detail
│   │   │   │
│   │   │   ├── requests/
│   │   │   │   └── page.tsx          # Booking requests (as owner)
│   │   │   │
│   │   │   ├── messages/
│   │   │   │   ├── page.tsx          # All conversations
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # Conversation view
│   │   │   │
│   │   │   ├── saved/
│   │   │   │   └── page.tsx          # Saved listings
│   │   │   │
│   │   │   ├── earnings/
│   │   │   │   └── page.tsx          # Earnings summary (PKR)
│   │   │   │
│   │   │   └── settings/
│   │   │       └── page.tsx          # Account settings
│   │   │
│   │   ├── admin/                    # Admin dashboard (MVP)
│   │   │   ├── layout.tsx            # Admin layout with sidebar
│   │   │   ├── page.tsx              # Admin overview/stats
│   │   │   │
│   │   │   ├── users/
│   │   │   │   ├── page.tsx          # All users list
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # User detail/edit
│   │   │   │
│   │   │   ├── listings/
│   │   │   │   ├── page.tsx          # All listings
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx      # Listing detail/moderate
│   │   │   │
│   │   │   ├── bookings/
│   │   │   │   └── page.tsx          # All bookings
│   │   │   │
│   │   │   └── reports/
│   │   │       ├── page.tsx          # All reports
│   │   │       └── [id]/
│   │   │           └── page.tsx      # Report detail/resolve
│   │   │
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── [...nextauth]/
│   │   │   │       └── route.ts      # Auth.js handler
│   │   │   │
│   │   │   ├── listings/
│   │   │   │   ├── route.ts          # GET listings
│   │   │   │   └── [id]/
│   │   │   │       ├── route.ts      # GET single listing
│   │   │   │       └── availability/
│   │   │   │           └── route.ts  # GET availability
│   │   │   │
│   │   │   ├── categories/
│   │   │   │   └── route.ts          # GET categories
│   │   │   │
│   │   │   ├── cities/
│   │   │   │   └── route.ts          # GET Pakistani cities
│   │   │   │
│   │   │   ├── search/
│   │   │   │   └── route.ts          # GET search
│   │   │   │
│   │   │   ├── users/
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts      # GET user profile
│   │   │   │
│   │   │   ├── upload/
│   │   │   │   └── route.ts          # POST image upload
│   │   │   │
│   │   │   └── webhooks/
│   │   │       ├── cloudinary/
│   │   │       │   └── route.ts      # Cloudinary webhooks
│   │   │       ├── jazzcash/
│   │   │       │   └── route.ts      # JazzCash webhooks (future)
│   │   │       └── easypaisa/
│   │   │           └── route.ts      # Easypaisa webhooks (future)
│   │   │
│   │   ├── error.tsx                 # Global error boundary
│   │   ├── not-found.tsx             # Global 404
│   │   ├── loading.tsx               # Global loading
│   │   ├── layout.tsx                # Root layout
│   │   └── globals.css               # Global styles
│   │
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── form.tsx
│   │   │   ├── select.tsx
│   │   │   ├── textarea.tsx
│   │   │   ├── toast.tsx
│   │   │   ├── avatar.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── calendar.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   └── ... (other shadcn components)
│   │   │
│   │   ├── layout/                   # Layout components
│   │   │   ├── header.tsx
│   │   │   ├── footer.tsx
│   │   │   ├── mobile-nav.tsx
│   │   │   ├── dashboard-sidebar.tsx
│   │   │   ├── dashboard-header.tsx
│   │   │   ├── admin-sidebar.tsx
│   │   │   └── admin-header.tsx
│   │   │
│   │   ├── auth/                     # Auth components
│   │   │   ├── login-form.tsx
│   │   │   ├── register-form.tsx
│   │   │   ├── forgot-password-form.tsx
│   │   │   ├── social-buttons.tsx
│   │   │   └── auth-guard.tsx
│   │   │
│   │   ├── listings/                 # Listing components
│   │   │   ├── listing-card.tsx
│   │   │   ├── listing-grid.tsx
│   │   │   ├── listing-details.tsx
│   │   │   ├── listing-gallery.tsx
│   │   │   ├── listing-form.tsx
│   │   │   ├── listing-availability.tsx
│   │   │   ├── price-display.tsx     # PKR formatting
│   │   │   ├── condition-badge.tsx
│   │   │   └── listing-actions.tsx
│   │   │
│   │   ├── bookings/                 # Booking components
│   │   │   ├── booking-card.tsx
│   │   │   ├── booking-form.tsx
│   │   │   ├── booking-status-badge.tsx
│   │   │   ├── booking-details.tsx
│   │   │   ├── date-range-picker.tsx
│   │   │   ├── payment-method-select.tsx
│   │   │   ├── payment-instructions.tsx
│   │   │   └── booking-actions.tsx
│   │   │
│   │   ├── payments/                 # Payment components
│   │   │   ├── payment-status.tsx
│   │   │   ├── offline-payment-info.tsx
│   │   │   ├── payment-confirmation.tsx
│   │   │   └── price-breakdown.tsx   # PKR breakdown
│   │   │
│   │   ├── reviews/                  # Review components
│   │   │   ├── review-card.tsx
│   │   │   ├── review-list.tsx
│   │   │   ├── review-form.tsx
│   │   │   ├── star-rating.tsx
│   │   │   └── rating-summary.tsx
│   │   │
│   │   ├── messages/                 # Messaging components
│   │   │   ├── conversation-list.tsx
│   │   │   ├── conversation-item.tsx
│   │   │   ├── message-thread.tsx
│   │   │   ├── message-bubble.tsx
│   │   │   └── message-input.tsx
│   │   │
│   │   ├── search/                   # Search components
│   │   │   ├── search-bar.tsx
│   │   │   ├── search-filters.tsx
│   │   │   ├── filter-sidebar.tsx
│   │   │   ├── city-filter.tsx       # Pakistani cities
│   │   │   ├── sort-select.tsx
│   │   │   └── search-results.tsx
│   │   │
│   │   ├── user/                     # User components
│   │   │   ├── user-avatar.tsx
│   │   │   ├── user-profile-card.tsx
│   │   │   ├── profile-form.tsx
│   │   │   └── verification-badge.tsx
│   │   │
│   │   ├── home/                     # Homepage components
│   │   │   ├── hero-section.tsx
│   │   │   ├── category-grid.tsx
│   │   │   ├── city-selector.tsx     # Pakistani cities
│   │   │   ├── featured-listings.tsx
│   │   │   ├── how-it-works.tsx
│   │   │   └── testimonials.tsx
│   │   │
│   │   ├── admin/                    # Admin components
│   │   │   ├── stats-cards.tsx
│   │   │   ├── users-table.tsx
│   │   │   ├── listings-table.tsx
│   │   │   ├── bookings-table.tsx
│   │   │   ├── reports-table.tsx
│   │   │   ├── user-actions.tsx
│   │   │   ├── listing-actions.tsx
│   │   │   └── report-resolution.tsx
│   │   │
│   │   └── shared/                   # Shared/common components
│   │       ├── image-upload.tsx
│   │       ├── image-gallery.tsx
│   │       ├── empty-state.tsx
│   │       ├── loading-spinner.tsx
│   │       ├── error-message.tsx
│   │       ├── pagination.tsx
│   │       ├── confirm-dialog.tsx
│   │       ├── city-picker.tsx       # Pakistani cities
│   │       ├── share-button.tsx
│   │       ├── report-dialog.tsx
│   │       └── currency-display.tsx  # PKR formatting
│   │
│   ├── actions/                      # Server Actions
│   │   ├── auth.ts
│   │   ├── listings.ts
│   │   ├── bookings.ts
│   │   ├── payments.ts
│   │   ├── reviews.ts
│   │   ├── messages.ts
│   │   ├── saved.ts
│   │   ├── reports.ts
│   │   └── admin.ts                  # Admin actions
│   │
│   ├── lib/                          # Core utilities
│   │   ├── prisma.ts                 # Prisma client instance
│   │   ├── auth.ts                   # Auth.js config
│   │   ├── auth.config.ts            # Auth.js edge config
│   │   │
│   │   ├── payments/                 # Payment abstraction layer
│   │   │   ├── types.ts              # Payment interfaces
│   │   │   ├── factory.ts            # Provider factory
│   │   │   ├── index.ts              # Export
│   │   │   └── providers/
│   │   │       ├── offline.ts        # MVP: Cash, Bank Transfer
│   │   │       ├── jazzcash.ts       # Future: JazzCash
│   │   │       ├── easypaisa.ts      # Future: Easypaisa
│   │   │       ├── safepay.ts        # Future: Safepay
│   │   │       └── stripe.ts         # Future: Stripe
│   │   │
│   │   ├── queries/                  # Database queries
│   │   │   ├── listings.ts
│   │   │   ├── bookings.ts
│   │   │   ├── users.ts
│   │   │   ├── messages.ts
│   │   │   ├── categories.ts
│   │   │   └── admin.ts              # Admin queries
│   │   │
│   │   ├── validations/              # Zod schemas
│   │   │   ├── auth.ts
│   │   │   ├── listing.ts
│   │   │   ├── booking.ts
│   │   │   ├── review.ts
│   │   │   ├── message.ts
│   │   │   ├── report.ts
│   │   │   └── admin.ts
│   │   │
│   │   ├── utils/                    # Utility functions
│   │   │   ├── cn.ts                 # Class name utility
│   │   │   ├── format.ts             # General formatting
│   │   │   ├── currency.ts           # PKR formatting
│   │   │   ├── date.ts               # Date helpers (Asia/Karachi)
│   │   │   ├── price.ts              # Price calculations
│   │   │   └── url.ts                # URL helpers
│   │   │
│   │   ├── cloudinary.ts             # Cloudinary config & utils
│   │   ├── action-utils.ts           # Server action helpers
│   │   └── constants.ts              # App constants
│   │
│   ├── hooks/                        # Custom React hooks
│   │   ├── use-debounce.ts
│   │   ├── use-media-query.ts
│   │   ├── use-local-storage.ts
│   │   ├── use-search-params.ts
│   │   └── use-toast.ts              # Toast notifications
│   │
│   ├── stores/                       # Zustand stores
│   │   ├── auth-store.ts             # Client auth state
│   │   ├── search-store.ts           # Search filters state
│   │   └── ui-store.ts               # UI state (modals, etc)
│   │
│   ├── types/                        # TypeScript types
│   │   ├── index.ts                  # Main type exports
│   │   ├── auth.ts                   # Auth types
│   │   ├── listing.ts                # Listing types
│   │   ├── booking.ts                # Booking types
│   │   ├── payment.ts                # Payment types
│   │   ├── admin.ts                  # Admin types
│   │   └── api.ts                    # API response types
│   │
│   ├── config/                       # Configuration
│   │   ├── site.ts                   # Site metadata
│   │   ├── navigation.ts             # Nav links config
│   │   ├── categories.ts             # Category definitions
│   │   ├── cities.ts                 # Pakistani cities
│   │   └── locale.ts                 # PKR, Asia/Karachi settings
│   │
│   └── middleware.ts                 # Next.js middleware (auth + admin)
│
├── tests/                            # Test files
│   ├── setup.ts                      # Test setup
│   ├── mocks/                        # Test mocks
│   ├── unit/                         # Unit tests
│   ├── integration/                  # Integration tests
│   └── e2e/                          # End-to-end tests (Playwright)
│
├── .env.example                      # Environment variables template
├── .env.local                        # Local environment (git ignored)
├── .eslintrc.json                    # ESLint config
├── .gitignore
├── .prettierrc                       # Prettier config
├── components.json                   # shadcn/ui config
├── next.config.ts                    # Next.js config
├── package.json
├── postcss.config.js                 # PostCSS config
├── tailwind.config.ts                # Tailwind config
├── tsconfig.json                     # TypeScript config
└── README.md
```

---

## 3. Key Directory Descriptions

### `/src/app/admin` - Admin Dashboard (MVP)

Protected admin routes for platform management:

```
admin/
├── layout.tsx         # Admin sidebar + header
├── page.tsx           # Overview with stats (users, listings, GMV in PKR)
├── users/             # User management
├── listings/          # Listing moderation
├── bookings/          # Booking overview
└── reports/           # Reports & moderation
```

### `/src/lib/payments` - Payment Abstraction Layer

Provider-agnostic payment system:

```
payments/
├── types.ts           # IPaymentProvider interface
├── factory.ts         # createPaymentProvider()
├── index.ts           # Public exports
└── providers/
    ├── offline.ts     # MVP: Cash, Bank Transfer
    ├── jazzcash.ts    # Phase 2
    ├── easypaisa.ts   # Phase 2
    ├── safepay.ts     # Phase 2
    └── stripe.ts      # Phase 4 (International)
```

### `/src/config/locale.ts` - Pakistan Localization

```typescript
// src/config/locale.ts
export const LOCALE_CONFIG = {
  currency: { code: 'PKR', symbol: 'Rs.' },
  timezone: 'Asia/Karachi',
  cities: ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', ...],
};
```

---

## 4. File Naming Conventions

### General Rules

| Type | Convention | Example |
|------|------------|---------|
| Components | kebab-case | `listing-card.tsx` |
| Hooks | kebab-case with `use-` prefix | `use-debounce.ts` |
| Utilities | kebab-case | `currency.ts` |
| Types | kebab-case | `listing.ts` |
| Constants | kebab-case | `constants.ts` |
| Tests | same as source + `.test` | `listing-card.test.tsx` |

### Next.js Special Files

| File | Purpose |
|------|---------|
| `page.tsx` | Route page component |
| `layout.tsx` | Shared layout wrapper |
| `loading.tsx` | Loading UI (Suspense) |
| `error.tsx` | Error boundary |
| `not-found.tsx` | 404 page |
| `route.ts` | API route handler |

---

## 5. Import Conventions

### Path Aliases

```typescript
// tsconfig.json paths
{
  "paths": {
    "@/*": ["./src/*"]
  }
}

// Usage
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/auth';
import { formatPKR } from '@/lib/utils/currency';
import { useDebounce } from '@/hooks/use-debounce';
import { PAKISTANI_CITIES } from '@/config/cities';
```

### Import Order

```typescript
// 1. React/Next
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 2. External libraries
import { z } from 'zod';
import { format } from 'date-fns';

// 3. Internal - absolute imports
import { Button } from '@/components/ui/button';
import { formatPKR } from '@/lib/utils/currency';
import type { Listing } from '@/types';

// 4. Relative imports (same feature)
import { ListingImage } from './listing-image';
```

---

## 6. Environment Files

```bash
# .env.example - Template (committed)
DATABASE_URL=
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_APP_TIMEZONE=Asia/Karachi
NEXT_PUBLIC_DEFAULT_CURRENCY=PKR
ADMIN_EMAIL=

# Future payment gateways
JAZZCASH_MERCHANT_ID=
JAZZCASH_PASSWORD=
EASYPAISA_STORE_ID=
EASYPAISA_HASH_KEY=
SAFEPAY_API_KEY=
SAFEPAY_SECRET_KEY=
```

---

*Document End*
