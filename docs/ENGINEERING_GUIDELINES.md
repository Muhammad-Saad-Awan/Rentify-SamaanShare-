# SamaanShare - Engineering Guidelines

**Version:** 1.0 - Architecture Locked
**Last Updated:** July 2026
**Status:** Final - Ready for Implementation

This document establishes coding standards, best practices, and conventions for the SamaanShare codebase.

---

## Table of Contents

1. [Folder Structure Conventions](#1-folder-structure-conventions)
2. [Naming Conventions](#2-naming-conventions)
3. [TypeScript Best Practices](#3-typescript-best-practices)
4. [Component Architecture](#4-component-architecture)
5. [Server Actions vs Route Handlers](#5-server-actions-vs-route-handlers)
6. [API Response Format](#6-api-response-format)
7. [Error Handling](#7-error-handling)
8. [Validation Standards](#8-validation-standards)
9. [Security Checklist](#9-security-checklist)
10. [Performance Checklist](#10-performance-checklist)
11. [Git Commit Conventions](#11-git-commit-conventions)
12. [Code Review Checklist](#12-code-review-checklist)
13. [Environment Variables](#13-environment-variables)
14. [Documentation Standards](#14-documentation-standards)

---

## 1. Folder Structure Conventions

### App Router Structure

```
src/app/
├── (auth)/                    # Auth route group (no layout nesting)
│   ├── login/page.tsx
│   ├── register/page.tsx
│   └── layout.tsx
├── (main)/                    # Main app route group
│   ├── listings/
│   │   ├── [id]/
│   │   │   └── page.tsx       # Dynamic route
│   │   ├── new/page.tsx
│   │   └── page.tsx
│   └── layout.tsx
├── admin/                     # Admin routes (separate layout)
│   ├── users/page.tsx
│   └── layout.tsx
├── api/                       # API routes (webhooks only)
│   └── webhooks/
└── layout.tsx                 # Root layout
```

### Feature-Based Organization

```
src/
├── components/
│   ├── ui/                    # shadcn/ui primitives
│   ├── forms/                 # Form components
│   ├── listings/              # Feature-specific components
│   └── shared/                # Shared across features
├── lib/
│   ├── actions/               # Server actions by domain
│   ├── db/                    # Database utilities
│   ├── payments/              # Payment abstraction
│   └── utils/                 # Pure utility functions
├── hooks/                     # Custom React hooks
├── stores/                    # Zustand stores
└── types/                     # TypeScript type definitions
```

### File Naming Rules

| Type | Convention | Example |
|------|------------|---------|
| React Components | PascalCase | `ListingCard.tsx` |
| Pages | lowercase | `page.tsx` |
| Layouts | lowercase | `layout.tsx` |
| Server Actions | camelCase | `createListing.ts` |
| Utilities | camelCase | `formatCurrency.ts` |
| Types | PascalCase | `Listing.types.ts` |
| Hooks | camelCase with `use` | `useListings.ts` |
| Stores | camelCase with `Store` | `authStore.ts` |
| Constants | SCREAMING_SNAKE | `constants.ts` |

---

## 2. Naming Conventions

### Variables and Functions

```typescript
// Variables: camelCase
const userProfile = await getUser(id);
const isAuthenticated = session !== null;
const hasPermission = user.role === 'ADMIN';

// Functions: camelCase, verb-first
function getUserById(id: string) { }
function createListing(data: ListingInput) { }
function validateBookingDates(start: Date, end: Date) { }

// Boolean variables: is/has/can/should prefix
const isLoading = true;
const hasError = false;
const canEdit = user.id === listing.ownerId;
const shouldRefetch = staleTime > 0;
```

### Constants

```typescript
// File: src/lib/constants.ts

// All caps with underscores
export const MAX_IMAGES_PER_LISTING = 10;
export const DEFAULT_CURRENCY = 'PKR';
export const DEFAULT_TIMEZONE = 'Asia/Karachi';

// Object constants: SCREAMING_SNAKE for export, camelCase for keys
// Booking Lifecycle: PENDING → APPROVED → PAYMENT_PENDING → ACTIVE → COMPLETED → REVIEWED
export const BOOKING_STATUS = {
  pending: 'PENDING',
  approved: 'APPROVED',
  paymentPending: 'PAYMENT_PENDING',
  active: 'ACTIVE',
  completed: 'COMPLETED',
  reviewed: 'REVIEWED',
  declined: 'DECLINED',
  cancelled: 'CANCELLED',
  expired: 'EXPIRED',
} as const;

export const PAKISTANI_CITIES = [
  'Karachi',
  'Lahore',
  'Islamabad',
  'Rawalpindi',
] as const;
```

### Types and Interfaces

```typescript
// Types: PascalCase, suffix with descriptive name
type UserId = string;
type ListingStatus = 'ACTIVE' | 'PAUSED' | 'DELETED';

// Interfaces: PascalCase, no I prefix
interface User {
  id: string;
  email: string;
  name: string;
}

// Props interfaces: ComponentName + Props
interface ListingCardProps {
  listing: Listing;
  onSelect?: (id: string) => void;
}

// Input types for mutations
interface CreateListingInput {
  title: string;
  description: string;
  pricePerDay: number;
}

// Response types
interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: ActionError;
}
```

### Database Models (Prisma)

```prisma
// Models: PascalCase, singular
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  createdAt DateTime @default(now()) @map("created_at")

  // Relations: camelCase
  listings  Listing[]
  bookings  Booking[]

  @@map("users") // Table name: lowercase, plural
}

// Enums: PascalCase name, SCREAMING_SNAKE values
enum BookingStatus {
  PENDING
  CONFIRMED
  ACTIVE
  COMPLETED
  CANCELLED
}
```

---

## 3. TypeScript Best Practices

### Strict Mode Requirements

```typescript
// tsconfig.json - these must be enabled
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### Type Inference vs Explicit Types

```typescript
// Let TypeScript infer when obvious
const count = 0;                           // inferred as number
const items = ['a', 'b'];                  // inferred as string[]
const user = await prisma.user.findUnique(); // inferred from Prisma

// Explicit types for function signatures
function calculateTotal(
  pricePerDay: number,
  days: number,
  deposit: number
): number {
  return pricePerDay * days + deposit;
}

// Explicit types for complex objects
const config: PaymentConfig = {
  provider: 'OFFLINE',
  methods: ['CASH', 'BANK_TRANSFER'],
};
```

### Avoid `any` - Use Proper Types

```typescript
// BAD: Using any
function processData(data: any) { }

// GOOD: Use unknown for truly unknown data
function processData(data: unknown) {
  if (isValidPayload(data)) {
    // data is now typed
  }
}

// GOOD: Use generics for flexible typing
function processData<T extends Record<string, unknown>>(data: T) { }

// For external API responses, create proper types
interface ExternalApiResponse {
  status: string;
  data: {
    id: string;
    [key: string]: unknown;  // Allow additional properties
  };
}
```

### Discriminated Unions for State

```typescript
// Define clear states with discriminated unions
type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

// Usage
function renderContent(state: AsyncState<Listing[]>) {
  switch (state.status) {
    case 'idle':
      return null;
    case 'loading':
      return <Skeleton />;
    case 'success':
      return <ListingGrid listings={state.data} />;
    case 'error':
      return <ErrorMessage message={state.error} />;
  }
}
```

### Zod for Runtime Validation

```typescript
// Define schema once, derive types
import { z } from 'zod';

export const createListingSchema = z.object({
  title: z.string().min(5).max(100),
  description: z.string().min(20).max(2000),
  pricePerDay: z.number().int().positive().max(10000000), // PKR
  securityDeposit: z.number().int().nonnegative(),
  city: z.enum(['Karachi', 'Lahore', 'Islamabad']),
  categoryId: z.string().cuid(),
  images: z.array(z.string().url()).min(1).max(10),
});

// Derive TypeScript type from schema
export type CreateListingInput = z.infer<typeof createListingSchema>;
```

---

## 4. Component Architecture

### Component File Structure

```typescript
// src/components/listings/ListingCard.tsx

// 1. Imports (external, then internal, then types)
import { memo } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { formatPKR } from '@/lib/utils/currency';

import type { Listing } from '@/types';

// 2. Types/Interfaces
interface ListingCardProps {
  listing: Listing;
  priority?: boolean;
}

// 3. Component
function ListingCard({ listing, priority = false }: ListingCardProps) {
  // 3a. Hooks first
  // 3b. Derived state
  // 3c. Handlers
  // 3d. Early returns
  // 3e. Render

  return (
    <Card>
      {/* ... */}
    </Card>
  );
}

// 4. Export (named for components)
export { ListingCard };

// 5. Memoize if needed (large lists, expensive renders)
export const MemoizedListingCard = memo(ListingCard);
```

### Server vs Client Components

```typescript
// DEFAULT: Server Components (no directive needed)
// src/app/listings/page.tsx
import { prisma } from '@/lib/db';
import { ListingGrid } from '@/components/listings/ListingGrid';

export default async function ListingsPage() {
  const listings = await prisma.listing.findMany({
    where: { status: 'ACTIVE' },
  });

  return <ListingGrid listings={listings} />;
}

// CLIENT: Only when needed
// src/components/listings/ListingFilters.tsx
'use client';

import { useState } from 'react';

export function ListingFilters({ onFilterChange }: Props) {
  const [filters, setFilters] = useState<Filters>({});
  // Interactive UI logic
}
```

### When to Use Client Components

Use `'use client'` only when you need:
- React hooks (`useState`, `useEffect`, `useContext`, etc.)
- Browser-only APIs (`window`, `localStorage`, etc.)
- Event handlers (onClick, onChange, etc.)
- Third-party libraries that use client features

```typescript
// GOOD: Server component fetches, passes to client
// page.tsx (Server)
async function Page() {
  const data = await fetchData();
  return <InteractiveList initialData={data} />;
}

// InteractiveList.tsx (Client)
'use client';
function InteractiveList({ initialData }: Props) {
  const [items, setItems] = useState(initialData);
  // Client-side interactions
}
```

### Composition Patterns

```typescript
// Use composition over prop drilling
// BAD: Deeply nested props
<Dashboard
  user={user}
  listings={listings}
  bookings={bookings}
  onListingClick={handleClick}
/>

// GOOD: Composition
<Dashboard>
  <DashboardHeader user={user} />
  <DashboardContent>
    <ListingsSection listings={listings} />
    <BookingsSection bookings={bookings} />
  </DashboardContent>
</Dashboard>

// Use render props or children for flexible composition
interface CardProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
}
```

---

## 5. Server Actions vs Route Handlers

### Decision Matrix

| Use Case | Solution | Reason |
|----------|----------|--------|
| Form submissions | Server Action | Progressive enhancement, type-safe |
| Data mutations | Server Action | Direct database access, no API layer |
| Fetching data (RSC) | Direct DB query | Fastest, no round-trip |
| Fetching data (Client) | Route Handler or Server Action | Depends on caching needs |
| Webhooks | Route Handler | External services need HTTP endpoints |
| File uploads | Route Handler | Multipart form handling |
| Third-party integrations | Route Handler | Predictable HTTP interface |

### Server Action Pattern

```typescript
// src/lib/actions/listings.ts
'use server';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createListingSchema } from '@/lib/validations/listing';
import { revalidatePath } from 'next/cache';

import type { ActionResult } from '@/types';
import type { Listing } from '@prisma/client';

export async function createListing(
  input: unknown
): Promise<ActionResult<Listing>> {
  try {
    // 1. Authentication
    const session = await auth();
    if (!session?.user) {
      return {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Please sign in' },
      };
    }

    // 2. Validation
    const validated = createListingSchema.safeParse(input);
    if (!validated.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: validated.error.flatten(),
        },
      };
    }

    // 3. Authorization (if needed)
    // ...

    // 4. Business logic
    const listing = await prisma.listing.create({
      data: {
        ...validated.data,
        ownerId: session.user.id,
      },
    });

    // 5. Revalidation
    revalidatePath('/listings');
    revalidatePath(`/users/${session.user.id}/listings`);

    // 6. Return success
    return { success: true, data: listing };

  } catch (error) {
    console.error('createListing error:', error);
    return {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to create listing' },
    };
  }
}
```

### Route Handler Pattern (Webhooks)

```typescript
// src/app/api/webhooks/payment/route.ts
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { verifyWebhookSignature } from '@/lib/payments/utils';
import { handlePaymentWebhook } from '@/lib/payments/webhooks';

export async function POST(request: Request) {
  try {
    // 1. Verify webhook signature
    const headersList = await headers();
    const signature = headersList.get('x-webhook-signature');
    const body = await request.text();

    if (!verifyWebhookSignature(body, signature)) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // 2. Parse and handle
    const payload = JSON.parse(body);
    await handlePaymentWebhook(payload);

    // 3. Return success
    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
```

---

## 6. API Response Format

### Standard Response Structure

```typescript
// Success response
interface SuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

// Error response
interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

// Union type
type ActionResult<T> = SuccessResponse<T> | ErrorResponse;

// Error codes
type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';
```

### Example Responses

```typescript
// Success with data
{
  success: true,
  data: {
    id: "clx123...",
    title: "Canon DSLR Camera",
    pricePerDay: 2500
  }
}

// Success with pagination
{
  success: true,
  data: [...],
  meta: {
    page: 1,
    limit: 20,
    total: 156,
    hasMore: true
  }
}

// Validation error
{
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "Invalid input",
    details: {
      fieldErrors: {
        title: ["Title must be at least 5 characters"],
        pricePerDay: ["Price must be a positive number"]
      }
    }
  }
}

// Not found
{
  success: false,
  error: {
    code: "NOT_FOUND",
    message: "Listing not found"
  }
}
```

---

## 7. Error Handling

### Error Boundary Pattern

```typescript
// src/app/error.tsx
'use client';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to error reporting service
    console.error('Error boundary caught:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground mt-2">
        {error.message || 'An unexpected error occurred'}
      </p>
      <Button onClick={reset} className="mt-4">
        Try again
      </Button>
    </div>
  );
}
```

### Server Action Error Handling

```typescript
// Wrapper for consistent error handling
export async function safeAction<T>(
  fn: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    // Log error (integrate with Sentry in production)
    console.error('Action error:', error);

    // Handle known error types
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return {
          success: false,
          error: { code: 'CONFLICT', message: 'Record already exists' },
        };
      }
      if (error.code === 'P2025') {
        return {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Record not found' },
        };
      }
    }

    // Generic error
    return {
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    };
  }
}
```

### Client-Side Error Handling

```typescript
// Using with React Query / SWR
function useCreateListing() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function create(data: CreateListingInput) {
    setError(null);

    startTransition(async () => {
      const result = await createListing(data);

      if (!result.success) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }

      toast.success('Listing created!');
      router.push(`/listings/${result.data.id}`);
    });
  }

  return { create, isPending, error };
}
```

---

## 8. Validation Standards

### Shared Validation Schemas

```typescript
// src/lib/validations/listing.ts
import { z } from 'zod';
import { PAKISTANI_CITIES, MAX_IMAGES_PER_LISTING } from '@/lib/constants';

// Reusable field schemas
const pkrAmount = z.number().int().nonnegative().max(100000000);

const pakistaniCity = z.enum(PAKISTANI_CITIES);

const imageUrl = z.string().url().refine(
  (url) => url.includes('cloudinary.com'),
  'Images must be uploaded to our image service'
);

// Listing schemas
export const createListingSchema = z.object({
  title: z
    .string()
    .min(5, 'Title must be at least 5 characters')
    .max(100, 'Title must be less than 100 characters'),
  description: z
    .string()
    .min(20, 'Description must be at least 20 characters')
    .max(2000, 'Description must be less than 2000 characters'),
  categoryId: z.string().cuid('Invalid category'),
  city: pakistaniCity,
  pricePerDay: pkrAmount.positive('Daily price is required'),
  pricePerWeek: pkrAmount.optional(),
  pricePerMonth: pkrAmount.optional(),
  securityDeposit: pkrAmount,
  images: z
    .array(imageUrl)
    .min(1, 'At least one image is required')
    .max(MAX_IMAGES_PER_LISTING, `Maximum ${MAX_IMAGES_PER_LISTING} images`),
  condition: z.enum(['NEW', 'LIKE_NEW', 'GOOD', 'FAIR']),
});

export const updateListingSchema = createListingSchema.partial();

// Export types
export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
```

### Form Validation with React Hook Form

```typescript
// src/components/listings/CreateListingForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { createListingSchema, type CreateListingInput } from '@/lib/validations/listing';
import { createListing } from '@/lib/actions/listings';

export function CreateListingForm() {
  const form = useForm<CreateListingInput>({
    resolver: zodResolver(createListingSchema),
    defaultValues: {
      title: '',
      description: '',
      city: 'Karachi',
      pricePerDay: 0,
      securityDeposit: 0,
      images: [],
      condition: 'GOOD',
    },
  });

  async function onSubmit(data: CreateListingInput) {
    const result = await createListing(data);

    if (!result.success) {
      // Handle field-level errors
      if (result.error.details?.fieldErrors) {
        Object.entries(result.error.details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof CreateListingInput, {
            message: messages[0],
          });
        });
      }
      return;
    }

    // Success handling
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* Form fields */}
      </form>
    </Form>
  );
}
```

---

## 9. Security Checklist

### Authentication & Authorization

- [ ] All mutations require authentication
- [ ] Admin routes check for ADMIN role
- [ ] Users can only modify their own resources
- [ ] Session tokens are HTTP-only cookies
- [ ] Implement CSRF protection

```typescript
// Authorization check pattern
export async function updateListing(id: string, data: unknown) {
  const session = await auth();
  if (!session?.user) {
    return { success: false, error: { code: 'UNAUTHORIZED' } };
  }

  const listing = await prisma.listing.findUnique({ where: { id } });
  if (!listing) {
    return { success: false, error: { code: 'NOT_FOUND' } };
  }

  // Authorization: owner or admin
  if (listing.ownerId !== session.user.id && session.user.role !== 'ADMIN') {
    return { success: false, error: { code: 'FORBIDDEN' } };
  }

  // Proceed with update...
}
```

### Input Validation & Sanitization

- [ ] Validate ALL user input with Zod schemas
- [ ] Sanitize HTML content (if allowing rich text)
- [ ] Validate file uploads (type, size, dimensions)
- [ ] Limit array lengths in schemas

```typescript
// Image validation
const imageSchema = z.object({
  url: z.string().url(),
  size: z.number().max(5 * 1024 * 1024), // 5MB max
  type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});
```

### SQL Injection Prevention

```typescript
// ALWAYS use Prisma's parameterized queries
// GOOD
const user = await prisma.user.findUnique({
  where: { email: userInput },
});

// BAD - Never do this
const user = await prisma.$queryRaw`
  SELECT * FROM users WHERE email = ${userInput}
`;
// Use Prisma.sql for raw queries if absolutely needed
```

### XSS Prevention

```typescript
// React automatically escapes content
// But be careful with dangerouslySetInnerHTML
// NEVER do this with user content:
<div dangerouslySetInnerHTML={{ __html: userContent }} />

// If you must render HTML, sanitize first:
import DOMPurify from 'isomorphic-dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }} />
```

### Rate Limiting

```typescript
// Implement for sensitive endpoints
// src/lib/rateLimit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),
});

