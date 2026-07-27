# SamaanShare - Technical Architecture

**Version:** 1.0 - Architecture Locked
**Last Updated:** July 2026
**Target Market:** Pakistan
**Status:** Final - Ready for Implementation

---

## 1. Architecture Overview

SamaanShare follows a **modern serverless architecture** optimized for Next.js 15 on Vercel, utilizing the App Router for full-stack capabilities.

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Market | Pakistan | PKR currency, Asia/Karachi timezone |
| Framework | Next.js 15 | App Router, RSC, Server Actions |
| Database | PostgreSQL | Reliable, scalable, Prisma support |
| ORM | Prisma | Type-safe, migrations, serverless-ready |
| Auth | Auth.js v5 | Native Next.js, multiple providers |
| Images | Cloudinary | CDN, optimization, 10 images/listing |
| Payments | Abstraction Layer | Provider-agnostic for future integrations |
| Hosting | Vercel | Optimal Next.js performance |

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                │
│    │   Desktop    │    │    Mobile    │    │   Tablet     │                │
│    │   Browser    │    │   Browser    │    │   Browser    │                │
│    └──────────────┘    └──────────────┘    └──────────────┘                │
│              │                 │                  │                         │
│              └─────────────────┼──────────────────┘                         │
│                                │                                            │
│                        HTTPS / WebSocket                                    │
│                                │                                            │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────────┐
│                         EDGE / CDN LAYER                                    │
├────────────────────────────────┼────────────────────────────────────────────┤
│                                │                                            │
│    ┌───────────────────────────┴───────────────────────────┐               │
│    │                  Vercel Edge Network                   │               │
│    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │               │
│    │  │   Static    │  │    Edge     │  │   Image     │   │               │
│    │  │   Assets    │  │  Functions  │  │   Optim.    │   │               │
│    │  └─────────────┘  └─────────────┘  └─────────────┘   │               │
│    └───────────────────────────────────────────────────────┘               │
│                                                                             │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────────┐
│                       APPLICATION LAYER                                     │
├────────────────────────────────┼────────────────────────────────────────────┤
│                                │                                            │
│    ┌───────────────────────────┴───────────────────────────┐               │
│    │              Next.js 15 Application                    │               │
│    │                                                        │               │
│    │  ┌────────────────────────────────────────────────┐   │               │
│    │  │              App Router (RSC)                   │   │               │
│    │  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐   │   │               │
│    │  │  │  Pages   │ │ Layouts  │ │   Loading/   │   │   │               │
│    │  │  │  (RSC)   │ │  (RSC)   │ │    Error     │   │   │               │
│    │  │  └──────────┘ └──────────┘ └──────────────┘   │   │               │
│    │  └────────────────────────────────────────────────┘   │               │
│    │                                                        │               │
│    │  ┌────────────────────────────────────────────────┐   │               │
│    │  │              Server Actions                     │   │               │
│    │  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐   │   │               │
│    │  │  │ Listings │ │ Bookings │ │   Payments   │   │   │               │
│    │  │  │ Actions  │ │ Actions  │ │   Actions    │   │   │               │
│    │  │  └──────────┘ └──────────┘ └──────────────┘   │   │               │
│    │  └────────────────────────────────────────────────┘   │               │
│    │                                                        │               │
│    │  ┌────────────────────────────────────────────────┐   │               │
│    │  │              Admin Dashboard                    │   │               │
│    │  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐   │   │               │
│    │  │  │  Users   │ │ Listings │ │  Moderation  │   │   │               │
│    │  │  └──────────┘ └──────────┘ └──────────────┘   │   │               │
│    │  └────────────────────────────────────────────────┘   │               │
│    │                                                        │               │
│    └────────────────────────────────────────────────────────┘               │
│                                                                             │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────────┐
│                       SERVICE LAYER                                         │
├────────────────────────────────┼────────────────────────────────────────────┤
│                                │                                            │
│    ┌───────────────────────────┴───────────────────────────┐               │
│    │              Payment Abstraction Layer                 │               │
│    │  ┌──────────────────────────────────────────────┐     │               │
│    │  │            PaymentService Interface           │     │               │
│    │  └──────────────────────────────────────────────┘     │               │
│    │         │              │              │                │               │
│    │  ┌──────┴──────┐ ┌─────┴─────┐ ┌─────┴─────┐         │               │
│    │  │   Offline   │ │  JazzCash │ │  Safepay  │  ...    │               │
│    │  │  (MVP)      │ │ (Phase 2) │ │ (Phase 2) │         │               │
│    │  └─────────────┘ └───────────┘ └───────────┘         │               │
│    └───────────────────────────────────────────────────────┘               │
│                                                                             │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────────┐
│                         DATA LAYER                                          │
├────────────────────────────────┼────────────────────────────────────────────┤
│                                │                                            │
│    ┌───────────────────────────┴───────────────────────────┐               │
│    │                   Prisma ORM                           │               │
│    │         (Type-safe database client)                    │               │
│    └───────────────────────────┬───────────────────────────┘               │
│                                │                                            │
│         ┌──────────────────────┼──────────────────────┐                    │
│         │                      │                      │                    │
│         ▼                      ▼                      ▼                    │
│    ┌──────────┐         ┌──────────┐          ┌──────────┐                │
│    │PostgreSQL│         │Cloudinary│          │  Redis   │                │
│    │(Primary) │         │ (Images) │          │ (Future) │                │
│    └──────────┘         └──────────┘          └──────────┘                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack Details

