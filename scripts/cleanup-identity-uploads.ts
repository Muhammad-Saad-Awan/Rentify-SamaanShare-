// ============================================================================
// SamaanShare - Reclaim CNIC images nobody should still be holding
// ============================================================================
// A copy of someone's identity card that the database does not know about is a
// liability with no upside. This job finds two kinds and removes them:
//
//   ORPHANS   Images under `samaanshare/identity/` that no IdentityDocument points
//             at. The CNIC form uploads both sides BEFORE the server saves them,
//             so a submission refused afterwards - a duplicate number, an expired
//             session, a dropped connection - leaves two images behind. So does a
//             re-upload whose best-effort delete of the old pair failed.
//
//   DEPARTED  Images, and the IdentityDocument row with its CNIC number, of a
//             member whose account has been soft-deleted. Nothing sets
//             `User.deletedAt` yet; this is ready for when account deletion lands.
//
// The keep/delete decision is `planIdentityCleanup`, which is unit tested. An
// image an active member's document points at is NEVER deleted, however old.
//
// DRY RUN BY DEFAULT. Pass --delete to actually destroy, and --hours=N to change
// the grace period for unreferenced images. Deleting is irreversible.
//
//   npm run cleanup:identity              # report only
//   npm run cleanup:identity -- --delete  # reclaim
// ============================================================================

import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  destroyImage,
  IDENTITY_UPLOAD_ROOT,
  listUploadsByPrefix,
} from "../src/lib/cloudinary";
import { planIdentityCleanup } from "../src/lib/uploads/identity-cleanup";

import type { ListedUpload } from "../src/lib/cloudinary";

/** Fallback only - see the same call in `cleanup-pending-uploads.ts`. */
dotenv.config({ path: [".env.local", ".env"], quiet: true });

/**
 * Grace period for unreferenced images.
 *
 * The window between the browser uploading and the server saving is seconds, not hours, so this
 * could be much shorter. 24h matches the pending-uploads job and costs nothing but a day of storage.
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

/** Destroys each image in turn, returning whether every one is gone. */
async function destroyAll(uploads: readonly ListedUpload[]): Promise<boolean> {
  let allGone = true;

  // Sequential, as in the pending job: no latency budget, and the Admin API is rate limited.
  for (const upload of uploads) {
    if (!(await destroyImage(upload.publicId, "authenticated"))) {
      console.warn(`  failed to delete ${upload.publicId}`);
      allGone = false;
    }
  }

  return allGone;
}

async function main() {
  const { shouldDelete, hours } = parseArgs();
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  const prisma = createClient();

  try {
    console.log(`Scanning ${IDENTITY_UPLOAD_ROOT}/ (private images)...`);
    console.log(
      shouldDelete ? "Mode: DELETE" : "Mode: dry run (pass --delete)"
    );

    const uploads: ListedUpload[] = [];
    let cursor: string | undefined;

    do {
      const page = await listUploadsByPrefix(
        `${IDENTITY_UPLOAD_ROOT}/`,
        cursor,
        "authenticated"
      );
      uploads.push(...page.uploads);
      cursor = page.nextCursor;
    } while (cursor);

    const ids = uploads.map((upload) => upload.publicId);

    /**
     * Every document that points at a listed image, plus every deleted member's document whether or
     * not its images are still listed - a row can outlive its images if a previous run was cut short.
     */
    const rows = await prisma.identityDocument.findMany({
      where: {
        OR: [
          { frontPublicId: { in: ids } },
          { backPublicId: { in: ids } },
          { user: { deletedAt: { not: null } } },
        ],
      },
      select: {
        id: true,
        frontPublicId: true,
        backPublicId: true,
        user: { select: { deletedAt: true } },
      },
    });

    const plan = planIdentityCleanup(
      uploads,
      rows.map((row) => ({
        id: row.id,
        frontPublicId: row.frontPublicId,
        backPublicId: row.backPublicId,
        userDeleted: row.user.deletedAt !== null,
      })),
      cutoff
    );

    console.log(`Found ${uploads.length} image(s).`);
    console.log(`  on file for an active member: ${plan.keep.length}`);
    console.log(
      `  unreferenced but under ${hours}h old: ${plan.recent.length}`
    );
    console.log(`  orphaned: ${plan.orphans.length}`);
    console.log(`  deleted members' documents: ${plan.departed.length}`);

    if (!shouldDelete) {
      for (const orphan of plan.orphans) {
        console.log(`  would delete orphan ${orphan.publicId}`);
      }

      for (const { document, uploads: images } of plan.departed) {
        console.log(
          `  would delete document ${document.id} and ${images.length} image(s)`
        );
      }

      return;
    }

    const orphansGone = await destroyAll(plan.orphans);
    let documentsRemoved = 0;

    for (const { document, uploads: images } of plan.departed) {
      /**
       * The row goes only once its images are confirmed gone. Removing it first and then failing to
       * destroy an image would turn a tracked image into an orphan - still cleaned up next run, but
       * a day later than it had to be.
       */
      if (!(await destroyAll(images))) {
        continue;
      }

      await prisma.identityDocument.delete({ where: { id: document.id } });
      documentsRemoved += 1;
    }

    console.log(
      `Deleted ${plan.orphans.length} orphan(s)${orphansGone ? "" : " (some failed)"} and ${documentsRemoved} of ${plan.departed.length} deleted member document(s).`
    );
  } finally {
    await prisma.$disconnect();
  }
}

// No top-level await: the package is CommonJS under tsx.
main().catch((error: unknown) => {
  console.error("Identity cleanup failed:", error);
  process.exitCode = 1;
});