export async function checkRateLimit(identifier: string) {
  const { success, limit, reset, remaining } = await ratelimit.limit(identifier);
  return { success, limit, reset, remaining };
}
```

---

## 10. Performance Checklist

### Database Queries

- [ ] Add indexes for frequently queried fields
- [ ] Use `select` to fetch only needed fields
- [ ] Use `include` sparingly (N+1 queries)
- [ ] Paginate large result sets
- [ ] Use database transactions for related writes

```typescript
// GOOD: Select only needed fields
const listings = await prisma.listing.findMany({
  where: { status: 'ACTIVE' },
  select: {
    id: true,
    title: true,
    pricePerDay: true,
    images: { take: 1 }, // Only first image for cards
    owner: {
      select: { name: true, image: true },
    },
  },
  take: 20,
  skip: page * 20,
});

// GOOD: Use transactions
await prisma.$transaction([
  prisma.booking.update({ where: { id }, data: { status: 'CANCELLED' } }),
  prisma.listing.update({ where: { id: listingId }, data: { /* unlock dates */ } }),
]);
```

### Image Optimization

```typescript
// Use Next.js Image component
import Image from 'next/image';

<Image
  src={listing.images[0]}
  alt={listing.title}
  width={400}
  height={300}
  sizes="(max-width: 768px) 100vw, 400px"
  loading="lazy" // Default for images not above fold
  placeholder="blur"
  blurDataURL={listing.blurHash}
