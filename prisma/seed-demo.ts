// ============================================================================
// SamaanShare - Demo Data Seed (development only)
// ============================================================================
// Seeds sample owners and listings so the marketplace UI can be built and
// reviewed against visible data. Browse, search, filters, sorting and
// pagination are all unverifiable against an empty table - the empty state is
// the only branch an empty database can exercise.
//
// This is the counterpart to prisma/seed.ts, and the split is deliberate. That
// file seeds the taxonomy, which is reference data every environment needs
// including production. This file seeds pretend content, which no production
// database should ever contain - hence the NODE_ENV guard in main().
//
// Requires the taxonomy seed to have run first: every listing resolves its
// category by slug and the script fails loudly if one is missing.
//
// Idempotent by construction. Every row carries an explicit `demo-` prefixed id
// rather than a generated cuid, so re-running upserts the same rows instead of
// duplicating them. The script is also declarative: listings with a `demo-`
// id that this file no longer defines are deleted, so editing the array below
// and re-running converges the database on it.
//
// Run with: npm run db:seed:demo
// ============================================================================

import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

import { ItemCondition, ListingStatus } from "../src/generated/prisma/enums";
import { PrismaClient } from "../src/generated/prisma/client";

dotenv.config({ path: [".env.local", ".env"], quiet: true });

/**
 * Sample owners.
 *
 * `password` is left null on purpose: these accounts exist to own listings, and
 * a null hash means the credentials provider cannot authenticate them at all.
 * Seeding a known password would put working logins into every developer's
 * database, and eventually into one that is reachable from outside.
 *
 * `example.com` is reserved by IANA and can never receive mail, so an accidental
 * notification send cannot reach a real inbox.
 *
 * The ratings are set directly rather than derived from seeded reviews, because
 * `ratingAverage` is the denormalised aggregate the schema's P8 note describes -
 * it is what "sort by rating" actually orders on. The three owners are
 * deliberately unequal, and one is left unrated: without a null in the set,
 * nulls-last ordering cannot be observed, and without two distinct values the
 * rating sort is indistinguishable from the newest sort.
 */
const DEMO_OWNERS = [
  {
    id: "demo-owner-ayesha",
    name: "Ayesha Khan",
    email: "ayesha.demo@example.com",
    city: "karachi",
    ratingAverage: 4.3,
    ratingCount: 8,
  },
  {
    id: "demo-owner-bilal",
    name: "Bilal Ahmed",
    email: "bilal.demo@example.com",
    city: "lahore",
    ratingAverage: 4.9,
    ratingCount: 20,
  },
  {
    id: "demo-owner-hassan",
    name: "Hassan Raza",
    email: "hassan.demo@example.com",
    city: "islamabad",
    // Unrated on purpose - proves nulls sort last rather than first.
    ratingAverage: null,
    ratingCount: 0,
  },
] as const;

interface DemoListing {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  categorySlug: string;
  subcategorySlug: string | null;
  condition: ItemCondition;
  pricePerDay: number;
  /**
   * Optional longer-term rates, as the schema allows.
   *
   * Only some listings set them, on purpose: the detail page's pricing breakdown
   * has to render correctly both with and without them, and a fixture where every
   * row is fully populated never exercises the absent case.
   */
  pricePerWeek?: number;
  pricePerMonth?: number;
  securityDeposit: number;
  /**
   * How many cover images to attach. Defaults to 1.
   *
   * A couple of listings carry more so the detail gallery's thumbnail strip and
   * image switching are exercised by real data rather than assumed.
   */
  imageCount?: number;
  city: string;
  area: string | null;
  /** Omitted means ACTIVE. The non-active rows prove browse filters them out. */
  status?: ListingStatus;
  /**
   * Fixed ISO timestamps, newest first in this array.
   *
   * Hardcoded rather than computed from the current time so that re-running the
   * seed does not reshuffle "sort by newest" and so two developers comparing
   * screens see the same order.
   */
  createdAt: string;
}

