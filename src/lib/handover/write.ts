import { canRecordHandover } from "@/lib/handover/rules";
import { resolveOwnedPhotos } from "@/lib/uploads/resolve-photos";
import { prisma } from "@/lib/prisma";

import type { Prisma } from "@/generated/prisma/client";
import type { HandoverCondition, HandoverType } from "@/generated/prisma/enums";
import type { ResolvedPhoto } from "@/lib/uploads/resolve-photos";
import type { HandoverRecordInput } from "@/lib/validations/handover";

/**
 * Writing a handover record.
 *
 * SPLIT IN TWO ON PURPOSE. `prepareHandover` does the reads and the outbound Cloudinary call;
 * `writeHandoverRecord` does nothing but insert, inside the caller's transaction. Resolving photo
 * URLs means an HTTP request to Cloudinary's Admin API, and holding a database connection across one
 * is exactly what produced the P2028 timeouts Stage A4 removed.
 *
 * Both `startBooking` and `completeBooking` go through this. Deliberately one path: two transitions
 * writing condition records by different means is how one of them ends up not writing one.
 */

export interface PreparedHandover {
  condition: HandoverCondition;
  notes?: string | undefined;
  photos: ResolvedPhoto[];
}

export type HandoverPreparation =
  { ok: true; record: PreparedHandover } | { ok: false; error: string };

interface PrepareInput {
  userId: string;
  bookingId: string;
  /** The booking's status right now - which decides whether this handover is due. */
  status: Parameters<typeof canRecordHandover>[0]["status"];
  type: HandoverType;
  input: HandoverRecordInput;
}

/**
 * Validates that this handover is due and turns the submitted photo ids into trusted rows.
 *
 * Runs before the transaction opens.
 */
export async function prepareHandover({
  userId,
  bookingId,
  status,
  type,
  input,
}: PrepareInput): Promise<HandoverPreparation> {
  /**
   * The seal, checked here for a legible message.
   *
   * `@@unique([bookingId, type])` is what actually enforces it - this read and the insert are not
   * atomic, so a concurrent pair could both pass here. That race is already closed upstream: the
   * transition is a compare-and-swap, so the second caller fails to move the booking and never
   * reaches the insert. This exists so the ordinary case reads "already recorded" rather than
   * surfacing a constraint violation.
   */
  const existing = await prisma.handoverRecord.findUnique({
    where: { bookingId_type: { bookingId, type } },
    select: { id: true },
  });

  const eligibility = canRecordHandover({
    status,
    type,
    alreadyRecorded: existing !== null,
  });

  if (!eligibility.allowed) {
    return { ok: false, error: eligibility.reason };
  }

  const resolved = await resolveOwnedPhotos(userId, input.photoIds);

  if (!resolved.ok) {
    return { ok: false, error: resolved.error };
  }

  return {
    ok: true,
    record: {
      condition: input.condition,
      notes: input.notes,
      photos: resolved.photos,
    },
  };
}

/** The subset of the client this needs, so a `$transaction` callback satisfies it. */
export type HandoverWriter = Pick<Prisma.TransactionClient, "handoverRecord">;

interface WriteInput extends PreparedHandover {
  bookingId: string;
  type: HandoverType;
  recordedById: string;
}

/**
 * Inserts the record and its photos, in the caller's transaction.
 *
 * A nested `create` for the photos rather than a separate `createMany`, so a record can never exist
 * without the images that were meant to document it - which is the failure that would leave an owner
 * insisting they photographed a scratch nobody can find.
 *
 * Nothing here sets `confirmation`; it defaults to `PENDING`. The counterparty's answer is a separate
 * write and is never required - see the note in `rules.ts`.
 */
export async function writeHandoverRecord(
  client: HandoverWriter,
  { bookingId, type, recordedById, condition, notes, photos }: WriteInput
): Promise<{ id: string }> {
  return client.handoverRecord.create({
    data: {
      bookingId,
      type,
      recordedById,
      condition,
      ...(notes ? { notes } : {}),
      ...(photos.length > 0
        ? {
            photos: {
              create: photos.map((photo) => ({
                url: photo.url,
                publicId: photo.publicId,
                order: photo.order,
              })),
            },
          }
        : {}),
    },
    select: { id: true },
  });
}