/>

// Cloudinary transformations
function getOptimizedImageUrl(url: string, width: number) {
  return url.replace('/upload/', `/upload/w_${width},f_auto,q_auto/`);
}
```

### Caching Strategy

```typescript
// Route segment caching
export const revalidate = 3600; // Revalidate every hour

// Dynamic rendering when needed
export const dynamic = 'force-dynamic';

// Revalidate on mutation
import { revalidatePath, revalidateTag } from 'next/cache';

async function updateListing(id: string, data: unknown) {
  // ... update logic

  revalidatePath(`/listings/${id}`);
  revalidatePath('/listings');
  revalidateTag('listings');
}

// Tag-based caching
const listings = await prisma.listing.findMany({
  // ...
});
unstable_cache(
  async () => listings,
  ['listings'],
  { tags: ['listings'], revalidate: 3600 }
);
```

### Bundle Size

- [ ] Use dynamic imports for heavy components
- [ ] Avoid importing entire libraries
- [ ] Analyze bundle with `@next/bundle-analyzer`

```typescript
// Dynamic imports for heavy components
const MapComponent = dynamic(() => import('@/components/Map'), {
  loading: () => <MapSkeleton />,
  ssr: false, // If using browser-only APIs
});

// Import only what you need
import { format } from 'date-fns'; // GOOD
import * as dateFns from 'date-fns'; // BAD
```

---

## 11. Git Commit Conventions

### Commit Message Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Code style (formatting, semicolons) |
| `refactor` | Code change that neither fixes bug nor adds feature |
| `perf` | Performance improvement |
| `test` | Adding/updating tests |
| `chore` | Build process, dependencies, tooling |

### Scopes

```
auth, listings, bookings, payments, admin, ui, db, api
```

### Examples

```bash
# Feature
feat(listings): add image gallery with zoom support

