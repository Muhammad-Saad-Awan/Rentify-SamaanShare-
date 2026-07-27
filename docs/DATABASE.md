# SamaanShare - Database Schema Design

**Version:** 1.0 - Architecture Locked
**Last Updated:** July 2026
**ORM:** Prisma
**Target Market:** Pakistan (PKR, Asia/Karachi)
**Status:** Final - Ready for Implementation

---

## 1. Entity Relationship Diagram (ERD)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           SAMAANSHARE DATABASE SCHEMA                                │
└─────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│      User        │       │     Account      │       │     Session      │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ id           PK  │───┐   │ id           PK  │       │ id           PK  │
│ name             │   │   │ userId       FK  │───────│ userId       FK  │───┐
│ email        UK  │   │   │ type             │       │ sessionToken UK  │   │
│ emailVerified    │   │   │ provider         │       │ expires          │   │
│ image            │   │   │ providerAccountId│       └──────────────────┘   │
│ password         │   │   │ refresh_token    │                              │
│ phone            │   │   │ access_token     │                              │
│ phoneVerified    │   │   │ expires_at       │                              │
│ bio              │   │   │ token_type       │                              │
│ city             │   │   │ scope            │                              │
│ avatarUrl        │   │   │ id_token         │                              │
│ role (USER/ADMIN)│   │   └──────────────────┘                              │
│ status           │   │                                                     │
│ isVerified       │   │   ┌──────────────────┐                              │
│ createdAt        │   │   │VerificationToken │                              │
│ updatedAt        │   │   ├──────────────────┤                              │
└────────┬─────────┘   │   │ identifier       │                              │
         │             │   │ token        UK  │                              │
         │             │   │ expires          │                              │
         │             │   └──────────────────┘                              │
         │             │                                                     │
         │             └─────────────────────────────────────────────────────┘
         │
         │ 1:N
         ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│     Listing      │       │    Category      │       │   Subcategory    │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ id           PK  │───┐   │ id           PK  │───────│ id           PK  │
│ ownerId      FK  │   │   │ name         UK  │   │   │ categoryId   FK  │
│ title            │   │   │ slug         UK  │   │   │ name         UK  │
│ description      │   │   │ icon             │   │   │ slug         UK  │
│ categoryId   FK  │───┘   │ createdAt        │   │   └──────────────────┘
│ subcategoryId FK │───────│ updatedAt        │   │
│ condition        │       └──────────────────┘   │
│ pricePerDay (PKR)│                              │
│ pricePerWeek     │                              │
│ pricePerMonth    │                              │
│ securityDeposit  │                              │
│ city             │                              │
│ area             │                              │
│ latitude         │                              │
│ longitude        │                              │
│ status           │                              │
│ viewCount        │                              │
│ createdAt        │                              │
│ updatedAt        │                              │
└────────┬─────────┘                              │
         │                                        │
         │ 1:N (up to 10 images)                  │
         ▼                                        │
┌──────────────────┐                              │
│  ListingImage    │                              │
├──────────────────┤                              │
│ id           PK  │                              │
│ listingId    FK  │                              │
│ url              │                              │
│ publicId         │ (Cloudinary)                 │
│ order            │                              │
│ createdAt        │                              │
└──────────────────┘                              │
                                                  │
┌──────────────────┐       ┌──────────────────┐   │
│     Booking      │       │     Payment      │   │
├──────────────────┤       ├──────────────────┤   │
│ id           PK  │───────│ id           PK  │   │
│ listingId    FK  │       │ bookingId    FK  │   │
│ renterId     FK  │       │ provider         │   │
│ ownerId      FK  │       │ method           │   │
│ paymentId    FK  │       │ amount (PKR)     │   │
│ startDate        │       │ securityDeposit  │   │
│ endDate          │       │ currency (PKR)   │   │
│ totalPrice (PKR) │       │ status           │   │
│ status           │       │ transactionRef   │   │
│ pickupInstructions│      │ metadata         │   │
│ notes            │       │ confirmedAt      │   │
│ createdAt        │       │ createdAt        │   │
│ updatedAt        │       │ updatedAt        │   │
└────────┬─────────┘       └──────────────────┘   │
         │                                        │
         │                                        │
         ▼                                        │
