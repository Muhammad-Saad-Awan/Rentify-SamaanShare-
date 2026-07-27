# SamaanShare - API Design Document

**Version:** 1.0 - Architecture Locked
**Last Updated:** July 2026
**Target Market:** Pakistan (PKR, Asia/Karachi)
**Status:** Final - Ready for Implementation

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

### 2.1 Authentication Actions

```typescript
// src/actions/auth.ts

/**
 * Register a new user with email/password
 */
export async function registerUser(data: {
  name: string;
  email: string;
  password: string;
  city?: string;
}): Promise<ActionResult<User>>

/**
 * Request password reset email
 */
export async function requestPasswordReset(data: {
  email: string;
}): Promise<ActionResult<void>>

/**
 * Reset password with token
 */
export async function resetPassword(data: {
  token: string;
  password: string;
}): Promise<ActionResult<void>>

/**
 * Update user profile
 */
export async function updateProfile(data: {
  name?: string;
  bio?: string;
  city?: string;  // Pakistani city
  phone?: string; // +92 format
}): Promise<ActionResult<User>>

/**
 * Update profile image
 */
export async function updateProfileImage(
  formData: FormData // Contains image file
): Promise<ActionResult<{ imageUrl: string }>>
```

### 2.2 Listing Actions

```typescript
// src/actions/listings.ts

/**
 * Create a new listing
 */
export async function createListing(
  formData: FormData
): Promise<ActionResult<Listing>>

// Input schema:
const createListingSchema = z.object({
  title: z.string().min(5).max(100),
  description: z.string().min(20).max(5000),
  categoryId: z.string().cuid(),
  subcategoryId: z.string().cuid().optional(),
  condition: z.enum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR']),
  pricePerDay: z.number().positive().int(), // PKR, whole numbers
  pricePerWeek: z.number().positive().int().optional(),
  pricePerMonth: z.number().positive().int().optional(),
  securityDeposit: z.number().nonnegative().int(), // PKR
  city: z.string().min(1), // Pakistani city
  area: z.string().optional(),
  // Images handled separately via FormData (up to 10)
});

/**
 * Update an existing listing
 */
export async function updateListing(
  listingId: string,
  formData: FormData
): Promise<ActionResult<Listing>>

/**
 * Delete a listing (soft delete - sets status to DELETED)
 */
export async function deleteListing(
  listingId: string
): Promise<ActionResult<void>>

/**
 * Update listing status (pause/activate)
 */
export async function updateListingStatus(
  listingId: string,
  status: 'ACTIVE' | 'PAUSED'
): Promise<ActionResult<Listing>>

/**
 * Add images to listing (up to 10 total)
 */
export async function addListingImages(
  listingId: string,
  formData: FormData
): Promise<ActionResult<ListingImage[]>>

/**
 * Remove image from listing
 */
export async function removeListingImage(
  imageId: string
): Promise<ActionResult<void>>

/**
 * Reorder listing images
 */
export async function reorderListingImages(
  listingId: string,
  imageIds: string[] // Ordered array
): Promise<ActionResult<void>>

/**
 * Update listing availability (block dates)
 */
export async function updateListingAvailability(
  listingId: string,
  data: {
    blockedDates: Date[];
    unblockedDates: Date[];
  }
): Promise<ActionResult<void>>
```

### 2.3 Booking Actions

**Booking Lifecycle:** PENDING → APPROVED → PAYMENT_PENDING → ACTIVE → COMPLETED → REVIEWED
**Additional Statuses:** DECLINED, CANCELLED, EXPIRED