# Bug fix
fix(bookings): prevent double-booking on same dates

# With body
feat(payments): add offline payment confirmation flow

Implements the owner payment confirmation workflow for Cash
and Bank Transfer payment methods.

- Add PaymentConfirmation model
- Create confirmPayment server action
- Add confirmation UI to owner dashboard

Closes #123

# Breaking change
feat(api)!: change listing response structure

BREAKING CHANGE: listing.price is now listing.pricePerDay
```

### Branch Naming

```
feature/short-description
fix/issue-number-description
chore/task-description

# Examples
feature/image-upload
fix/123-booking-dates
chore/upgrade-dependencies
```

---

## 12. Code Review Checklist

### General

- [ ] Code follows project conventions
- [ ] No commented-out code
- [ ] No console.log statements (use proper logging)
- [ ] No hardcoded values (use constants/env vars)
- [ ] TypeScript strict mode compliance

### Functionality

- [ ] Code works as intended
- [ ] Edge cases handled
- [ ] Error states handled gracefully
- [ ] Loading states implemented
- [ ] Proper null/undefined checks

### Security

- [ ] Input validation present
- [ ] Authentication checks where needed
- [ ] Authorization checks where needed
- [ ] No sensitive data in logs
- [ ] No secrets in code

### Performance

- [ ] No unnecessary re-renders
- [ ] Database queries optimized
- [ ] Images properly sized
- [ ] No memory leaks (cleanup in useEffect)

### Testing

- [ ] Unit tests for utilities
- [ ] Integration tests for actions
- [ ] Manual testing completed
- [ ] Edge cases tested

---

## 13. Environment Variables

### Naming Convention

```bash
# Public (exposed to browser): NEXT_PUBLIC_ prefix
NEXT_PUBLIC_APP_URL=https://samaanshare.pk
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=samaanshare