/**
 * Fourteen ACTIVE listings plus three that must never appear in browse.
 *
 * Fourteen is not arbitrary: LISTINGS_PAGE_SIZE is 12, so this spills onto a
 * second page and makes the pagination control testable. Cities, conditions,
 * categories and prices are spread deliberately so every filter and sort option
 * has more than one distinct value to act on.
 */
const DEMO_LISTINGS: DemoListing[] = [
  {
    id: "demo-listing-01",
    ownerId: "demo-owner-ayesha",
    title: "Canon EOS R6 Mirrorless Camera with 24-105mm Lens",
    description:
      "Full-frame mirrorless body with the 24-105mm f/4 kit lens, two batteries and a 64GB card. Ideal for weddings and shoots around Karachi. Handled carefully, no dents or fungus.",
    categorySlug: "electronics",
    subcategorySlug: "cameras",
    condition: ItemCondition.LIKE_NEW,
    pricePerDay: 6500,
    pricePerWeek: 35000,
    pricePerMonth: 120000,
    securityDeposit: 40000,
    imageCount: 3,
    city: "karachi",
    area: "DHA Phase 6",
    createdAt: "2026-08-01T09:00:00.000Z",
  },
  {
    id: "demo-listing-02",
    ownerId: "demo-owner-bilal",
    title: "DJI Mini 3 Pro Drone with Extra Batteries",
    description:
      "Lightweight drone under the 250g limit, comes with three batteries, ND filters and a carry case. Great for property and event videography.",
    categorySlug: "electronics",
    subcategorySlug: "drones",
    condition: ItemCondition.GOOD,
    pricePerDay: 4500,
    securityDeposit: 30000,
    city: "lahore",
    area: "Gulberg III",
    createdAt: "2026-07-30T11:30:00.000Z",
  },
  {
    id: "demo-listing-03",
    ownerId: "demo-owner-hassan",
    title: "Honda 3.5 KVA Petrol Generator",
    description:
      "Reliable backup for load-shedding or an outdoor event. Recently serviced, new spark plug, runs quiet. Fuel not included.",
    categorySlug: "tools",
    subcategorySlug: "generators",
    condition: ItemCondition.GOOD,
    pricePerDay: 3000,
    pricePerMonth: 60000,
    securityDeposit: 20000,
    city: "islamabad",
    area: "F-11",
    createdAt: "2026-07-29T08:15:00.000Z",
  },
  {
    id: "demo-listing-04",
    ownerId: "demo-owner-ayesha",
    title: "Bosch Professional Rotary Hammer Drill",
    description:
      "SDS-plus rotary hammer for concrete and masonry. Includes a bit set and side handle. Suited to renovation work, not light picture-hanging.",
    categorySlug: "tools",
    subcategorySlug: "power-tools",
    condition: ItemCondition.GOOD,
    pricePerDay: 1200,
    securityDeposit: 8000,
    city: "karachi",
    area: "Gulshan-e-Iqbal",
    createdAt: "2026-07-27T14:45:00.000Z",
  },
  {
    id: "demo-listing-05",
    ownerId: "demo-owner-bilal",
    title: "Complete Camping Setup for Four People",
    description:
      "Four-person waterproof tent, two sleeping bags, folding chairs, a gas stove and a lantern. Used on trips to Fairy Meadows and returned clean.",
    categorySlug: "sports",
    subcategorySlug: "camping",
    condition: ItemCondition.GOOD,
    pricePerDay: 2200,
    pricePerWeek: 12000,
    securityDeposit: 12000,
    imageCount: 2,
    city: "lahore",
    area: "Model Town",
    createdAt: "2026-07-26T16:00:00.000Z",
  },
  {
    id: "demo-listing-06",
    ownerId: "demo-owner-hassan",
    title: "Trek Marlin 7 Mountain Bike (Medium Frame)",
    description:
      "Hardtail with hydraulic disc brakes and a recently trued wheelset. Medium frame, suits riders around 5'7\" to 5'11\". Helmet included.",
    categorySlug: "sports",
    subcategorySlug: "bicycles",
    condition: ItemCondition.LIKE_NEW,
    pricePerDay: 1500,
    securityDeposit: 15000,
    city: "islamabad",
    area: "Bahria Enclave",
    createdAt: "2026-07-25T07:20:00.000Z",
  },
  {
    id: "demo-listing-07",
    ownerId: "demo-owner-ayesha",
    title: "Professional PA Sound System with Two Speakers",
    description:
      "Two 15-inch powered speakers, a six-channel mixer, two wireless microphones and all cabling. Enough coverage for a hall of about 200 guests.",
    categorySlug: "events",
    subcategorySlug: "sound",
    condition: ItemCondition.GOOD,
    pricePerDay: 5500,
    securityDeposit: 25000,
    city: "karachi",
    area: "Clifton",
    createdAt: "2026-07-24T12:00:00.000Z",
  },
  {
    id: "demo-listing-08",
    ownerId: "demo-owner-bilal",
    title: "Fairy Light Curtain and Mandap Decoration Set",
    description:
      "Warm-white curtain lights, drapes and artificial floral panels for a mehndi or nikah stage. Includes extension leads and clips.",
    categorySlug: "events",
    subcategorySlug: "decorations",
    condition: ItemCondition.GOOD,
    pricePerDay: 3500,
    securityDeposit: 10000,
    city: "lahore",
    area: "Johar Town",
    createdAt: "2026-07-22T10:10:00.000Z",
  },
  {
    id: "demo-listing-09",
    ownerId: "demo-owner-hassan",
    title: "Honda CD 70 Motorcycle",
    description:
      "Economical commuter, documents clear and tax paid. Rented with a helmet. Valid licence required at handover.",
    categorySlug: "vehicles",
    subcategorySlug: "motorcycles",
    condition: ItemCondition.FAIR,
    pricePerDay: 900,
    securityDeposit: 25000,
    city: "islamabad",
    area: "G-9",
    createdAt: "2026-07-21T09:40:00.000Z",
  },
  {
    id: "demo-listing-10",
    ownerId: "demo-owner-ayesha",
    title: "Designer Bridal Lehenga (Size Medium)",
    description:
      "Hand-embroidered maroon and gold lehenga worn once, professionally dry-cleaned. Includes dupatta and matching clutch. Minor alterations possible.",
    categorySlug: "fashion",
    subcategorySlug: "bridal",
    condition: ItemCondition.LIKE_NEW,
    pricePerDay: 12000,
    securityDeposit: 60000,
    city: "karachi",
    area: "PECHS",
    createdAt: "2026-07-19T13:25:00.000Z",
  },
  {
    id: "demo-listing-11",
    ownerId: "demo-owner-bilal",
    title: "PlayStation 5 with Two Controllers",
    description:
      "Disc edition with two DualSense controllers and three games. Cleaned and reset between rentals. Not for shipping - collection only.",
    categorySlug: "electronics",
    subcategorySlug: "gaming",
    condition: ItemCondition.LIKE_NEW,
    pricePerDay: 2500,
    securityDeposit: 35000,
    city: "lahore",
    area: "DHA Phase 5",
    createdAt: "2026-07-18T15:50:00.000Z",
  },
  {
    id: "demo-listing-12",
    ownerId: "demo-owner-hassan",
    title: "Baby Stroller and Travel Cot Bundle",
    description:
      "Foldable stroller with a rain cover plus a compact travel cot. Both sanitised. Convenient for visiting family without hauling your own.",
    categorySlug: "home",
    subcategorySlug: "baby",
    condition: ItemCondition.GOOD,
    pricePerDay: 700,
    securityDeposit: 5000,
    city: "islamabad",
    area: "E-11",
    createdAt: "2026-07-17T08:05:00.000Z",
  },
  {
    id: "demo-listing-13",
    ownerId: "demo-owner-ayesha",
    title: "Brand New Pressure Washer, 150 Bar",
    description:
      "Still boxed, used twice. Comes with three nozzles and a patio attachment. Handles a car, a driveway or a rooftop water tank.",
    categorySlug: "tools",
    subcategorySlug: "cleaning",
    condition: ItemCondition.NEW,
    pricePerDay: 1800,
    securityDeposit: 9000,
    city: "karachi",
    area: "North Nazimabad",
    createdAt: "2026-07-15T11:15:00.000Z",
  },
  {
    id: "demo-listing-14",
    ownerId: "demo-owner-bilal",
    title: "Folding Banquet Tables and Twenty Chairs",
    description:
      "Four six-foot tables with twenty stackable chairs, plus white covers. Delivery within Lahore can be arranged for an extra charge.",
    categorySlug: "events",
    subcategorySlug: "furniture",
    condition: ItemCondition.FAIR,
    pricePerDay: 2800,
    securityDeposit: 8000,
    city: "lahore",
    area: "Faisal Town",
    createdAt: "2026-07-14T09:30:00.000Z",
  },

  // ---------------------------------------------------------------------------
  // Not visible in browse. These exist so the visibility rule in
  // getActiveListings is exercised by real rows rather than assumed: if any of
  // the three ever shows up on /listings, the query filter has regressed.
  // ---------------------------------------------------------------------------
  {
    id: "demo-listing-90-draft",
    ownerId: "demo-owner-ayesha",
    title: "DRAFT - Unfinished Espresso Machine Listing",
    description:
      "A half-written draft. Must never appear in public browse results.",
    categorySlug: "home",
    subcategorySlug: "appliances",
    condition: ItemCondition.GOOD,
    pricePerDay: 1500,
    securityDeposit: 10000,
    city: "karachi",
    area: null,
    status: ListingStatus.DRAFT,
    createdAt: "2026-08-02T10:00:00.000Z",
  },
  {
    id: "demo-listing-91-paused",
    ownerId: "demo-owner-bilal",
    title: "PAUSED - Projector Temporarily Unavailable",
    description:
      "Paused by its owner while travelling. Must never appear in public browse results.",
    categorySlug: "electronics",
    subcategorySlug: "audio",
    condition: ItemCondition.GOOD,
    pricePerDay: 2000,
    securityDeposit: 12000,
    city: "lahore",
    area: null,
    status: ListingStatus.PAUSED,
    createdAt: "2026-08-02T11:00:00.000Z",
  },
  {
    id: "demo-listing-92-deleted",
    ownerId: "demo-owner-hassan",
    title: "DELETED - Removed Treadmill Listing",
    description:
      "Soft-deleted per schema decision D3. Must never appear in public browse results.",
    categorySlug: "sports",
    subcategorySlug: "fitness",
    condition: ItemCondition.FAIR,
    pricePerDay: 1000,
    securityDeposit: 6000,
    city: "islamabad",
    area: null,
    status: ListingStatus.DELETED,
    createdAt: "2026-08-02T12:00:00.000Z",
  },
];