┌──────────────────┐       ┌──────────────────┐   │
│     Review       │       │ UnavailableDate  │   │
├──────────────────┤       ├──────────────────┤   │
│ id           PK  │       │ id           PK  │   │
│ bookingId    FK  │ UK    │ listingId    FK  │───┘
│ reviewerId   FK  │       │ date             │
│ revieweeId   FK  │       │ reason           │
│ rating           │       └──────────────────┘
│ comment          │
│ type             │ (OWNER_TO_RENTER / RENTER_TO_OWNER)
│ createdAt        │
└──────────────────┘

┌──────────────────┐       ┌──────────────────┐
│  Conversation    │       │     Message      │
├──────────────────┤       ├──────────────────┤
│ id           PK  │───────│ id           PK  │
│ listingId    FK  │       │ conversationId FK│
│ participant1Id FK│       │ senderId     FK  │
│ participant2Id FK│       │ content          │
│ lastMessageAt    │       │ isRead           │
│ createdAt        │       │ createdAt        │
│ updatedAt        │       └──────────────────┘
└──────────────────┘

┌──────────────────┐       ┌──────────────────┐
│   SavedListing   │       │     Report       │
├──────────────────┤       ├──────────────────┤
│ id           PK  │       │ id           PK  │
│ userId       FK  │       │ reporterId   FK  │
│ listingId    FK  │       │ type             │ (USER/LISTING/REVIEW)
│ createdAt        │       │ targetId         │
└──────────────────┘       │ reason           │
(UK: userId + listingId)   │ description      │
                           │ status           │ (PENDING/RESOLVED/DISMISSED)
                           │ resolvedBy   FK  │
                           │ resolvedAt       │
                           │ createdAt        │
                           └──────────────────┘