```typescript
// src/actions/bookings.ts

/**
 * Create a booking request (status: PENDING)
 */
export async function createBookingRequest(data: {
  listingId: string;
  startDate: Date;
  endDate: Date;
  paymentMethod: 'CASH' | 'BANK_TRANSFER';
  notes?: string;  // Renter can add notes to request
}): Promise<ActionResult<{ booking: Booking; payment: Payment }>>

/**
 * Accept a booking request (owner only)
 * Status: PENDING → APPROVED → PAYMENT_PENDING
 */
export async function acceptBooking(
  bookingId: string,
  pickupInstructions: string
): Promise<ActionResult<Booking>>

/**
 * Decline a booking request (owner only)
 * Status: PENDING → DECLINED
 */
export async function declineBooking(
  bookingId: string,
  reason?: string
): Promise<ActionResult<Booking>>

/**
 * Cancel a booking (renter or owner)
 * Status: Any → CANCELLED
 */
export async function cancelBooking(
  bookingId: string,
  reason?: string
): Promise<ActionResult<Booking>>

/**
 * Mark booking as active (pickup completed, payment confirmed)
 * Status: PAYMENT_PENDING → ACTIVE
 */
export async function startBooking(
  bookingId: string
): Promise<ActionResult<Booking>>

/**
 * Mark booking as completed (item returned)
 * Status: ACTIVE → COMPLETED
 */
export async function completeBooking(
  bookingId: string
): Promise<ActionResult<Booking>>

/**
 * Mark booking as reviewed (both parties reviewed)
 * Status: COMPLETED → REVIEWED
 */
export async function markBookingReviewed(
  bookingId: string
): Promise<ActionResult<Booking>>
```

### 2.4 Payment Actions

```typescript
// src/actions/payments.ts

/**
 * Confirm offline payment received (owner only)
 */
export async function confirmPaymentReceived(
  paymentId: string
): Promise<ActionResult<Payment>>

/**
 * Mark security deposit as returned
 */
export async function markDepositReturned(
  paymentId: string
): Promise<ActionResult<Payment>>

/**
 * Get payment instructions for offline payment
 */
export async function getPaymentInstructions(
  paymentId: string
): Promise<ActionResult<{
  method: PaymentMethod;
  amount: number;      // In PKR
  deposit: number;     // In PKR
  instructions: string;
  ownerBankDetails?: string; // For bank transfer
}>>
```

### 2.5 Review Actions

```typescript
// src/actions/reviews.ts

/**
 * Create a review for a completed booking
 */
export async function createReview(data: {
  bookingId: string;
  rating: number; // 1-5
  comment?: string;
}): Promise<ActionResult<Review>>

/**
 * Report a review for moderation
 */
export async function reportReview(
  reviewId: string,
  reason: string
): Promise<ActionResult<void>>
```

### 2.6 Report Actions (MVP)

```typescript
// src/actions/reports.ts

/**
 * Report a listing for moderation
 */
export async function reportListing(data: {
  listingId: string;
  reason: ReportReason;
  description?: string;
}): Promise<ActionResult<Report>>

/**
 * Report a user for moderation
 */
export async function reportUser(data: {
  userId: string;
  reason: ReportReason;
  description?: string;
}): Promise<ActionResult<Report>>
```

### 2.7 Message Actions (Phase 2 - Future)

**Note:** Real-time messaging is deferred to Phase 2. MVP uses booking notes only.

```typescript
// src/actions/messages.ts (Phase 2)

/**
 * Send a message (creates conversation if needed)
 */
export async function sendMessage(data: {
  listingId: string;
  recipientId: string;
  content: string;
}): Promise<ActionResult<Message>>

/**
 * Mark messages as read
 */
export async function markMessagesAsRead(
  conversationId: string
): Promise<ActionResult<void>>
```

### 2.7 Saved Listings Actions

```typescript
// src/actions/saved.ts

/**
 * Save a listing to wishlist
 */
export async function saveListing(
  listingId: string
): Promise<ActionResult<SavedListing>>

/**
 * Remove listing from wishlist
 */
export async function unsaveListing(
  listingId: string
): Promise<ActionResult<void>>
```

### 2.8 Report Actions

```typescript
// src/actions/reports.ts

/**
 * Submit a report (user, listing, or review)
 */
export async function submitReport(data: {
  type: 'USER' | 'LISTING' | 'REVIEW';
  targetId: string;
  reason: string;
  description?: string;
}): Promise<ActionResult<Report>>
```

### 2.9 Admin Actions