/**
 * Blocked calendar days, so the availability filter has something to exclude.
 *
 * Without at least one of these, `?from=&to=` matches every listing and the
 * filter looks like it works while never actually excluding anything - the same
 * trap an empty listings table set for browse.
 *
 * All are owner-blocked (`bookingId` null). Dates held by a confirmed booking
 * also live in this table, but creating those means creating bookings, which is
 * a later phase.
 */
const DEMO_UNAVAILABLE_DATES: readonly { listingId: string; date: string }[] = [
  // A three-day block on the camera, for testing a range that overlaps.
  { listingId: "demo-listing-01", date: "2026-08-10" },
  { listingId: "demo-listing-01", date: "2026-08-11" },
  { listingId: "demo-listing-01", date: "2026-08-12" },
  // A single day on the camping gear, for testing an exact-day match.
  { listingId: "demo-listing-05", date: "2026-08-11" },
  // Far from the others, so a narrow window excludes this listing alone.
  { listingId: "demo-listing-09", date: "2026-09-01" },
];

/*
 * `demoImageUrl()` used to live here, returning a picsum.photos URL seeded by
 * listing id. It is gone along with the host it pointed at - see the note beside
 * the `listingImage.deleteMany` in `seedListings()` for why re-adding either one
 * without the other produces a 500 on every page that renders a listing.
 */

