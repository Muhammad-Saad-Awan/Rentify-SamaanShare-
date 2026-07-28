# SamaanShare

**A Peer-to-Peer Rental Marketplace for Pakistan**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

---

## Overview

SamaanShare is a modern peer-to-peer rental marketplace that enables individuals in Pakistan to monetize their underutilized items by renting them to others. Instead of buying expensive equipment for occasional use, users can rent from their neighbors—saving money while reducing waste.

**Target Market:** Pakistan (PKR Currency, Asia/Karachi Timezone)

**Initial Launch Cities:** Karachi, Lahore, Islamabad

---

## The Problem

### For Owners
- Expensive items (cameras, tools, gaming consoles) sit idle 90% of the time
- No trusted platform to safely rent items to strangers
- Cash-only transactions feel risky

### For Renters
- High cost of ownership for occasional-use items
- Can't justify PKR 150,000 for a camera needed once
- Traditional rental shops are overpriced and inconvenient
- Existing platforms (OLX, Facebook) lack rental-specific features and trust mechanisms

### Market Gap
Pakistan lacks a dedicated rental marketplace with:
- Verification and trust systems
- Secure booking management
- Security deposit handling
- Two-way review systems

---

## The Solution

SamaanShare provides a trusted platform where:

- **Owners** list items, set prices in PKR, and earn passive income
- **Renters** browse, book, and rent items affordably
- **Trust** is built through reviews, verification, and security deposits
- **Transactions** are managed through a structured booking system

---

## Core Features

### For Renters
- Browse and search listings by category, city, price, and availability
- Filter by condition (New, Like New, Good, Fair)
- Sort by newest, price, or rating
- Request bookings with preferred dates
- Track booking status through complete lifecycle
- Leave reviews after completed rentals
- Save favorite listings to wishlist

### For Owners
- Create listings with up to 10 images
- Set daily, weekly, and monthly pricing in PKR
- Define security deposit amounts
- Manage availability calendar
- Accept or decline booking requests
- Confirm offline payments (Cash/Bank Transfer)
- View earnings and analytics

### For Admins
- User management (view, suspend, ban)
- Listing moderation
- Booking oversight
- Handle reported listings and users
- Platform analytics and reports

### Trust & Safety
- Email verification
- Two-way review system
- Security deposit requirements
- User reporting system
- Admin moderation

---

## Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Framework** | Next.js 15 | Full-stack React framework with App Router |
| **Language** | TypeScript | Type-safe development |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **Components** | shadcn/ui | Accessible, customizable UI components |
| **Database** | PostgreSQL | Reliable, scalable relational database |
| **ORM** | Prisma | Type-safe database client |
| **Authentication** | Auth.js v5 | Secure authentication (Email + Google OAuth) |
| **Images** | Cloudinary | Image storage, optimization, and CDN |
| **Validation** | Zod | Runtime type validation |
| **State** | Zustand | Lightweight client state management |
| **Hosting** | Vercel | Serverless deployment platform |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT LAYER                            │
│         (Browser - Desktop, Mobile, Tablet)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    EDGE / CDN LAYER                          │
│              (Vercel Edge Network)                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   APPLICATION LAYER                          │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │   App Router    │  │  Server Actions │                   │
│  │   (RSC Pages)   │  │   (Mutations)   │                   │
│  └─────────────────┘  └─────────────────┘                   │
│                                                              │
│  ┌─────────────────────────────────────────┐                │
│  │         Admin Dashboard                  │                │
│  └─────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVICE LAYER                             │
│                                                              │
│  ┌─────────────────────────────────────────┐                │
│  │     Payment Abstraction Layer           │                │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐   │                │
│  │  │ Offline │ │JazzCash │ │ Safepay │   │                │
│  │  │  (MVP)  │ │(Future) │ │(Future) │   │                │
│  │  └─────────┘ └─────────┘ └─────────┘   │                │
│  └─────────────────────────────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATA LAYER                              │
│                                                              │
│      ┌──────────────┐        ┌──────────────┐               │
│      │  PostgreSQL  │        │  Cloudinary  │               │
│      │  (Database)  │        │   (Images)   │               │
│      └──────────────┘        └──────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

- **Server Actions** for mutations (type-safe, progressive enhancement)
- **React Server Components** for data fetching (no loading states, SEO-friendly)
- **Payment Abstraction Layer** for provider-agnostic payment handling
- **Role-Based Access Control** (USER, ADMIN roles)
- **Provider-agnostic design** for future payment gateway integrations

---

## Project Structure

