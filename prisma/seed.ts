// ============================================================================
// SamaanShare - Database Seed
// ============================================================================
// Seeds the browse taxonomy only: Category and Subcategory.
//
// Source of truth: docs/DATABASE.md section 5 (Architecture Locked v1.0).
//
// Deliberately NOT seeded: users, listings, bookings, payments, reviews or any
// other demo data. The taxonomy is reference data the application cannot boot
// without - every listing carries a categoryId - so it belongs in every
// environment, including production. Sample content does not.
//
// The script is idempotent: it upserts on the natural keys (Category.slug and
// the composite Subcategory categoryId+slug), so running it twice inserts
// nothing the second time and never duplicates a row. Renaming a category in
// this file and re-running updates the existing row instead of creating a new
// one, which keeps listing foreign keys intact.
//
// Run with: npm run db:seed
// ============================================================================

import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";

// When `prisma db seed` spawns this script the CLI has already loaded the env
// files via prisma.config.ts and the child process inherits them. Loading again
// here costs nothing (dotenv never overwrites an existing process.env value) and
// makes `tsx prisma/seed.ts` work standalone.
dotenv.config({ path: [".env.local", ".env"], quiet: true });

/**
 * The category tree, exactly as locked in docs/DATABASE.md section 5.
 *
 * `icon` values are Lucide icon names, resolved at render time by the category
 * UI. Subcategory slugs are unique only *within* a category - "bicycles" appears
 * under both Sports and Vehicles, "furniture" under both Events and Home - which
 * is what Subcategory's @@unique([categoryId, slug]) permits and a global unique
 * would have forbidden.
 */
const CATEGORY_SEED = [
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
] as const;

/**
 * A dedicated client for the seed process.
 *
 * Not src/lib/prisma.ts: that module is built for the Next.js runtime - it
 * caches a client on globalThis to survive hot reloads, logs every query in
 * development, and never disconnects. A one-shot CLI script wants the opposite
 * on all three counts.
 *
 * Uses DIRECT_URL when present, matching prisma.config.ts. Seeding is plain DML
 * that Neon's pooled endpoint would serve fine, but the seed runs immediately
 * after `migrate dev`, and going through the same endpoint as the migration
 * avoids reading from a pooled connection that has not yet caught up.
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

async function seedTaxonomy() {
  let categoriesUpserted = 0;
  let subcategoriesUpserted = 0;

  // Sequential rather than Promise.all: the seed is not on any latency budget,
  // and a serial loop keeps the log readable and the connection count at one.
  for (const { name, slug, icon, subcategories } of CATEGORY_SEED) {
    const category = await prisma.category.upsert({
      where: { slug },
      create: { name, slug, icon },
      // `slug` is the identity here, so it is the one field never updated.
      update: { name, icon },
      select: { id: true },
    });
    categoriesUpserted += 1;

    for (const subcategory of subcategories) {
      await prisma.subcategory.upsert({
        where: {
          categoryId_slug: {
            categoryId: category.id,
            slug: subcategory.slug,
          },
        },
        create: {
          categoryId: category.id,
          name: subcategory.name,
          slug: subcategory.slug,
        },
        update: { name: subcategory.name },
        select: { id: true },
      });
      subcategoriesUpserted += 1;
    }

    console.log(`  ${slug.padEnd(12)} ${subcategories.length} subcategories`);
  }

  return { categoriesUpserted, subcategoriesUpserted };
}

async function main() {
  console.log("Seeding taxonomy (categories + subcategories)...");

  const { categoriesUpserted, subcategoriesUpserted } = await seedTaxonomy();

  // Read the counts back from the database rather than trusting the loop: this
  // is the actual verification that the rows are committed and visible.
  const [categoryCount, subcategoryCount] = await Promise.all([
    prisma.category.count(),
    prisma.subcategory.count(),
  ]);

  console.log(
    `\nUpserted ${categoriesUpserted} categories and ${subcategoriesUpserted} subcategories.`
  );
  console.log(
    `Database now holds ${categoryCount} categories and ${subcategoryCount} subcategories.`
  );

  // A mismatch means something outside this file wrote to the taxonomy tables.
  // Worth surfacing, not worth failing the seed over.
  if (
    categoryCount !== categoriesUpserted ||
    subcategoryCount !== subcategoriesUpserted
  ) {
    console.warn(
      "Warning: row counts differ from the seed definition - the taxonomy tables contain rows this file does not define."
    );
  }
}

// No top-level await: the package has no "type": "module", so tsx runs this file
// as CommonJS where top-level await is a syntax error.
main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    // Non-zero exit so `prisma migrate dev` and CI treat a failed seed as a
    // failed command instead of continuing.
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
