# SamaanShare - Product Requirements Document (PRD)

**Version:** 1.0 - Architecture Locked
**Last Updated:** July 2026
**Status:** Final - Ready for Implementation
**Target Market:** Pakistan

---

## 1. Executive Summary

SamaanShare is a peer-to-peer rental marketplace built for Pakistan that enables individuals to monetize their underutilized items by renting them to others. Instead of buying expensive equipment for occasional use, users can rent from their neighbors, saving money while reducing waste.

**Key Market Context:**
- Currency: Pakistani Rupee (PKR)
- Timezone: Asia/Karachi (PKT, UTC+5)
- Language: English (Urdu support in future phases)
- Initial Cities: Karachi, Lahore, Islamabad

---

## 2. Problem Statement

### The Problem

1. **Underutilized Assets:** Most Pakistani households own expensive items (cameras, power tools, camping gear, gaming consoles) that sit idle 90% of the time, representing wasted value.

2. **High Cost of Ownership:** Consumers spend significant money purchasing items they only need occasionally (e.g., a PKR 150,000 DSLR camera for a single wedding, PKR 80,000 power tools for one home project).

3. **Environmental Waste:** Manufacturing redundant items contributes to resource depletion and environmental degradation. The sharing economy can reduce this footprint.

4. **No Trusted Platform:** Existing solutions in Pakistan are either:
   - Too broad (Facebook Marketplace, OLX) - no rental-specific features
   - Too niche (wedding-only platforms)
   - Lack trust mechanisms (verification, reviews, deposits)
   - No secure payment options for rentals

### The Opportunity

Pakistan's growing urban middle class and tech-savvy youth population presents a significant opportunity:
- Population: 230+ million with 60%+ under age 30
- Rising smartphone penetration (50%+)
- Growing e-commerce adoption (Daraz, Foodpanda success)
- High population density in major cities enables convenient exchanges
- Cost-conscious consumers seek alternatives to ownership
- Wedding/event culture creates high demand for temporary equipment

---

## 3. Target Users

### Primary Personas

#### Persona 1: The Renter (Item Seeker)
**Name:** Ayesha, 28, Marketing Professional, Karachi
**Characteristics:**
- Lives in urban apartment (DHA/Clifton)
- Needs items occasionally (camera for family events, tools for DIY)
- Cost-conscious but values quality
- Comfortable with technology and online payments
- Values convenience and trust

**Pain Points:**
- Can't justify buying expensive items for one-time use
- Doesn't have storage space for bulky equipment
- Worried about scams on OLX/Facebook Marketplace
- Traditional rental shops are inconvenient and overpriced

**Goals:**
- Access quality items affordably
- Quick and trustworthy transactions
- Convenient pickup within her city

---

#### Persona 2: The Owner (Item Lister)
**Name:** Ahmed, 35, Software Engineer, Lahore
**Characteristics:**
- Owns multiple gadgets and equipment
- Items often sit unused after initial purchase
- Wants passive income to supplement salary
- Values his possessions
- Limited time for complex processes

**Pain Points:**
- Expensive items (DSLR, drone, projector) collecting dust
- Worried about damage/theft if lending to strangers
- No easy way to find trustworthy renters
- Cash-only transactions feel risky

**Goals:**
- Earn money from idle assets (PKR 10,000-50,000/month potential)
- Protect items with deposits
- Simple listing and management process

---

#### Persona 3: The Event Planner
**Name:** Fatima, 32, Event Coordinator, Islamabad
**Characteristics:**
- Organizes weddings and corporate events
- Needs diverse equipment (projectors, speakers, decor, lighting)
- Budget-conscious for clients
- Needs reliable availability

**Pain Points:**
- Traditional rental shops charge premium rates
- Limited variety available in one place
- Complex booking processes
- Last-minute availability issues

**Goals:**
- Access diverse inventory from multiple owners
- Competitive pricing (30-50% below traditional rentals)
- Reliable booking system with confirmations

