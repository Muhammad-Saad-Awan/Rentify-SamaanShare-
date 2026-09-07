// ============================================================================
// SamaanShare - Reclaim abandoned uploads
// ============================================================================
// The create-listing form uploads photos to Cloudinary BEFORE the listing exists,
// because a signed direct upload is the only way ten files avoid the Server Action
// body limit. The consequence is unavoidable rather than a bug: anyone who uploads
// photos and then closes the tab leaves files in `samaanshare/pending/{userId}` with
// no database row pointing at them. Nothing in a request/response cycle can clean
// those up - the user is gone.
//
// So this runs out of band. It lists the pending tree, keeps anything the database
// still references - a listing photo, a handover record's condition photo, or a damage
// claim's evidence - keeps anything newer than the cutoff (a form open in another tab is
// still in progress), and deletes the rest.
//
// WHAT IT MUST KNOW ABOUT is the whole of `findReferencedPublicIds`. A feature that
// stores a pending public id and is not listed there has its photos deleted 24h later.
//
// DRY RUN BY DEFAULT. Pass --delete to actually destroy, and --hours=N to change the
// cutoff. Deleting is irreversible, so the default is the safe one.
//
//   npm run cleanup:uploads              # report only
//   npm run cleanup:uploads -- --delete  # reclaim
// ============================================================================

import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  destroyImage,
  listUploadsByPrefix,
  PENDING_UPLOAD_ROOT,
} from "../src/lib/cloudinary";
import { findReferencedPublicIds } from "../src/lib/uploads/referenced-ids";

/**
 * Fallback only. The npm script passes `--env-file=.env.local`, and it has to: this
 * module's own imports reach `@/config/env`, which validates at module load, and ES
 * imports are hoisted above this call - so by the time `dotenv` runs, the validation
 * has already thrown. Running `tsx scripts/cleanup-pending-uploads.ts` directly, without
 * the flag, fails for exactly that reason. Kept for the `.env` case, which
 * `--env-file` does not cover.
 */
dotenv.config({ path: [".env.local", ".env"], quiet: true });

/**
 * Default grace period.
 *
 * Generous on purpose: a partly-filled form left open overnight is a real thing, and
 * deleting its photos would silently break a submission that is still coming. The cost
 * of waiting is a little storage; the cost of being wrong is a broken listing.
 */
const DEFAULT_HOURS = 24;

function createClient() {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: ["warn", "error"],
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const hoursArg = args.find((arg) => arg.startsWith("--hours="));
  const parsed = hoursArg ? Number(hoursArg.split("=")[1]) : Number.NaN;

  return {
    shouldDelete: args.includes("--delete"),
    hours: Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_HOURS,
  };
}

async function main() {
  const { shouldDelete, hours } = parseArgs();
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const prisma = createClient();

  console.log(
    `Scanning ${PENDING_UPLOAD_ROOT}/ for assets older than ${hours}h that nothing references...`
  );
  console.log(shouldDelete ? "Mode: DELETE" : "Mode: dry run (pass --delete)");

  // Every page, not just the first: the whole point is to find an accumulated backlog.
  const uploads = [];
  let cursor: string | undefined;

  do {
    const page = await listUploadsByPrefix(`${PENDING_UPLOAD_ROOT}/`, cursor);
    uploads.push(...page.uploads);
    cursor = page.nextCursor;
  } while (cursor);

  console.log(`Found ${uploads.length} asset(s) under the pending prefix.`);

  if (uploads.length === 0) {
    await prisma.$disconnect();

    return;
  }

  /**
   * Which of these the database still needs.
   *
   * EVERY table that stores a pending public id, not just `ListingImage`. That list is
   * kept in `findReferencedPublicIds`, next to the function that mints these ids, because
   * this job destroys anything it is not told about: for a period this script knew only
   * about listings, and handover and damage-claim photos - evidence in disputes over
   * deposits - were eligible for deletion a day after they were uploaded.
   */
  const referenced = await findReferencedPublicIds(
    prisma,
    uploads.map((upload) => upload.publicId)
  );

  const orphans = uploads.filter(
    (upload) => !referenced.has(upload.publicId) && upload.createdAt < cutoff
  );

  const keptRecent = uploads.filter(
    (upload) => !referenced.has(upload.publicId) && upload.createdAt >= cutoff
  ).length;

  console.log(`  in use by a listing, handover or claim: ${referenced.size}`);
  console.log(`  unattached but too recent to touch: ${keptRecent}`);
  console.log(`  orphaned: ${orphans.length}`);

  if (orphans.length === 0 || !shouldDelete) {
    for (const orphan of orphans) {
      console.log(`  would delete ${orphan.publicId}`);
    }

    await prisma.$disconnect();

    return;
  }

  let deleted = 0;

  // Sequential: this is a background job with no latency budget, and a burst of
  // parallel destroys would eat into the Admin API's hourly rate limit for no gain.
  for (const orphan of orphans) {
    const ok = await destroyImage(orphan.publicId);

    if (ok) {
      deleted += 1;
    } else {
      console.warn(`  failed to delete ${orphan.publicId}`);
    }
  }

  console.log(`Deleted ${deleted} of ${orphans.length} orphaned asset(s).`);

  await prisma.$disconnect();
}

// No top-level await: the package is CommonJS under tsx.
main().catch((error: unknown) => {
  console.error("Cleanup failed:", error);
  process.exitCode = 1;
});