function createSeedClient() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string."
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: ["warn", "error"],
  });
}

const prisma = createSeedClient();

/** Maps every seeded category and subcategory slug to its id, once. */
async function resolveTaxonomy() {
  const categories = await prisma.category.findMany({
    select: {
      id: true,
      slug: true,
      subcategories: { select: { id: true, slug: true } },
    },
  });

  if (categories.length === 0) {
    throw new Error(
      "No categories found. Run `npm run db:seed` first - demo listings reference the taxonomy by slug."
    );
  }

  const categoryIds = new Map<string, string>();
  // Subcategory slugs are unique only within a category, so the key has to be
  // the pair. "bicycles" exists under both sports and vehicles.
  const subcategoryIds = new Map<string, string>();

  for (const category of categories) {
    categoryIds.set(category.slug, category.id);

    for (const subcategory of category.subcategories) {
      subcategoryIds.set(
        `${category.slug}/${subcategory.slug}`,
        subcategory.id
      );
    }
  }

  return { categoryIds, subcategoryIds };
}

async function seedOwners() {
  for (const owner of DEMO_OWNERS) {
    await prisma.user.upsert({
      where: { id: owner.id },
      create: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        city: owner.city,
        // `ownerRating*`, not the old undirected `rating*`: migration
        // 20260817090000_split_rating_aggregate_by_direction split the aggregate in
        // two, and these three exist to own listings. `listings.ts:295` sorts browse
        // on `owner.ownerRatingAverage`, so this is the column the rating sort reads.
        // The renter-side aggregate is deliberately left at its default - nobody has
        // rented anything to these accounts.
        ownerRatingAverage: owner.ratingAverage,
        ownerRatingCount: owner.ratingCount,
        // Marks the account as usable without sending a verification mail. These
        // users never sign in, so nothing here grants access.
        emailVerified: new Date("2026-07-01T00:00:00.000Z"),
      },
      update: {
        name: owner.name,
        city: owner.city,
        ownerRatingAverage: owner.ratingAverage,
        ownerRatingCount: owner.ratingCount,
      },
      select: { id: true },
    });
  }

  return DEMO_OWNERS.length;
}