```
samaanshare/
├── docs/                          # Architecture documentation
│   ├── PRD.md                     # Product Requirements
│   ├── ARCHITECTURE.md            # Technical Architecture
│   ├── DATABASE.md                # Database Schema
│   ├── API.md                     # API Design
│   ├── PROJECT_STRUCTURE.md       # Folder Organization
│   ├── ROADMAP.md                 # Development Phases
│   └── ENGINEERING_GUIDELINES.md  # Coding Standards
│
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (auth)/                # Auth routes (login, register)
│   │   ├── (main)/                # Main app routes
│   │   ├── admin/                 # Admin dashboard
│   │   └── api/                   # API routes (webhooks)
│   │
│   ├── components/                # React components
│   │   ├── ui/                    # shadcn/ui primitives
│   │   ├── forms/                 # Form components
│   │   └── [feature]/             # Feature-specific components
│   │
│   ├── lib/                       # Utilities and services
│   │   ├── actions/               # Server actions
│   │   ├── db/                    # Database utilities
│   │   ├── payments/              # Payment abstraction
│   │   └── utils/                 # Helper functions
│   │
│   ├── hooks/                     # Custom React hooks
│   ├── stores/                    # Zustand stores
│   └── types/                     # TypeScript types
│
├── prisma/
│   ├── schema.prisma              # Database schema
│   └── migrations/                # Database migrations
│
├── public/                        # Static assets
├── README.md                      # This file
├── TODO.md                        # Development backlog
├── CHANGELOG.md                   # Version history
└── LICENSE                        # MIT License
```

---

## Development Status

| Phase | Status | Description |
|-------|--------|-------------|
| Documentation | ✅ Complete | PRD, Architecture, Database, API, Guidelines |
| Phase 0: Foundation | 🔲 Pending | Next.js, Prisma, Auth.js setup |
| Phase 1: Authentication | 🔲 Pending | Login, Register, Profile |
| Phase 2: Marketplace | 🔲 Pending | Browse, Search, Filters |
| Phase 3: Listings | 🔲 Pending | CRUD, Images, Categories |
| Phase 4: Booking | 🔲 Pending | Request, Payment, Lifecycle |
| Phase 5: Reviews | 🔲 Pending | Ratings, Two-way reviews |
| Phase 6: Admin | 🔲 Pending | Dashboard, Moderation |
| Phase 7: Polish | 🔲 Pending | Testing, Deployment |

**Current Version:** Pre-release (Architecture v1.0 Locked)

---

## Installation

> **Note:** Installation instructions will be added after Next.js initialization.

### Prerequisites

- Node.js 24+ (LTS) — see `.nvmrc`
- PostgreSQL 15+
- npm, yarn, or pnpm

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Muhammad-Saad-Awan/Rentify-SamaanShare-.git

# Navigate to project
cd Rentify-SamaanShare-

# Install dependencies (coming soon)
npm install

# Set up environment variables (coming soon)
cp .env.example .env.local

# Run database migrations (coming soon)
npx prisma migrate dev

# Start development server (coming soon)
npm run dev
```

---

## Roadmap

### MVP (Phase 0-7)
- [x] Architecture documentation
- [ ] User authentication (Email + Google)
- [ ] Listing management (up to 10 images)
- [ ] Search with filters (category, city, price, condition, dates)
- [ ] Booking system with lifecycle management
- [ ] Offline payments (Cash, Bank Transfer)
- [ ] Two-way review system
- [ ] User reporting system
- [ ] Admin dashboard
- [ ] Production deployment

### Phase 2: Trust & Payments (Future)
- [ ] JazzCash integration
- [ ] Easypaisa integration
- [ ] Safepay / PayFast integration
- [ ] Phone OTP verification
- [ ] Real-time messaging
- [ ] CNIC verification (NADRA)

### Phase 3: Growth (Future)
- [ ] Mobile applications (React Native)
- [ ] Urdu language support
- [ ] Delivery integration (Bykea, Careem)
- [ ] Owner analytics dashboard

### Phase 4: Scale (Future)
- [ ] City expansion (Faisalabad, Peshawar, Multan)
- [ ] Business accounts
- [ ] Stripe (international)
- [ ] Insurance partnerships

---

## Documentation

Comprehensive documentation is available in the `/docs` directory:

| Document | Description |
|----------|-------------|
| [PRD.md](docs/PRD.md) | Product Requirements Document |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Technical Architecture |
| [DATABASE.md](docs/DATABASE.md) | Database Schema Design |
| [API.md](docs/API.md) | API & Server Actions Design |
| [PROJECT_STRUCTURE.md](docs/PROJECT_STRUCTURE.md) | Folder Organization |
| [ROADMAP.md](docs/ROADMAP.md) | Development Phases |
| [ENGINEERING_GUIDELINES.md](docs/ENGINEERING_GUIDELINES.md) | Coding Standards |

---

## Contributing

Contributions are welcome! Please read our contributing guidelines (coming soon) before submitting a PR.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Contact

**Project:** SamaanShare - Peer-to-Peer Rental Marketplace

**Repository:** [github.com/Muhammad-Saad-Awan/Rentify-SamaanShare-](https://github.com/Muhammad-Saad-Awan/Rentify-SamaanShare-)

---

<p align="center">
  <strong>Built for Pakistan 🇵🇰</strong><br>
  <sub>Empowering communities through the sharing economy</sub>
</p>