### Frontend

| Technology | Purpose | Justification |
|------------|---------|---------------|
| **React 19** | UI Library | Industry standard, excellent ecosystem |
| **Next.js 15** | Framework | App Router, RSC, API routes, optimal DX |
| **TypeScript** | Language | Type safety, better tooling, fewer bugs |
| **Tailwind CSS** | Styling | Utility-first, rapid development, small bundle |
| **shadcn/ui** | Components | Accessible, customizable, not a dependency |
| **React Hook Form** | Forms | Performance, validation integration |
| **Zod** | Validation | TypeScript-first, runtime validation |
| **TanStack Query** | Data Fetching | Caching, background updates, optimistic UI |
| **Zustand** | State Management | Simple, lightweight, TypeScript-friendly |
| **Lucide React** | Icons | Consistent, tree-shakeable icons |
| **date-fns** | Date Handling | Lightweight, timezone support (Asia/Karachi) |

### Backend

| Technology | Purpose | Justification |
|------------|---------|---------------|
| **Next.js API Routes** | REST APIs | Unified codebase, serverless |
| **Server Actions** | Mutations | Type-safe, progressive enhancement |
| **Auth.js v5** | Authentication | Next.js native, multiple providers |
| **Prisma** | ORM | Type-safe queries, migrations, studio |
| **Zod** | API Validation | Shared schemas frontend/backend |

### Database & Storage

| Technology | Purpose | Justification |
|------------|---------|---------------|
| **PostgreSQL** | Primary Database | Reliable, scalable, Vercel Postgres option |
| **Cloudinary** | Image Storage | CDN, transformations, 10 images/listing |
| **Vercel Blob** | File Storage (backup) | Simple integration, if needed |

### Infrastructure

| Technology | Purpose | Justification |
|------------|---------|---------------|
| **Vercel** | Hosting | Optimal for Next.js, edge network |
| **GitHub** | Version Control | Industry standard, Actions for CI/CD |
| **Vercel Postgres** | Database Hosting | Managed, integrated billing |

### Future Integrations (Phase 2+)

| Technology | Purpose | Phase |
|------------|---------|-------|
| **JazzCash** | Mobile Wallet Payments | Phase 2 |
| **Easypaisa** | Mobile Wallet Payments | Phase 2 |
| **Safepay** | Card/Bank Payments | Phase 2 |
| **PayFast** | Payment Gateway | Phase 2 |
| **Stripe** | International Payments | Phase 4 |
| **Resend** | Transactional Email | Phase 2 |
| **Upstash Redis** | Caching/Rate Limiting | Phase 2 |
| **Sentry** | Error Monitoring | Phase 2 |

---

## 3. Payment Architecture

### Design Principle: Provider-Agnostic Abstraction

The payment system uses an **abstraction layer** that decouples the booking logic from specific payment providers. This allows adding new Pakistani payment gateways without modifying core booking code.