```typescript
// src/actions/admin.ts

/**
 * Get platform statistics (admin only)
 */
export async function getAdminStats(): Promise<ActionResult<{
  totalUsers: number;
  activeListings: number;
  totalBookings: number;
  completedBookings: number;
  totalGMV: number; // In PKR
  pendingReports: number;
  usersByCity: Record<string, number>;
}>>

/**
 * Update user status (admin only)
 */
export async function updateUserStatus(
  userId: string,
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED'
): Promise<ActionResult<User>>

/**
 * Update user role (admin only)
 */
export async function updateUserRole(
  userId: string,
  role: 'USER' | 'ADMIN'
): Promise<ActionResult<User>>

/**
 * Remove a listing (admin only)
 */
export async function adminRemoveListing(
  listingId: string,
  reason: string
): Promise<ActionResult<void>>

/**
 * Resolve a report (admin only)
 */
export async function resolveReport(
  reportId: string,
  data: {
    status: 'RESOLVED' | 'DISMISSED';
    resolution: string;
    action?: 'SUSPEND_USER' | 'REMOVE_LISTING' | 'REMOVE_REVIEW' | 'NONE';
  }
): Promise<ActionResult<Report>>

/**
 * Get all users with filters (admin only)
 */
export async function getAdminUsers(params: {
  search?: string;
  status?: UserStatus;
  role?: UserRole;
  city?: string;
  page?: number;
  limit?: number;
}): Promise<ActionResult<{ users: User[]; total: number }>>

/**
 * Get all listings with filters (admin only)
 */
export async function getAdminListings(params: {
  search?: string;
  status?: ListingStatus;
  category?: string;
  city?: string;
  page?: number;
  limit?: number;
}): Promise<ActionResult<{ listings: Listing[]; total: number }>>

/**
 * Get all bookings with filters (admin only)
 */
export async function getAdminBookings(params: {
  status?: BookingStatus;
  page?: number;
  limit?: number;
}): Promise<ActionResult<{ bookings: Booking[]; total: number }>>

/**
 * Get all reports with filters (admin only)
 */
export async function getAdminReports(params: {
  status?: ReportStatus;
  type?: ReportType;
  page?: number;
  limit?: number;
}): Promise<ActionResult<{ reports: Report[]; total: number }>>
```

---

## 3. API Routes (REST)

### 3.1 Authentication Routes

Handled by Auth.js:

```
GET/POST  /api/auth/[...nextauth]  - Auth.js handler
```

### 3.2 Listing Routes

```
GET  /api/listings
     Query: ?category=&city=&minPrice=&maxPrice=&page=&limit=&sort=
     Response: { listings: Listing[], total: number, page: number }

GET  /api/listings/:id
     Response: { listing: ListingWithDetails }

GET  /api/listings/:id/availability
     Query: ?month=&year=
     Response: { availableDates: Date[], unavailableDates: Date[] }
```

### 3.3 Category Routes

```
GET  /api/categories
     Response: { categories: CategoryWithSubcategories[] }
```

### 3.4 Search Routes

```
GET  /api/search
     Query: ?q=&category=&city=&minPrice=&maxPrice=&condition=&page=&limit=
     Response: { results: Listing[], total: number, facets: Facets }
```

### 3.5 User Routes

```
GET  /api/users/:id
     Response: { user: PublicUserProfile }

GET  /api/users/:id/listings
     Response: { listings: Listing[] }

GET  /api/users/:id/reviews
     Response: { reviews: Review[], stats: ReviewStats }
```

### 3.6 Cities Routes

```
GET  /api/cities
     Response: { cities: PakistaniCity[] }
     // Returns: Karachi, Lahore, Islamabad, Rawalpindi, etc.
```

### 3.7 Future Webhook Routes

```
POST /api/webhooks/jazzcash   - JazzCash payment events (Phase 2)
POST /api/webhooks/easypaisa  - Easypaisa payment events (Phase 2)
POST /api/webhooks/safepay    - Safepay payment events (Phase 2)
POST /api/webhooks/cloudinary - Image processing events
```

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

### Implementation (Phase 2 - Upstash Redis)

```typescript
// src/lib/rate-limit.ts (conceptual)
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

export const rateLimiter = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, '1 m'),
});
```

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