---

### Secondary Users

- **University Students:** Need equipment for projects, events, thesis photography on limited budgets
- **Small Businesses/Startups:** Occasional equipment needs without capital investment
- **Content Creators:** YouTubers, TikTokers wanting to try gear before buying
- **Wedding Families:** One-time need for decor, photography equipment, sound systems
- **Travelers:** Need camping gear, cameras for Northern areas trips

---

## 4. Core Features (MVP)

### 4.1 User Management

| Feature | Description | Priority |
|---------|-------------|----------|
| Email/Password Registration | Basic signup with email verification | Must Have |
| OAuth Sign-in | Google authentication | Must Have |
| User Profile | Photo, bio, city, verification status | Must Have |
| Email Verification | Confirm email ownership | Must Have |
| Phone Verification | Verify Pakistani mobile number | Future (Phase 2) |
| Trust Score | Calculated from reviews and history | Should Have |

### 4.2 Item Listings

| Feature | Description | Priority |
|---------|-------------|----------|
| Create Listing | Title, description, category, photos, pricing | Must Have |
| Multi-image Upload | Up to 10 images per listing via Cloudinary | Must Have |
| Pricing Options | Daily, weekly, monthly rates in PKR | Must Have |
| Security Deposit | Refundable deposit amount in PKR | Must Have |
| Availability Calendar | Mark available/unavailable dates | Must Have |
| Categories | Predefined categories with subcategories | Must Have |
| Location | City/area-based (no exact address publicly) | Must Have |
| Item Condition | New, Like New, Good, Fair | Must Have |
| Listing Management | Edit, pause, delete listings | Must Have |

### 4.3 Search & Discovery

| Feature | Description | Priority |
|---------|-------------|----------|
| Keyword Search | Search across listing titles and descriptions | Must Have |
| Category Filter | Filter by category/subcategory | Must Have |
| City Filter | Filter by Pakistani cities (Karachi, Lahore, Islamabad, etc.) | Must Have |
| Min Price Filter | Minimum price in PKR | Must Have |
| Max Price Filter | Maximum price in PKR | Must Have |
| Condition Filter | Filter by item condition (New, Like New, Good, Fair) | Must Have |
| Availability Filter | Filter by date range availability | Must Have |
| Sort by Newest | Sort listings by creation date | Must Have |
| Sort by Price | Sort by price ascending/descending | Must Have |
| Sort by Rating | Sort by owner rating | Must Have |
| Saved Items | Wishlist functionality | Should Have |

### 4.4 Booking System

| Feature | Description | Priority |
|---------|-------------|----------|
| Rental Request | Select dates, send request to owner | Must Have |
| Request Management | Owner accepts/declines requests | Must Have |
| Booking Lifecycle | PENDING → APPROVED → PAYMENT_PENDING → ACTIVE → COMPLETED → REVIEWED | Must Have |
| Additional Statuses | DECLINED, CANCELLED, EXPIRED | Must Have |
| Payment Method Selection | Cash or Bank Transfer for MVP | Must Have |
| Pickup Instructions | Shared after booking approved | Must Have |
| Booking History | View past and upcoming rentals | Must Have |
| Booking Notes | Renter can add notes to booking request | Must Have |

### 4.5 Payment System (MVP - Offline)

| Feature | Description | Priority |
|---------|-------------|----------|
| Payment Method Selection | Cash / Bank Transfer options | Must Have |
| Price Breakdown | Rental + deposit clearly shown in PKR | Must Have |
| Payment Instructions | Clear instructions for offline payment | Must Have |
| Payment Confirmation | Owner confirms payment received | Must Have |
| Deposit Return Tracking | Track deposit status | Should Have |

### 4.6 Communication (MVP)