### Payment Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PAYMENT ABSTRACTION LAYER                             │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌───────────────────┐
                              │   PaymentService  │
                              │    (Interface)    │
                              └─────────┬─────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        │                               │                               │
        ▼                               ▼                               ▼
┌───────────────┐               ┌───────────────┐               ┌───────────────┐
│    Offline    │               │   JazzCash    │               │    Safepay    │
│   Provider    │               │   Provider    │               │   Provider    │
│    (MVP)      │               │  (Phase 2)    │               │  (Phase 2)    │
├───────────────┤               ├───────────────┤               ├───────────────┤
│ • Cash        │               │ • Mobile Pay  │               │ • Card Pay    │
│ • Bank Xfer   │               │ • QR Code     │               │ • Bank Link   │
└───────────────┘               └───────────────┘               └───────────────┘
        │                               │                               │
        ▼                               ▼                               ▼
┌───────────────┐               ┌───────────────┐               ┌───────────────┐
│  Easypaisa    │               │   PayFast     │               │    Stripe     │
│   Provider    │               │   Provider    │               │   Provider    │
│  (Phase 2)    │               │  (Phase 2)    │               │  (Phase 4)    │
├───────────────┤               ├───────────────┤               ├───────────────┤
│ • Mobile Pay  │               │ • Gateway     │               │ • Intl Cards  │
│ • QR Code     │               │ • Checkout    │               │ • Intl Banks  │
└───────────────┘               └───────────────┘               └───────────────┘
```

### Payment Service Interface

```typescript
// src/lib/payments/types.ts

export enum PaymentProviderType {
  OFFLINE = 'OFFLINE',           // MVP: Cash, Bank Transfer
  JAZZCASH = 'JAZZCASH',         // Phase 2
  EASYPAISA = 'EASYPAISA',       // Phase 2
  SAFEPAY = 'SAFEPAY',           // Phase 2
  PAYFAST = 'PAYFAST',           // Phase 2
  STRIPE = 'STRIPE',             // Phase 4 (International)
}

export enum PaymentMethod {
  // Offline (MVP)
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',

  // Future
  JAZZCASH_WALLET = 'JAZZCASH_WALLET',
  EASYPAISA_WALLET = 'EASYPAISA_WALLET',
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}

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
}

export interface IPaymentProvider {
  // Core methods
  initiatePayment(request: PaymentRequest): Promise<PaymentResult>;
  confirmPayment(paymentId: string): Promise<PaymentResult>;
  cancelPayment(paymentId: string): Promise<PaymentResult>;

  // Refunds
  initiateRefund(paymentId: string, amount: number): Promise<PaymentResult>;

  // Status
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;

  // Webhooks (future)
  handleWebhook?(payload: unknown): Promise<void>;
}
```

### MVP: Offline Payment Provider

```typescript
// src/lib/payments/providers/offline.ts

export class OfflinePaymentProvider implements IPaymentProvider {
  async initiatePayment(request: PaymentRequest): Promise<PaymentResult> {
    // Create payment record with AWAITING_CONFIRMATION status
    // Return instructions for Cash or Bank Transfer
  }

  async confirmPayment(paymentId: string): Promise<PaymentResult> {
    // Owner confirms receipt of payment
    // Update payment status to COMPLETED
  }

  async cancelPayment(paymentId: string): Promise<PaymentResult> {
    // Mark payment as cancelled
  }

  async initiateRefund(paymentId: string, amount: number): Promise<PaymentResult> {
    // For offline, mark as "refund pending" - manual process
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    // Return current status from database
  }
}
```

### Payment Factory Pattern

```typescript
// src/lib/payments/factory.ts