# Server-only (no prefix)
DATABASE_URL=postgresql://...
AUTH_SECRET=...
CLOUDINARY_API_SECRET=...
```

### Required Variables

```bash
# .env.example

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database
DATABASE_URL=

# Auth
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Cloudinary
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Future: Payments
# JAZZCASH_MERCHANT_ID=
# EASYPAISA_API_KEY=
```

### Validation

```typescript
// src/lib/env.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string(),
  CLOUDINARY_API_KEY: z.string(),
  CLOUDINARY_API_SECRET: z.string(),
});

export const env = envSchema.parse(process.env);
```

---

## 14. Documentation Standards

### Code Comments

```typescript
// Use comments to explain "why", not "what"

// BAD: Obvious from code
// Loop through users
for (const user of users) { }

// GOOD: Explains business logic
// Skip unverified users - they can't complete bookings per ToS
const eligibleUsers = users.filter(u => u.emailVerified);

// GOOD: Explains non-obvious behavior
// Using PKR with no decimals as Pakistani currency doesn't use fractional amounts
const formattedPrice = new Intl.NumberFormat('en-PK', {
  style: 'currency',
  currency: 'PKR',
  minimumFractionDigits: 0,
}).format(amount);
```

### JSDoc for Public APIs

```typescript
/**
 * Creates a new listing in the marketplace.
 *
 * @param input - The listing data
 * @returns ActionResult with created listing or error
 *
 * @example
 * const result = await createListing({
 *   title: "Canon EOS R5",
 *   pricePerDay: 5000,
 *   city: "Karachi",
 *   // ...
 * });
 */