```

---

## 2. Prisma Schema

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==================== AUTH.JS MODELS ====================

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  password      String?   // For credentials provider (hashed)

  // Extended profile fields
  phone         String?
  phoneVerified Boolean   @default(false)
  bio           String?   @db.Text
  city          String?   // Pakistani city (Karachi, Lahore, etc.)
  avatarUrl     String?

  // Platform fields
  role          UserRole     @default(USER)
  status        UserStatus   @default(ACTIVE)
  isVerified    Boolean      @default(false) // Trust verification

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Auth.js relations
  accounts      Account[]
  sessions      Session[]

  // App relations
  listings          Listing[]          @relation("OwnerListings")
  bookingsAsRenter  Booking[]          @relation("RenterBookings")
  bookingsAsOwner   Booking[]          @relation("OwnerBookings")
  reviewsGiven      Review[]           @relation("ReviewsGiven")
  reviewsReceived   Review[]           @relation("ReviewsReceived")
  savedListings     SavedListing[]
  conversationsAsP1 Conversation[]     @relation("Participant1")
  conversationsAsP2 Conversation[]     @relation("Participant2")
  messagesSent      Message[]
  reportsSubmitted  Report[]           @relation("ReportsSubmitted")
  reportsResolved   Report[]           @relation("ReportsResolved")

  @@map("users")
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}

// ==================== ENUMS ====================

enum UserRole {
  USER
  ADMIN
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  BANNED
}

enum ListingStatus {
  DRAFT
  ACTIVE
  PAUSED
  DELETED
}

enum ItemCondition {
  NEW
  LIKE_NEW
  GOOD
  FAIR
}

enum BookingStatus {
  PENDING          // Awaiting owner approval
  APPROVED         // Owner accepted, awaiting payment
  PAYMENT_PENDING  // Waiting for offline payment confirmation
  ACTIVE           // Currently rented (item picked up)
  COMPLETED        // Successfully returned
  REVIEWED         // Both parties have left reviews
  DECLINED         // Owner declined the request
  CANCELLED        // Cancelled by either party
  EXPIRED          // Request expired without response
}

enum PaymentProvider {
  OFFLINE      // Cash, Bank Transfer (MVP)
  JAZZCASH     // Future
  EASYPAISA    // Future
  SAFEPAY      // Future
  PAYFAST      // Future
  STRIPE       // Future (International)
}

enum PaymentMethod {
  CASH
  BANK_TRANSFER
  JAZZCASH_WALLET
  EASYPAISA_WALLET
  CREDIT_CARD
  DEBIT_CARD
}

enum PaymentStatus {
  PENDING
  AWAITING_CONFIRMATION  // Waiting for owner to confirm receipt
  PROCESSING
  COMPLETED
  FAILED
  REFUNDED
  CANCELLED
}

enum ReviewType {
  OWNER_TO_RENTER
  RENTER_TO_OWNER
}

enum ReportType {
  USER
  LISTING
  REVIEW
}

enum ReportStatus {
  PENDING
  RESOLVED
  DISMISSED
}

// ==================== CATEGORY MODELS ====================

model Category {
  id            String        @id @default(cuid())
  name          String        @unique
  slug          String        @unique
  icon          String?       // Lucide icon name
  description   String?

  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  subcategories Subcategory[]
  listings      Listing[]

  @@map("categories")
}

model Subcategory {
  id          String   @id @default(cuid())
  categoryId  String
  name        String
  slug        String

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  category    Category  @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  listings    Listing[]

  @@unique([categoryId, slug])
  @@map("subcategories")
}

// ==================== LISTING MODELS ====================

model Listing {
  id              String        @id @default(cuid())
  ownerId         String

  // Basic info
  title           String
  description     String        @db.Text

  // Categorization
  categoryId      String
  subcategoryId   String?
  condition       ItemCondition

  // Pricing (all in PKR)
  pricePerDay     Decimal       @db.Decimal(10, 0) // PKR no decimals
  pricePerWeek    Decimal?      @db.Decimal(10, 0)
  pricePerMonth   Decimal?      @db.Decimal(10, 0)
  securityDeposit Decimal       @db.Decimal(10, 0)

  // Location (Pakistani cities)
  city            String        // Karachi, Lahore, Islamabad, etc.
  area            String?       // DHA, Gulshan, Johar, etc.
  latitude        Float?
  longitude       Float?

  // Status & metrics
  status          ListingStatus @default(DRAFT)
  viewCount       Int           @default(0)

  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  // Relations
  owner           User          @relation("OwnerListings", fields: [ownerId], references: [id], onDelete: Cascade)
  category        Category      @relation(fields: [categoryId], references: [id])
  subcategory     Subcategory?  @relation(fields: [subcategoryId], references: [id])
  images          ListingImage[]
  unavailableDates UnavailableDate[]
  bookings        Booking[]
  savedBy         SavedListing[]
  conversations   Conversation[]

  @@index([ownerId])
  @@index([categoryId])
  @@index([city])
  @@index([status])
  @@index([pricePerDay])
  @@map("listings")
}

model ListingImage {
  id        String   @id @default(cuid())
  listingId String
  url       String   // Cloudinary URL
  publicId  String   // Cloudinary public ID for deletion
  order     Int      @default(0)

  createdAt DateTime @default(now())

  listing   Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@index([listingId])
  @@map("listing_images")
}

model UnavailableDate {
  id        String   @id @default(cuid())
  listingId String
  date      DateTime @db.Date
  reason    String?  // "owner_blocked" | "booked"

  listing   Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@unique([listingId, date])
  @@index([listingId])
  @@map("unavailable_dates")
}

// ==================== PAYMENT MODELS ====================

model Payment {
  id              String          @id @default(cuid())

  // Provider-agnostic fields
  provider        PaymentProvider @default(OFFLINE)
  method          PaymentMethod
  status          PaymentStatus   @default(PENDING)

  // Amounts (all in PKR)
  amount          Decimal         @db.Decimal(10, 0)
  securityDeposit Decimal         @db.Decimal(10, 0)
  currency        String          @default("PKR")

  // Provider-specific reference
  transactionRef  String?         // External transaction ID
  metadata        Json?           // Provider-specific data

  // Confirmation (for offline payments)
  confirmedAt     DateTime?
  confirmedBy     String?         // userId who confirmed

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  // Relations
  booking         Booking?

  @@index([status])
  @@index([provider])
  @@map("payments")
}

// ==================== BOOKING MODELS ====================

model Booking {
  id                 String        @id @default(cuid())
  listingId          String
  renterId           String
  ownerId            String
  paymentId          String?       @unique

  // Dates
  startDate          DateTime      @db.Date
  endDate            DateTime      @db.Date

  // Pricing (captured at booking time, in PKR)
  totalPrice         Decimal       @db.Decimal(10, 0)
  securityDeposit    Decimal       @db.Decimal(10, 0)

  // Status
  status             BookingStatus @default(PENDING)

  // Details
  pickupInstructions String?       @db.Text
  notes              String?       @db.Text // Renter notes to owner

  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  // Relations
  listing            Listing       @relation(fields: [listingId], references: [id])
  renter             User          @relation("RenterBookings", fields: [renterId], references: [id])
  owner              User          @relation("OwnerBookings", fields: [ownerId], references: [id])
  payment            Payment?      @relation(fields: [paymentId], references: [id])
  reviews            Review[]
  bookedDates        BookingDate[]

  @@index([listingId])
  @@index([renterId])
  @@index([ownerId])
  @@index([status])
  @@map("bookings")
}

model BookingDate {
  id        String   @id @default(cuid())
  bookingId String
  date      DateTime @db.Date

  booking   Booking  @relation(fields: [bookingId], references: [id], onDelete: Cascade)

  @@unique([bookingId, date])
  @@index([date])
  @@map("booking_dates")
}

// ==================== REVIEW MODELS ====================

model Review {
  id          String     @id @default(cuid())
  bookingId   String
  reviewerId  String     // Who wrote the review
  revieweeId  String     // Who is being reviewed

  type        ReviewType
  rating      Int        // 1-5
  comment     String?    @db.Text

  createdAt   DateTime   @default(now())

  booking     Booking    @relation(fields: [bookingId], references: [id])
  reviewer    User       @relation("ReviewsGiven", fields: [reviewerId], references: [id])
  reviewee    User       @relation("ReviewsReceived", fields: [revieweeId], references: [id])

  @@unique([bookingId, reviewerId]) // One review per booking per person
  @@index([revieweeId])
  @@map("reviews")
}

// ==================== MESSAGING MODELS (Phase 2 - Future) ====================
// Note: Real-time messaging is deferred from MVP. MVP uses booking notes only.

model Conversation {
  id             String    @id @default(cuid())
  listingId      String
  participant1Id String    // Usually the inquirer (renter)
  participant2Id String    // Usually the owner

  lastMessageAt  DateTime  @default(now())

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  listing        Listing   @relation(fields: [listingId], references: [id])
  participant1   User      @relation("Participant1", fields: [participant1Id], references: [id])
  participant2   User      @relation("Participant2", fields: [participant2Id], references: [id])
  messages       Message[]

  @@unique([listingId, participant1Id, participant2Id])
  @@index([participant1Id])
  @@index([participant2Id])
  @@map("conversations")
}

model Message {
  id             String       @id @default(cuid())
  conversationId String
  senderId       String

  content        String       @db.Text
  isRead         Boolean      @default(false)

  createdAt      DateTime     @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sender         User         @relation(fields: [senderId], references: [id])

  @@index([conversationId])
  @@index([senderId])
  @@map("messages")
}

// ==================== SAVED/WISHLIST ====================

model SavedListing {
  id        String   @id @default(cuid())
  userId    String
  listingId String

  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  listing   Listing  @relation(fields: [listingId], references: [id], onDelete: Cascade)

  @@unique([userId, listingId])
  @@map("saved_listings")
}

// ==================== REPORTING/MODERATION ====================

model Report {
  id          String       @id @default(cuid())
  reporterId  String
  type        ReportType   // USER, LISTING, REVIEW
  targetId    String       // ID of reported entity
  reason      String       // Predefined reason category
  description String?      @db.Text

  status      ReportStatus @default(PENDING)
  resolvedBy  String?      // Admin who resolved
  resolvedAt  DateTime?
  resolution  String?      // Notes on resolution

  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  reporter    User         @relation("ReportsSubmitted", fields: [reporterId], references: [id])
  resolver    User?        @relation("ReportsResolved", fields: [resolvedBy], references: [id])

  @@index([status])
  @@index([type])
  @@map("reports")
}
```