| Feature | Description | Priority |
|---------|-------------|----------|
| Booking Notifications | Email/in-app for booking status updates | Must Have |
| Booking Notes | Notes attached to booking requests | Must Have |
| Status Alerts | Notifications for status changes | Must Have |

**Note:** Real-time messaging/chat is deferred to Phase 2. MVP communication is handled through booking notes and status notifications.

### 4.7 Reviews & Trust

| Feature | Description | Priority |
|---------|-------------|----------|
| Two-way Reviews | Renter reviews owner & vice versa | Must Have |
| Star Ratings | 1-5 stars with categories | Must Have |
| Review Display | Show on profiles and listings | Must Have |
| Review Moderation | Flag inappropriate reviews | Should Have |

### 4.8 User Dashboard

| Feature | Description | Priority |
|---------|-------------|----------|
| Owner Dashboard | Listing stats, earnings, requests | Must Have |
| Renter Dashboard | Active rentals, history, saved items | Must Have |
| Earnings Summary | Total earned in PKR | Must Have |
| Analytics | Basic stats (views, inquiries) | Should Have |

### 4.9 Admin Dashboard (MVP)

| Feature | Description | Priority |
|---------|-------------|----------|
| User Management | View, search, edit, suspend/ban users | Must Have |
| Listing Moderation | View, search, remove inappropriate listings | Must Have |
| Booking Management | View all bookings, track status | Must Have |
| Reported Listings | View and handle listing reports | Must Have |
| Reported Users | View and handle user reports | Must Have |
| Basic Reports | Platform statistics overview | Must Have |
| Report Resolution | Resolve/dismiss reports with notes | Must Have |

### 4.10 Reporting System (MVP)

| Feature | Description | Priority |
|---------|-------------|----------|
| Report Listing | Users can report inappropriate listings | Must Have |
| Report User | Users can report problematic users | Must Have |
| Report Reasons | Predefined reason categories | Must Have |
| Report Description | Optional detailed description | Should Have |
| Admin Visibility | Reports appear in Admin Dashboard | Must Have |

---

## 5. User Stories

### Authentication
- As a user, I want to sign up with email so I can create an account
- As a user, I want to sign in with Google so I can access quickly
- As a user, I want to reset my password if I forget it
- As a user, I want to verify my email to confirm my identity

### Listings
- As an owner, I want to create a listing with up to 10 photos so renters can see my item clearly
- As an owner, I want to set prices in PKR for daily/weekly rentals
- As an owner, I want to mark dates as unavailable when I need my item
- As an owner, I want to pause my listing temporarily without deleting it
- As an owner, I want to edit my listing details after publishing

### Search & Discovery
- As a renter, I want to search for items by keyword
- As a renter, I want to filter by category to find relevant items
- As a renter, I want to filter by city to find items in Karachi/Lahore/Islamabad
- As a renter, I want to filter by price in PKR to stay within budget
- As a renter, I want to save items to a wishlist for later

### Booking
- As a renter, I want to request specific rental dates
- As a renter, I want to choose Cash or Bank Transfer as payment method
- As an owner, I want to review requests before accepting
- As an owner, I want to decline requests that don't suit me
- As a renter, I want to see booking status updates
- As a renter, I want pickup details and payment instructions after confirmation
- As an owner, I want to confirm when I've received payment
- As a user, I want to cancel a booking with appropriate notice

### Communication
- As a renter, I want to add notes to my booking request to ask questions
- As a user, I want to receive notifications when booking status changes
- As a user, I want to report inappropriate listings or users

### Reporting
- As a user, I want to report a listing that violates guidelines
- As a user, I want to report a user who behaves inappropriately

### Reviews
- As a renter, I want to review the owner after a rental
- As an owner, I want to review the renter after a rental
- As a user, I want to see reviews before transacting

### Admin
- As an admin, I want to view all users and their activity
- As an admin, I want to suspend users who violate terms
- As an admin, I want to remove inappropriate listings
- As an admin, I want to view and manage reported content
- As an admin, I want to see platform-wide statistics