export async function createListing(
  input: CreateListingInput
): Promise<ActionResult<Listing>> {
  // ...
}
```

### README for Each Major Directory

```markdown
# /src/lib/payments

Payment abstraction layer for SamaanShare.

## Structure

- `providers/` - Payment provider implementations
- `types.ts` - Shared types and interfaces
- `factory.ts` - Provider factory function

## Adding a New Provider

1. Create provider in `providers/`
2. Implement `IPaymentProvider` interface
3. Register in `factory.ts`

## Usage

See ARCHITECTURE.md for detailed documentation.
```

---

## Quick Reference

### Import Order

```typescript
// 1. React/Next.js
import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

// 2. External libraries
import { z } from 'zod';
import { format } from 'date-fns';

// 3. Internal absolute imports
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/db';
import { formatPKR } from '@/lib/utils/currency';

// 4. Relative imports
import { ListingCard } from './ListingCard';

// 5. Types (always last)
import type { Listing } from '@/types';
```

### Common Patterns

```typescript
// Conditional rendering
{isLoading ? <Skeleton /> : <Content />}
{items.length > 0 && <List items={items} />}
{error && <ErrorMessage error={error} />}

// Optional chaining
const city = user?.profile?.city ?? 'Unknown';

// Type guards
function isListing(item: unknown): item is Listing {
  return typeof item === 'object' && item !== null && 'id' in item;
}
```

---

*Document End*