---

## 3. Database Indexes Strategy

### Primary Indexes (Automatic)

All `@id` fields are automatically indexed by Prisma/PostgreSQL.

### Secondary Indexes (Defined Above)

| Table | Index | Purpose |
|-------|-------|---------|
| listings | ownerId | Owner's listing queries |
| listings | categoryId | Category filtering |
| listings | city | City-based search (Pakistani cities) |
| listings | status | Active listings filter |
| listings | pricePerDay | Price sorting/filtering |
| listing_images | listingId | Fetch listing images |
| unavailable_dates | listingId | Availability checks |
| bookings | listingId | Listing booking history |
| bookings | renterId | User's rental history |
| bookings | ownerId | Owner's rental requests |
| bookings | status | Status-based queries |
| booking_dates | date | Date availability checks |
| payments | status | Payment status queries |
| payments | provider | Provider-based filtering |
| reviews | revieweeId | User's received reviews |
| conversations | participant1Id | User's conversations |
| conversations | participant2Id | User's conversations |
| messages | conversationId | Conversation messages |
| reports | status | Pending reports for admin |
| reports | type | Report type filtering |

### Future Indexes (When Needed)

```sql
-- Full-text search on listings
CREATE INDEX listings_search_idx ON listings
USING gin(to_tsvector('english', title || ' ' || description));

-- Geospatial search (PostGIS extension)
CREATE INDEX listings_location_idx ON listings
USING gist(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));
```

