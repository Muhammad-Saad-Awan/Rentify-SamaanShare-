# SamaanShare - API Design Document

**Last Updated:** 24 September 2026
**Target Market:** Pakistan (PKR, Asia/Karachi)
**Status:** Describes what is built, not what was planned.

> This began as a design document written before implementation, and by September 2026 it had
> drifted far enough to be misleading — it specified a REST API that was never built and message
> actions that do not exist, while omitting claims, handover, identity verification, moderation,
> notifications, preferences and security entirely. Sections 2 and 3 have been rebuilt from
> `src/actions/`. The remaining sections are design rationale and still hold; where one describes
> something as future work, that is still true.

---

## 1. API Strategy

SamaanShare uses a **hybrid approach**:

1. **Server Actions** - Primary method for mutations (create, update, delete)
2. **API Routes** - For REST endpoints needed by external clients or webhooks
3. **Server Components** - For data fetching (no explicit API needed)

### Why Server Actions for Mutations?

- Type-safe end-to-end
- Progressive enhancement (works without JS)
- Automatic revalidation
- Simpler than REST for Next.js apps
- Built-in CSRF protection

---

## 2. Server Actions

Every mutation in this application is a Server Action. There are **53 of them across
25 modules**, and the table below is generated from `src/actions/` rather than
maintained by hand — an earlier version of this section listed message actions that were never
built and omitted seven feature areas that were.

**Read the module, not this table, for behaviour.** What each action does, refuses and why is
documented at the point the decision lives; repeating it here is how the two drift apart. This is
an index.

Three conventions hold across all of them, and they are the ones worth knowing before reading any
single action:

- **Actions return `ActionResult`; pages redirect.** `requireUser()` redirects and belongs in a
  page. An action invoked from a button returns a result the caller can render, so an optimistic
  update can roll back and explain itself — `getActiveUser()` is the non-redirecting equivalent.
  Both verify against the database, because `status` in the JWT can be up to 24h stale.
- **Input is re-validated server-side.** A Server Action is a public HTTP endpoint; the client's
  Zod check can simply be skipped.
- **Authority is derived, never accepted.** Which side of a booking you are on, whether you own a
  listing, whether you may moderate — all computed from the session against the database, never
  taken from the payload.

### Authentication and account

| Module | Actions |
|---|---|
| `auth.ts` | `registerUser()` |
| `password-reset.ts` | `requestPasswordReset()`, `resetPassword()` |
| `email-verification.ts` | `sendEmailVerification()`, `verifyEmail()` |
| `security.ts` | `changePassword()`, `setPassword()`, `disconnectAccount()` |
| `profile.ts` | `updateProfile()`, `updateProfileImage()`, `removeProfileImage()` |
| `preferences.ts` | `updatePreferences()` |

### Listings

| Module | Actions |
|---|---|
| `listings.ts` | `createListing()` |
| `listing-management.ts` | `updateListing()`, `updateListingStatus()`, `deleteListing()` |
| `availability.ts` | `toggleListingAvailability()` |
| `uploads.ts` | `createImageUploadSignature()`, `createAvatarUploadSignature()`, `deletePendingImage()` |
| `listing-views.ts` | `recordListingView()` |
| `saved-listings.ts` | `saveListing()`, `unsaveListing()` |

### Bookings and payment

| Module | Actions |
|---|---|
| `bookings.ts` | `createBookingRequest()`, `acceptBooking()`, `declineBooking()`, `updateBookingInstructions()` |
| `booking-lifecycle.ts` | `startBooking()`, `completeBooking()`, `cancelBooking()` |
| `payments.ts` | `selectPaymentMethod()`, `confirmPaymentReceived()`, `markDepositReturned()` |
| `handover.ts` | `confirmHandover()` |

### Reviews, reports and claims

| Module | Actions |
|---|---|
| `reviews.ts` | `createReview()` |
| `reports.ts` | `reportListing()`, `reportUser()`, `reportReview()` |
| `claims.ts` | `fileDamageClaim()`, `respondToDamageClaim()`, `withdrawDamageClaim()` |
| `claim-resolution.ts` | `resolveDamageClaim()` |
| `notifications.ts` | `markNotificationsRead()` |

### Administration