export function createPaymentProvider(
  provider: PaymentProviderType
): IPaymentProvider {
  switch (provider) {
    case PaymentProviderType.OFFLINE:
      return new OfflinePaymentProvider();
    case PaymentProviderType.JAZZCASH:
      return new JazzCashProvider();  // Phase 2
    case PaymentProviderType.EASYPAISA:
      return new EasypaisaProvider(); // Phase 2
    case PaymentProviderType.SAFEPAY:
      return new SafepayProvider();   // Phase 2
    case PaymentProviderType.STRIPE:
      return new StripeProvider();    // Phase 4
    default:
      throw new Error(`Unknown payment provider: ${provider}`);
  }
}
```

### Booking-Payment Integration

```typescript
// Payment is decoupled from booking logic
async function createBooking(data: BookingInput) {
  // 1. Create booking in PENDING state
  const booking = await prisma.booking.create({ ... });

  // 2. Create payment through abstraction layer
  const provider = createPaymentProvider(data.paymentProvider);
  const payment = await provider.initiatePayment({
    bookingId: booking.id,
    amount: calculateTotal(data),
    securityDeposit: data.securityDeposit,
    currency: 'PKR',
    method: data.paymentMethod,
  });

  // 3. Link payment to booking
  await prisma.booking.update({
    where: { id: booking.id },
    data: { paymentId: payment.paymentId }
  });

  return { booking, payment };
}
```

---

## 4. Authentication Architecture

### Auth.js v5 Configuration

```
┌─────────────────────────────────────────────────────────────┐
│                    Authentication Flow                       │
└─────────────────────────────────────────────────────────────┘

User Action                    System Response
    │                               │
    ▼                               │
┌─────────┐                         │
│ Sign In │                         │
│ Request │                         │
└────┬────┘                         │
     │                              │
     ▼                              │
┌─────────────────────┐             │
│ Provider Selection  │             │
│ ┌─────┐ ┌────────┐ │             │
│ │Email│ │ Google │ │             │
│ └─────┘ └────────┘ │             │
└─────────┬──────────┘             │
          │                         │
          ▼                         │
┌─────────────────────┐    ┌───────┴───────┐
│  Auth.js Callback   │───▶│ Verify/Create │
│   /api/auth/[...]   │    │    User       │
└─────────────────────┘    └───────┬───────┘
                                   │
                                   ▼
                           ┌───────────────┐
                           │   Generate    │
                           │ JWT Session   │
                           └───────┬───────┘
                                   │
                                   ▼
                           ┌───────────────┐
                           │  Set Cookie   │
                           │  (httpOnly)   │
                           └───────┬───────┘
                                   │
                                   ▼
                           ┌───────────────┐
                           │   Redirect    │
                           │  to Dashboard │
                           └───────────────┘
```

### Supported Providers (MVP)

1. **Credentials (Email/Password)**
   - Email verification required
   - Password hashing with bcrypt
   - Password reset flow

2. **Google OAuth**
   - One-click sign-in
   - Profile data import
   - Account linking

### Role-Based Access Control

```typescript
enum UserRole {
  USER = 'USER',     // Regular users
  ADMIN = 'ADMIN',   // Platform administrators
}

// Middleware protection
const routeAccess = {
  public: ['/', '/listings', '/listings/[id]', '/search'],
  authenticated: ['/dashboard', '/messages', '/bookings'],
  ownerOnly: ['/listings/[id]/edit', '/dashboard/listings'],
  adminOnly: ['/admin', '/admin/*'],
};
```

---

## 5. Admin Dashboard Architecture

### Admin Features (MVP)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ADMIN DASHBOARD                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │      Users      │  │    Listings     │  │    Bookings     │             │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤             │
│  │ • View all      │  │ • View all      │  │ • View all      │             │
│  │ • Search/filter │  │ • Search/filter │  │ • Filter status │             │
│  │ • View details  │  │ • View details  │  │ • View details  │             │
│  │ • Edit profile  │  │ • Edit listing  │  │ • Resolve issues│             │
│  │ • Suspend/ban   │  │ • Approve/reject│  │ • Cancel booking│             │
│  │ • Role change   │  │ • Remove listing│  │                 │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                                  │
│  │    Reports      │  │   Analytics     │                                  │
│  ├─────────────────┤  ├─────────────────┤                                  │
│  │ • User reports  │  │ • Total users   │                                  │
│  │ • Listing flags │  │ • Total listings│                                  │
│  │ • Review flags  │  │ • Total bookings│                                  │
│  │ • Take action   │  │ • GMV in PKR    │                                  │
│  │ • Dismiss       │  │ • City breakdown│                                  │
│  └─────────────────┘  └─────────────────┘                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Admin Route Protection

```typescript
// src/middleware.ts
export function middleware(request: NextRequest) {
  const session = await auth();

  // Admin routes require ADMIN role
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }
}
```

---

## 6. Data Flow Architecture

### Listing Creation Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Client  │    │  Server  │    │ Cloudinary│   │ Database │
│   Form   │    │  Action  │    │          │    │          │
└────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │               │
     │ Submit Form   │               │               │
     │ (up to 10 img)│               │               │
     │──────────────▶│               │               │
     │               │               │               │
     │               │ Upload Images │               │
     │               │──────────────▶│               │
     │               │               │               │
     │               │  Image URLs   │               │
     │               │◀──────────────│               │
     │               │               │               │
     │               │ Create Listing│               │
     │               │ (PKR prices)  │               │
     │               │───────────────│──────────────▶│
     │               │               │               │
     │               │    Created    │               │
     │               │◀──────────────│───────────────│
     │               │               │               │
     │  Success +    │               │               │
     │  Redirect     │               │               │
     │◀──────────────│               │               │
```