async function seedListings() {
  const { categoryIds, subcategoryIds } = await resolveTaxonomy();

  for (const listing of DEMO_LISTINGS) {
    const categoryId = categoryIds.get(listing.categorySlug);

    if (!categoryId) {
      throw new Error(
        `Category "${listing.categorySlug}" not found for ${listing.id}. Run \`npm run db:seed\` first.`
      );
    }

    const subcategoryId = listing.subcategorySlug
      ? (subcategoryIds.get(
          `${listing.categorySlug}/${listing.subcategorySlug}`
        ) ?? null)
      : null;

    const status = listing.status ?? ListingStatus.ACTIVE;

    const data = {
      ownerId: listing.ownerId,
      title: listing.title,
      description: listing.description,
      categoryId,
      subcategoryId,
      condition: listing.condition,
      pricePerDay: listing.pricePerDay,
      // `?? null` rather than omitting the key: on the update branch an omitted
      // field leaves the old value in place, so a rate removed from this file
      // would linger in the database and the seed would stop being declarative.
      pricePerWeek: listing.pricePerWeek ?? null,
      pricePerMonth: listing.pricePerMonth ?? null,
      securityDeposit: listing.securityDeposit,
      city: listing.city,
      area: listing.area,
      status,
      // D3 pairs the DELETED status with a deletedAt stamp. Setting one without
      // the other is exactly the inconsistency getActiveListings guards against,
      // so the demo data must not create it.
      deletedAt:
        status === ListingStatus.DELETED
          ? new Date("2026-08-02T12:30:00.000Z")
          : null,
      createdAt: new Date(listing.createdAt),
    };

    await prisma.listing.upsert({
      where: { id: listing.id },
      create: { id: listing.id, ...data },
      update: data,
      select: { id: true },
    });

    /**
     * NO IMAGES ARE SEEDED, and that is the whole reason this file could come back.
     *
     * It used to attach picsum.photos URLs. That host was removed from
     * `images.remotePatterns` in next.config.ts before the first deploy, and
     * `next/image` does not degrade to a broken image for an unconfigured host - it
     * THROWS during server render. Seeding those URLs again would turn every browse
     * page, category page and listing detail page into a 500. The image data and the
     * remote-pattern allowlist have to move together, which is precisely what the
     * config comment warns about.
     *
     * So the demo listings carry no photos, and `listing-card.tsx` renders its
     * `ImageOffIcon` tile for them. That is a placeholder in the UI rather than a
     * security boundary widened for fixtures.
     *
     * `imageCount` is kept on `DemoListing` as a record of which listings were meant
     * to exercise the multi-image gallery. Attaching real images to those is a
     * Cloudinary upload through `/listings/new`, not a seed.
     */
    await prisma.listingImage.deleteMany({
      where: { listingId: listing.id },
    });
  }

  return DEMO_LISTINGS.length;
}