---

## 6. Success Metrics (KPIs)

### Primary Metrics

| Metric | Definition | MVP Target |
|--------|------------|------------|
| Monthly Active Users (MAU) | Unique users per month | 500+ |
| Listings Created | Total active listings | 200+ |
| Booking Conversion Rate | Requests → Confirmed bookings | >40% |
| Repeat Usage | Users with 2+ transactions | >25% |

### Secondary Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| Average Response Time | Time to first owner response | <4 hours |
| Listing Quality Score | Avg images + description length | >4 images, >100 chars |
| Review Rate | Completed rentals with reviews | >60% |
| City Distribution | Listings across Karachi, Lahore, Islamabad | Balanced growth |

### North Star Metric
**Successful Rentals per Month** - A "successful rental" is defined as a completed booking with positive reviews from both parties.

### Revenue Metrics (Post-MVP)
| Metric | Definition | Target |
|--------|------------|--------|
| Gross Merchandise Value (GMV) | Total rental value in PKR | Track growth |
| Platform Commission | Future revenue per transaction | 10-15% target |
| Average Transaction Value | Average booking value in PKR | PKR 2,000-5,000 |

---

## 7. Non-Functional Requirements

### Performance
- Page load time: <2 seconds (optimized for Pakistani internet speeds)
- Search results: <500ms
- Image upload: <5 seconds per image
- Support 1000+ concurrent users

### Security
- HTTPS everywhere
- Password hashing (bcrypt)
- Input sanitization (XSS, SQL injection prevention)
- Rate limiting on APIs
- Secure session management
- CNIC/ID data encrypted (future)

### Scalability
- Horizontal scaling support
- Database indexing for search
- CDN for static assets (Cloudinary)
- Serverless-ready (Vercel)

### Accessibility
- WCAG 2.1 AA compliance
- Keyboard navigation
- Screen reader support
- Color contrast compliance

### Reliability
- 99.5% uptime target
- Graceful error handling
- Data backup strategy (daily)

### Localization
- Currency: PKR with proper formatting (Rs. 1,500)
- Timezone: Asia/Karachi (PKT)
- Date format: DD/MM/YYYY
- Phone format: +92 XXX XXXXXXX

---

## 8. Out of Scope (MVP)

The following features are intentionally excluded from MVP:

1. **Online Payment Processing** - MVP uses Cash/Bank Transfer only
2. **Real-time Messaging/Chat** - MVP uses booking notes; full chat in Phase 2
3. **Insurance Coverage** - Future partnership with Pakistani insurance providers
4. **CNIC Verification** - Government ID verification via NADRA (future)
5. **Phone OTP Verification** - Future enhancement
6. **Delivery/Shipping** - MVP focuses on local pickup only
7. **Mobile Apps** - Web-first, responsive design for mobile
8. **Advanced Analytics** - Detailed owner analytics dashboard
9. **Subscription Plans** - Premium features for power users
10. **Multi-language Support** - English only (Urdu in future)
11. **In-app Payments** - JazzCash/Easypaisa integration (Phase 2)

---

## 9. Assumptions & Dependencies

### Assumptions
- Users have smartphones or computers with internet access
- Users are comfortable with Cash or Bank Transfer payments
- Local pickup within same city is acceptable for MVP users
- Email is sufficient for critical communications
- English interface is acceptable for initial urban users
- Pakistani banking infrastructure supports basic transfers

### Dependencies
- Cloudinary for image storage and optimization
- PostgreSQL database availability
- Vercel for hosting and deployment
- Auth.js for authentication providers
- Future: Pakistani payment gateways (JazzCash, Easypaisa, Safepay)
- Future: Resend for transactional emails

### Market Dependencies
- Stable internet connectivity in major Pakistani cities
- Growing trust in peer-to-peer transactions
- Mobile wallet adoption continues to grow

---