| Module | Actions |
|---|---|
| `admin-users.ts` | `suspendUser()`, `banUser()`, `reinstateUser()`, `changeUserRole()` |
| `admin-listings.ts` | `adminRemoveListing()`, `adminRestoreListing()`, `adminEditListing()` |
| `moderation.ts` | `resolveReport()`, `dismissReport()` |
| `identity-verification.ts` | `setIdentityVerified()` |

---

## 3. HTTP Routes

**There is one, and it is not ours:** `/api/auth/[...nextauth]`, which Auth.js requires.

An earlier version of this document specified a REST surface — listing routes, category routes,
search routes, user routes, cities routes, webhook routes. None of it was built, and none of it is
planned, because nothing needs it:

- **Reads** happen in Server Components, which query the database directly. A REST endpoint in
  front of that would be a second way to ask the same question, with its own serialization,
  caching and authorization to keep in step.
- **Writes** are Server Actions, which are already HTTP endpoints with CSRF protection and
  type-safe arguments.
- **No external client exists.** A mobile app is Phase 3, and payment webhooks arrive with the
  payment providers in Phase 2. Both will need routes; neither needs them yet, and an unused
  public API is attack surface with no user.

`robots.ts` excludes `/api/` from crawling for the same reason: nothing under it is a page.

---

## 4. Response Types

### Standard Response Format

```typescript
// Success response
type SuccessResponse<T> = {
  success: true;
  data: T;
};

// Error response
type ErrorResponse = {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, string[]>; // Validation errors
  };
};

type ActionResult<T> = SuccessResponse<T> | ErrorResponse;
```

### Error Codes

```typescript
enum ErrorCode {
  // Client errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT', // e.g., dates already booked

  // Server errors (5xx)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Payment errors
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_CANCELLED = 'PAYMENT_CANCELLED',
}
```

---

## 5. Data Fetching Functions (Server Components)

### 5.1 Listing Queries

```typescript
// src/lib/queries/listings.ts

/**
 * Get listings with filters (for browse/search pages)
 */
export async function getListings(params: {
  category?: string;
  subcategory?: string;
  city?: string; // Pakistani city
  minPrice?: number; // PKR
  maxPrice?: number; // PKR
  condition?: ItemCondition[];
  page?: number;
  limit?: number;
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'rating';
}): Promise<{ listings: Listing[]; total: number }>

/**
 * Get single listing with full details
 */
export async function getListingById(
  id: string
): Promise<ListingWithDetails | null>

/**
 * Get listings by owner
 */
export async function getListingsByOwner(
  ownerId: string
): Promise<Listing[]>

/**
 * Get featured/popular listings (homepage)
 */
export async function getFeaturedListings(
  limit?: number
): Promise<Listing[]>

/**
 * Get listings by city
 */
export async function getListingsByCity(
  city: string,
  limit?: number
): Promise<Listing[]>
```

### 5.2 Booking Queries

```typescript
// src/lib/queries/bookings.ts

/**
 * Get user's bookings (as renter)
 */
export async function getRenterBookings(
  userId: string,
  status?: BookingStatus[]
): Promise<BookingWithListing[]>

/**
 * Get owner's booking requests
 */
export async function getOwnerBookings(
  userId: string,
  status?: BookingStatus[]
): Promise<BookingWithDetails[]>

/**
 * Get single booking with payment info
 */
export async function getBookingById(
  id: string,
  userId: string // For authorization
): Promise<BookingWithPayment | null>
```

### 5.3 User Queries

```typescript
// src/lib/queries/users.ts

/**
 * Get public user profile
 */
export async function getUserProfile(
  userId: string
): Promise<PublicProfile | null>

/**
 * Get user's review stats
 */
export async function getUserReviewStats(
  userId: string
): Promise<{
  averageRating: number;
  totalReviews: number;
  asOwner: { average: number; count: number };
  asRenter: { average: number; count: number };
}>
```

### 5.4 Message Queries

```typescript
// src/lib/queries/messages.ts

/**
 * Get user's conversations
 */
export async function getConversations(
  userId: string
): Promise<ConversationPreview[]>

/**
 * Get messages in a conversation
 */
export async function getMessages(
  conversationId: string,
  userId: string // For authorization
): Promise<Message[]>

/**
 * Get unread message count
 */
export async function getUnreadCount(
  userId: string
): Promise<number>
```

---

## 6. Validation Schemas (Zod)