/**
 * Replaces the owner-blocked dates on demo listings.
 *
 * Delete-then-insert rather than upsert: the set is small, and clearing it first
 * means a date removed from the array above actually disappears. Scoped to
 * `bookingId: null` so it can never delete a date a booking is holding - that row
 * belongs to the booking's lifecycle, not to this seed.
 */
async function seedUnavailableDates() {
  await prisma.unavailableDate.deleteMany({
    where: {
      listingId: { startsWith: "demo-listing-" },
      bookingId: null,
    },
  });

  const { count } = await prisma.unavailableDate.createMany({
    data: DEMO_UNAVAILABLE_DATES.map((entry) => ({
      listingId: entry.listingId,
      // UTC midnight to match the @db.Date column, which stores a calendar day
      // with no time or offset.
      date: new Date(`${entry.date}T00:00:00.000Z`),
      reason: "owner_blocked",
    })),
  });

  return count;
}

/**
 * Removes `demo-` listings this file no longer defines.
 *
 * What makes the seed declarative rather than additive: delete an entry above,
 * re-run, and the row goes away instead of lingering as orphaned demo content
 * nobody remembers creating. Images cascade with their listing.
 *
 * This will fail if a demo listing has acquired a booking, because that foreign
 * key is Restrict - which is the correct outcome. Deleting a listing out from
 * under a booking would corrupt the booking, and the error says so.
 */
async function pruneRemovedListings() {
  const { count } = await prisma.listing.deleteMany({
    where: {
      id: {
        startsWith: "demo-listing-",
        notIn: DEMO_LISTINGS.map((l) => l.id),
      },
    },
  });

  return count;
}

async function main() {
  // Demo content in production is a data-integrity problem, not a cosmetic one:
  // these listings are indistinguishable from real inventory to a visitor.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed demo data with NODE_ENV=production. This script is for development databases only."
    );
  }

  console.log("Seeding demo owners and listings...");

  const owners = await seedOwners();
  const listings = await seedListings();
  const blockedDates = await seedUnavailableDates();
  const pruned = await pruneRemovedListings();

  // Counted from the database with the same filter the browse query uses, so
  // this is a real check that the visibility rule holds - not a restatement of
  // the array above.
  const [totalListings, browsableListings, images] = await Promise.all([
    prisma.listing.count({ where: { id: { startsWith: "demo-listing-" } } }),
    prisma.listing.count({
      where: { status: ListingStatus.ACTIVE, deletedAt: null },
    }),
    prisma.listingImage.count({
      where: { listingId: { startsWith: "demo-listing-" } },
    }),
  ]);

  console.log(`\nUpserted ${owners} owners and ${listings} listings.`);

  if (pruned > 0) {
    console.log(
      `Pruned ${pruned} demo listings no longer defined in this file.`
    );
  }

  console.log(
    `Database now holds ${totalListings} demo listings (${images} images), of which ${browsableListings} are visible in browse.`
  );
  console.log(`Blocked ${blockedDates} calendar days across demo listings.`);
}

// No top-level await: the package has no "type": "module", so tsx runs this file
// as CommonJS where top-level await is a syntax error.
main()
  .catch((error: unknown) => {
    console.error("Demo seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