## 10. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Low initial supply (listings) | High | Medium | Seed with team/friend listings in Karachi/Lahore; incentivize early listers |
| Trust issues between strangers | High | Medium | Verification badges, reviews, security deposits, future CNIC verification |
| Item damage/theft | High | Low | Security deposits in PKR, user verification, future insurance |
| Offline payment fraud | Medium | Medium | Payment confirmation flow, user ratings, deposit requirements |
| Low search volume | Medium | Medium | SEO, social sharing (WhatsApp), referral program |
| Technical scaling issues | Medium | Low | Serverless architecture, CDN, database optimization |
| Internet connectivity issues | Low | Medium | Optimize for slower connections, image compression |

---

## 11. Future Roadmap (Post-MVP)

### Phase 2: Trust & Payments
- JazzCash / Easypaisa integration
- Safepay / PayFast integration
- In-app payment with escrow
- Real-time messaging/chat system
- Phone OTP verification
- CNIC verification (NADRA integration)
- Advanced identity verification

### Phase 3: Growth
- Mobile applications (React Native)
- Urdu language support
- Delivery partner integration (Bykea, Careem)
- Business accounts for rental shops
- Subscription plans for power users

### Phase 4: Expansion
- Multi-city expansion (Faisalabad, Peshawar, Multan)
- Stripe for international users
- Advanced analytics dashboard
- API for third-party integrations
- Insurance partnerships (EFU, Jubilee)

---

## Appendix A: Category Taxonomy

```
Electronics
├── Cameras & Photography
│   ├── DSLR Cameras
│   ├── Mirrorless Cameras
│   ├── Lenses
│   ├── Tripods & Stabilizers
│   └── Lighting Equipment
├── Audio Equipment
│   ├── Speakers & Sound Systems
│   ├── Microphones
│   ├── DJ Equipment
│   └── Musical Instruments
├── Gaming
│   ├── PlayStation / Xbox Consoles
│   ├── VR Headsets
│   └── Gaming Accessories
├── Computers
│   ├── Laptops
│   ├── Monitors
│   └── Projectors
└── Drones

Tools & Equipment
├── Power Tools
├── Hand Tools
├── Garden Equipment
├── Cleaning Equipment (Pressure Washers, etc.)
└── Construction Equipment

Sports & Outdoors
├── Camping Gear (Northern Areas trips)
├── Bicycles
├── Cricket Equipment
├── Fitness Equipment
└── Hiking & Trekking Gear

Events & Party (Shaadi/Mehendi)
├── Decorations & Lighting
├── Furniture (Chairs, Tables)
├── Catering Equipment
├── Tents & Canopies (Shamiyana)
├── Sound Systems
└── Stage Equipment

Vehicles
├── Bicycles
├── Scooters
└── Trailers

Home & Living
├── Furniture
├── Appliances (Generators, ACs)
└── Baby Gear

Fashion & Accessories
├── Designer Wear (Bridal, Formal)
├── Costumes
├── Jewelry
└── Bags & Luggage
```

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| Owner | User who lists items for rent |
| Renter | User who rents items from owners |
| Listing | An item posted for rent |
| Booking | A rental transaction/reservation |
| Security Deposit | Refundable amount (Advance/Security in PKR) held against damage |
| Trust Score | Calculated reputation based on reviews |
| PKR | Pakistani Rupee |
| PKT | Pakistan Standard Time (Asia/Karachi, UTC+5) |

---

## Appendix C: Pakistani Cities (Initial Launch)

| City | Priority | Population | Notes |
|------|----------|------------|-------|
| Karachi | Tier 1 | 16M+ | Largest city, diverse demand |
| Lahore | Tier 1 | 13M+ | Cultural hub, events market |
| Islamabad | Tier 1 | 2M+ | Tech-savvy, higher income |
| Rawalpindi | Tier 2 | 2M+ | Twin city with Islamabad |

---

*Document End*