```typescript
// src/lib/validations/listing.ts

import { z } from 'zod';
import { PAKISTANI_CITIES } from '@/config/locale';

export const createListingSchema = z.object({
  title: z
    .string()
    .min(5, 'Title must be at least 5 characters')
    .max(100, 'Title must be less than 100 characters'),

  description: z
    .string()
    .min(20, 'Description must be at least 20 characters')
    .max(5000, 'Description must be less than 5000 characters'),

  categoryId: z.string().cuid('Invalid category'),

  subcategoryId: z.string().cuid('Invalid subcategory').optional(),

  condition: z.enum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR'], {
    errorMap: () => ({ message: 'Please select a condition' }),
  }),

  pricePerDay: z
    .number()
    .positive('Price must be greater than 0')
    .int('Price must be a whole number (PKR)')
    .max(10000000, 'Price too high'),

  pricePerWeek: z
    .number()
    .positive('Price must be greater than 0')
    .int()
    .optional(),

  pricePerMonth: z
    .number()
    .positive('Price must be greater than 0')
    .int()
    .optional(),

  securityDeposit: z
    .number()
    .nonnegative('Deposit cannot be negative')
    .int('Deposit must be a whole number (PKR)'),

  city: z
    .string()
    .refine(
      (val) => PAKISTANI_CITIES.includes(val),
      'Please select a valid city'
    ),

  area: z.string().optional(),
});

export const updateListingSchema = createListingSchema.partial();

// src/lib/validations/booking.ts

export const createBookingSchema = z.object({
  listingId: z.string().cuid(),
  startDate: z.date().min(new Date(), 'Start date must be in the future'),
  endDate: z.date(),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER']),
  notes: z.string().max(500).optional(),
}).refine(
  (data) => data.endDate > data.startDate,
  { message: 'End date must be after start date', path: ['endDate'] }
);

// src/lib/validations/review.ts

export const createReviewSchema = z.object({
  bookingId: z.string().cuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

// src/lib/validations/message.ts

export const sendMessageSchema = z.object({
  listingId: z.string().cuid(),
  recipientId: z.string().cuid(),
  content: z
    .string()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message too long'),
});

// src/lib/validations/report.ts

export const submitReportSchema = z.object({
  type: z.enum(['USER', 'LISTING', 'REVIEW']),
  targetId: z.string().cuid(),
  reason: z.string().min(1, 'Please select a reason'),
  description: z.string().max(1000).optional(),
});
```

---

## 7. Type Definitions

```typescript
// src/types/index.ts

// Extended listing type with relations
export type ListingWithDetails = Listing & {
  owner: Pick<User, 'id' | 'name' | 'image' | 'isVerified' | 'city'>;
  category: Category;
  subcategory: Subcategory | null;
  images: ListingImage[];
  _count: {
    bookings: number;
  };
  averageRating?: number;
};

// Booking with listing details
export type BookingWithListing = Booking & {
  listing: Pick<Listing, 'id' | 'title' | 'images' | 'city'>;
};

// Booking with full details including payment
export type BookingWithPayment = Booking & {
  listing: ListingWithDetails;
  renter: Pick<User, 'id' | 'name' | 'image'>;
  owner: Pick<User, 'id' | 'name' | 'image'>;
  payment: Payment | null;
};

// Conversation preview for list
export type ConversationPreview = Conversation & {
  listing: Pick<Listing, 'id' | 'title' | 'images'>;
  otherParticipant: Pick<User, 'id' | 'name' | 'image'>;
  lastMessage: Pick<Message, 'content' | 'createdAt'> | null;
  unreadCount: number;
};

// Public user profile
export type PublicProfile = Pick<
  User,
  'id' | 'name' | 'image' | 'bio' | 'city' | 'isVerified' | 'createdAt'
> & {
  listingsCount: number;
  reviewStats: {
    average: number;
    count: number;
  };
};

// Admin types
export type AdminUser = User & {
  _count: {
    listings: number;
    bookingsAsRenter: number;
    bookingsAsOwner: number;
  };
};

export type AdminReport = Report & {
  reporter: Pick<User, 'id' | 'name' | 'email'>;
  resolver?: Pick<User, 'id' | 'name'>;
};
```

---

## 8. Payment Service Interface