### Booking Lifecycle

```
Booking Status Flow:
┌─────────┐    ┌──────────┐    ┌─────────────────┐    ┌────────┐
│ PENDING │───▶│ APPROVED │───▶│ PAYMENT_PENDING │───▶│ ACTIVE │
└─────────┘    └──────────┘    └─────────────────┘    └────┬───┘
     │                                                      │
     │ ┌──────────┐                                        ▼
     └▶│ DECLINED │                               ┌───────────┐
       └──────────┘                               │ COMPLETED │
     │                                            └─────┬─────┘
     │ ┌───────────┐                                    │
     └▶│ CANCELLED │                                    ▼
       └───────────┘                              ┌──────────┐
     │                                            │ REVIEWED │
     │ ┌─────────┐                                └──────────┘
     └▶│ EXPIRED │
       └─────────┘
```

### Booking with Offline Payment Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Renter  │    │  System  │    │  Owner   │    │ Database │
└────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
     │               │               │               │
     │ Request Dates │               │               │
     │ + Pay Method  │               │               │
     │ + Notes       │               │               │
     │──────────────▶│               │               │
     │               │               │               │
     │               │ Create Booking│               │
     │               │ (PENDING)     │               │
     │               │───────────────│──────────────▶│
     │               │               │               │
     │               │ Notify Owner  │               │
     │               │──────────────▶│               │
     │               │               │               │
     │               │               │ Accept/Decline│
     │               │◀──────────────│               │
     │               │               │               │
     │               │ Update Status │               │
     │               │ (APPROVED)    │               │
     │               │───────────────│──────────────▶│
     │               │               │               │
     │               │ Create Payment│               │
     │               │ (PAYMENT_PENDING)              │
     │               │───────────────│──────────────▶│
     │               │               │               │
     │ Payment       │               │               │
     │ Instructions  │               │               │
     │◀──────────────│               │               │
     │               │               │               │
     │ Pay Offline   │               │               │
     │ (Cash/Bank)   │               │               │
     │───────────────│──────────────▶│               │
     │               │               │               │
     │               │               │Confirm Payment│
     │               │◀──────────────│               │
     │               │               │               │
     │               │Update Status  │               │
     │               │ (ACTIVE)      │               │
     │               │───────────────│──────────────▶│
     │               │               │               │
     │ Confirmation  │               │               │
     │◀──────────────│               │               │
     │               │               │               │
     │ Return Item   │               │               │
     │───────────────│──────────────▶│               │
     │               │               │               │
     │               │ Update Status │               │
     │               │ (COMPLETED)   │               │
     │               │───────────────│──────────────▶│
     │               │               │               │
     │ Leave Review  │               │               │
     │──────────────▶│               │               │
     │               │               │               │
     │               │ Update Status │               │
     │               │ (REVIEWED)    │               │
     │               │───────────────│──────────────▶│