---

## 4. Data Validation Rules

### User

| Field | Validation |
|-------|------------|
| email | Valid email format, unique |
| password | Min 8 chars, hashed with bcrypt |
| phone | Pakistani format: +92 3XX XXXXXXX (optional) |
| bio | Max 500 characters |
| name | Max 100 characters |
| city | Must be valid Pakistani city |

### Listing

| Field | Validation |
|-------|------------|
| title | 5-100 characters |
| description | 20-5000 characters |
| pricePerDay | > 0, whole number (PKR) |
| pricePerWeek | > pricePerDay * 5 (suggested) |
| securityDeposit | >= 0, whole number (PKR) |
| images | 1-10 images required |
| city | Must be valid Pakistani city |

### Booking

| Field | Validation |
|-------|------------|
| startDate | >= today (Asia/Karachi timezone) |
| endDate | > startDate |
| totalPrice | Calculated: days * pricePerDay (PKR) |

### Review

| Field | Validation |
|-------|------------|
| rating | 1-5 integer |
| comment | Max 1000 characters |

### Payment

| Field | Validation |
|-------|------------|
| amount | > 0, whole number (PKR) |
| currency | Must be "PKR" |
| method | Must match provider capabilities |

---

## 5. Seed Data

```typescript
// prisma/seed.ts

const pakistaniCities = [
  'Karachi',
  'Lahore',
  'Islamabad',
  'Rawalpindi',
  'Faisalabad',
  'Multan',
  'Peshawar',
  'Quetta',
];

const categories = [
  {
    name: "Electronics",
    slug: "electronics",
    icon: "Laptop",
    subcategories: [
      { name: "Cameras & Photography", slug: "cameras" },
      { name: "Audio Equipment", slug: "audio" },
      { name: "Gaming Consoles", slug: "gaming" },
      { name: "Computers & Laptops", slug: "computers" },
      { name: "Drones", slug: "drones" },
    ],
  },
  {
    name: "Tools & Equipment",
    slug: "tools",
    icon: "Wrench",
    subcategories: [
      { name: "Power Tools", slug: "power-tools" },
      { name: "Hand Tools", slug: "hand-tools" },
      { name: "Garden Equipment", slug: "garden" },
      { name: "Cleaning Equipment", slug: "cleaning" },
      { name: "Generators", slug: "generators" },
    ],
  },
  {
    name: "Sports & Outdoors",
    slug: "sports",
    icon: "Bike",
    subcategories: [
      { name: "Camping Gear", slug: "camping" },
      { name: "Bicycles", slug: "bicycles" },
      { name: "Cricket Equipment", slug: "cricket" },
      { name: "Fitness Equipment", slug: "fitness" },
      { name: "Hiking & Trekking", slug: "hiking" },
    ],
  },
  {
    name: "Events & Party",
    slug: "events",
    icon: "PartyPopper",
    subcategories: [
      { name: "Decorations & Lighting", slug: "decorations" },
      { name: "Furniture", slug: "furniture" },
      { name: "Catering Equipment", slug: "catering" },
      { name: "Sound Systems", slug: "sound" },
      { name: "Tents & Canopies", slug: "tents" },
    ],
  },
  {
    name: "Vehicles",
    slug: "vehicles",
    icon: "Car",
    subcategories: [
      { name: "Bicycles", slug: "bicycles" },
      { name: "Motorcycles", slug: "motorcycles" },
      { name: "Scooters", slug: "scooters" },
    ],
  },
  {
    name: "Home & Living",
    slug: "home",
    icon: "Home",
    subcategories: [
      { name: "Furniture", slug: "furniture" },
      { name: "Appliances", slug: "appliances" },
      { name: "Baby Gear", slug: "baby" },
    ],
  },
  {
    name: "Fashion & Accessories",
    slug: "fashion",
    icon: "Shirt",
    subcategories: [
      { name: "Bridal & Formal Wear", slug: "bridal" },
      { name: "Costumes", slug: "costumes" },
      { name: "Jewelry", slug: "jewelry" },
      { name: "Bags & Luggage", slug: "bags" },
    ],
  },
];

// Seed admin user
const adminUser = {
  email: process.env.ADMIN_EMAIL || "admin@samaanshare.pk",
  name: "Admin",
  role: "ADMIN",
  emailVerified: new Date(),
};
```