```typescript
// src/lib/payments/types.ts

export interface PaymentRequest {
  bookingId: string;
  amount: number;           // In PKR
  securityDeposit: number;  // In PKR
  currency: 'PKR';
  method: PaymentMethod;
  metadata?: Record<string, unknown>;
}

export interface PaymentResult {
  success: boolean;
  paymentId: string;
  status: PaymentStatus;
  provider: PaymentProviderType;
  transactionRef?: string;
  error?: string;
  redirectUrl?: string;     // For hosted checkout (future)
  instructions?: string;    // For offline payments
}

export interface IPaymentProvider {
  readonly providerType: PaymentProviderType;
  readonly supportedMethods: PaymentMethod[];

  // Core methods
  initiatePayment(request: PaymentRequest): Promise<PaymentResult>;
  confirmPayment(paymentId: string, confirmedBy: string): Promise<PaymentResult>;
  cancelPayment(paymentId: string): Promise<PaymentResult>;
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;

  // Refunds
  initiateRefund(paymentId: string, amount: number): Promise<PaymentResult>;

  // Webhooks (future providers)
  handleWebhook?(payload: unknown): Promise<void>;
}
```

---

## 9. Rate Limiting Strategy

### Limits by Endpoint Type

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Public read (listings, search) | 100 req | 1 minute |
| Authenticated read | 200 req | 1 minute |
| Mutations (create, update) | 20 req | 1 minute |
| Authentication attempts | 5 req | 15 minutes |
| Image uploads | 10 req | 1 minute |
| Messages | 30 req | 1 minute |
| Admin endpoints | 100 req | 1 minute |

The table above is the original plan. What is **built** is narrower and lives in
`src/lib/rate-limit.ts`: a fixed-window counter held in one process's memory, applied per action
to the endpoints that can be abused — registration, login, listing creation, bookings, claims,
reviews, uploads, verification sends. Each call site sets its own limit; there is no global
per-request throttle.

### Measured behaviour, 24 September 2026

Two production instances, one client, registration limited to 5 per IP per hour:

| | Result |
|---|---|
| Instance A, attempts 1-5 | allowed |
| Instance A, attempts 6-7 | refused, with the message shown to the user |
| Instance B, 5 further attempts | **all allowed** |
| Instance A after a restart | allowed again immediately |

So the effective limit is `limit x instances`, and it resets whenever a process does. Within a
single instance the limiter is correct. The window is also anchored to the first request for a
key rather than to a wall clock, which lets roughly `2 x limit - 1` requests through in the
moment around a boundary — nine, for a limit of five.

This is a deliberate trade against operating a second piece of infrastructure, and it is written
down in the module. The upgrade is a shared store (`@upstash/ratelimit` on Vercel KV is the usual
choice) and touches only that file, because every caller sees the same `checkRateLimit`
signature. **Until then, do not rely on any of these limits at their configured number while more
than one instance is serving.**

---

## 10. Caching Strategy

### Server Component Caching

```typescript
// Automatic with fetch
const data = await fetch(url, {
  next: { revalidate: 60 } // Revalidate every 60 seconds
});

// Manual cache tags
import { unstable_cache } from 'next/cache';

export const getCategories = unstable_cache(
  async () => {
    return prisma.category.findMany({
      include: { subcategories: true }
    });
  },
  ['categories'],
  { revalidate: 3600 } // 1 hour
);
```

### Cache Invalidation

```typescript
// After mutations
import { revalidatePath, revalidateTag } from 'next/cache';

// Revalidate specific paths
revalidatePath('/listings');
revalidatePath(`/listings/${listingId}`);

// Revalidate by tag
revalidateTag('categories');
```

---

## 11. Error Handling

### Server Action Error Handling

```typescript
// src/lib/action-utils.ts

export async function safeAction<T>(
  fn: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: formatZodErrors(error),
        },
      };
    }

    if (error instanceof AuthError) {
      return {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Please sign in to continue',
        },
      };
    }

    if (error instanceof ForbiddenError) {
      return {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have permission to perform this action',
        },
      };
    }

    console.error('Action error:', error);
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong',
      },
    };
  }
}

// Admin action wrapper
export async function adminAction<T>(
  fn: () => Promise<T>
): Promise<ActionResult<T>> {
  const session = await auth();

  if (!session?.user || session.user.role !== 'ADMIN') {
    return {
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required',
      },
    };
  }

  return safeAction(fn);
}
```

---

*Document End*