```

**Note:** Real-time messaging/chat is deferred to Phase 2. MVP communication is handled through booking notes and status notifications.

---

## 7. Security Architecture

### Security Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     SECURITY LAYERS                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Layer 1: Edge (Vercel)                               │   │
│  │ • DDoS Protection                                    │   │
│  │ • SSL/TLS Termination                               │   │
│  │ • Rate Limiting (Edge Config)                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Layer 2: Middleware                                  │   │
│  │ • Authentication Check                               │   │
│  │ • Role-based Access (Admin routes)                   │   │
│  │ • CSRF Protection                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Layer 3: Application                                 │   │
│  │ • Input Sanitization (Zod)                          │   │
│  │ • Authorization (ownership checks)                   │   │
│  │ • SQL Injection Prevention (Prisma)                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Layer 4: Database                                    │   │
│  │ • Encrypted connections                              │   │
│  │ • Sensitive field encryption (future CNIC)           │   │
│  │ • Row-level security (future)                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Security Measures

| Threat | Mitigation |
|--------|------------|
| XSS | React auto-escaping, CSP headers |
| CSRF | Auth.js CSRF tokens, SameSite cookies |
| SQL Injection | Prisma parameterized queries |
| Session Hijacking | httpOnly cookies, secure flag |
| Brute Force | Rate limiting (Phase 2), account lockout |
| Data Exposure | Field-level authorization, admin audit logs |
| Unauthorized Admin | Role check in middleware + server actions |

---

## 8. Localization Configuration

### Pakistan-Specific Settings

```typescript
// src/config/locale.ts

export const LOCALE_CONFIG = {
  // Currency
  currency: {
    code: 'PKR',
    symbol: 'Rs.',
    locale: 'en-PK',
    decimals: 0, // PKR typically shown without decimals
  },

  // Timezone
  timezone: 'Asia/Karachi',

  // Date formats
  dateFormat: {
    short: 'dd/MM/yyyy',
    long: 'dd MMMM yyyy',
    withTime: 'dd/MM/yyyy HH:mm',
  },

  // Phone
  phone: {
    countryCode: '+92',
    format: '+92 XXX XXXXXXX',
    regex: /^\+92[0-9]{10}$/,
  },

  // Cities (initial launch)
  cities: [
    { value: 'karachi', label: 'Karachi' },
    { value: 'lahore', label: 'Lahore' },
    { value: 'islamabad', label: 'Islamabad' },
    { value: 'rawalpindi', label: 'Rawalpindi' },
  ],
};

// Currency formatting helper
export function formatPKR(amount: number): string {
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
// Output: "Rs. 1,500"
```

---

## 9. Deployment Architecture

### Vercel Deployment

```
┌─────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT PIPELINE                       │
└─────────────────────────────────────────────────────────────┘

  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
  │  Push   │───▶│  Build  │───▶│  Test   │───▶│ Deploy  │
  │ to Git  │    │  Check  │    │  Suite  │    │         │
  └─────────┘    └─────────┘    └─────────┘    └────┬────┘
                                                    │
                                    ┌───────────────┼───────────────┐
                                    │               │               │
                                    ▼               ▼               ▼
                              ┌─────────┐    ┌─────────┐    ┌─────────┐
                              │Preview  │    │Staging  │    │Production│
                              │ (PR)    │    │ (main)  │    │ (release)│
                              └─────────┘    └─────────┘    └─────────┘
```

### Environment Variables

```env
# Database
DATABASE_URL=

# Auth.js
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# App
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_APP_TIMEZONE=Asia/Karachi
NEXT_PUBLIC_DEFAULT_CURRENCY=PKR

# Admin (initial admin email)
ADMIN_EMAIL=

# Future - Pakistani Payment Gateways
JAZZCASH_MERCHANT_ID=
JAZZCASH_PASSWORD=
JAZZCASH_INTEGRITY_SALT=

EASYPAISA_STORE_ID=
EASYPAISA_HASH_KEY=

SAFEPAY_API_KEY=
SAFEPAY_SECRET_KEY=

# Future - International
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Future - Email
RESEND_API_KEY=
```

---

## 10. Scalability Considerations

### Current Architecture Limits

| Component | Expected Load | Scaling Strategy |
|-----------|---------------|------------------|
| Serverless Functions | 1000 concurrent | Vercel auto-scaling |
| Database | 10K rows/table | Indexing, connection pooling |
| Image CDN | Unlimited | Cloudinary handles |
| Static Assets | Unlimited | Vercel Edge CDN |

### Future Scaling Path

| Phase | Enhancement |
|-------|-------------|
| Phase 2 | Redis caching (Upstash), rate limiting |
| Phase 3 | Read replicas, full-text search |
| Phase 4 | Multi-region, database sharding |

---

*Document End*