---

## 6. Migration Strategy

### Development Workflow

```bash
# Create migration after schema changes
npx prisma migrate dev --name description_of_change

# Apply migrations to production
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate

# Reset database (development only)
npx prisma migrate reset

# Open Prisma Studio
npx prisma studio
```

### Migration Naming Convention

```
YYYYMMDD_description
Examples:
- 20260727_init
- 20260801_add_payment_model
- 20260815_add_admin_reports
```

---

## 7. Backup & Recovery

### Recommended Strategy

1. **Automated Daily Backups** (Vercel Postgres / Provider feature)
2. **Point-in-Time Recovery** (Enable for production)
3. **Pre-migration Backups** (Manual before major changes)

### Backup Command (Manual)

```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

---

## 8. Performance Considerations

### Query Optimization

1. **Use `select` to limit fields**
   ```typescript
   prisma.listing.findMany({
     select: { id: true, title: true, pricePerDay: true, city: true }
   })
   ```

2. **Use `include` sparingly**
   ```typescript
   // Avoid deep nesting
   prisma.listing.findUnique({
     include: {
       owner: { select: { name: true, image: true } },
       images: { orderBy: { order: 'asc' }, take: 10 }
     }
   })
   ```

3. **Pagination**
   ```typescript
   prisma.listing.findMany({
     skip: (page - 1) * limit,
     take: limit,
     orderBy: { createdAt: 'desc' }
   })
   ```

### Connection Pooling

For serverless (Vercel), use Prisma Accelerate or configure:

```
DATABASE_URL="postgresql://...?pgbouncer=true&connection_limit=1"
```

---

## 9. Admin Queries (Examples)

```typescript
// Get platform statistics
const stats = await prisma.$transaction([
  prisma.user.count(),
  prisma.listing.count({ where: { status: 'ACTIVE' } }),
  prisma.booking.count({ where: { status: 'COMPLETED' } }),
  prisma.booking.aggregate({
    where: { status: 'COMPLETED' },
    _sum: { totalPrice: true }
  }),
]);

// Get pending reports
const pendingReports = await prisma.report.findMany({
  where: { status: 'PENDING' },
  include: {
    reporter: { select: { name: true, email: true } }
  },
  orderBy: { createdAt: 'desc' }
});

// Suspend user
await prisma.user.update({
  where: { id: userId },
  data: { status: 'SUSPENDED' }
});
```

---

*Document End*
