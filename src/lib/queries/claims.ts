import { ClaimStatus, HandoverType } from "@/generated/prisma/enums";
import { escalateOverdueClaims } from "@/lib/claims/escalate";
import { claimSupportedByHandover } from "@/lib/claims/rules";
import { prisma } from "@/lib/prisma";

import type { ClaimReason, HandoverCondition } from "@/generated/prisma/enums";
import type { PaginatedResult } from "@/types";

/**
 * The claim queue. Admin reads only.
 *
 * SWEEPS BEFORE READING, like every other lazy path here. A claim whose response window closed an
 * hour ago belongs in this queue, and a queue that only showed claims somebody had happened to
 * trigger a sweep on would be missing exactly the ones that had waited longest.
 *
 * CARRIES THE EVIDENCE, NOT JUST THE DEMAND. The return condition record travels with each claim,
 * including - especially - when it contradicts the claim. An owner who graded the item `AS_EXPECTED`
 * at the door and is now claiming damage is not blocked from filing, because hidden faults are real;
 * but that contradiction is close to the strongest evidence available either way, and a queue that
 * did not surface it would leave every administrator to go and find it by hand.
 */

/** Claims shown per page. */
export const CLAIMS_PAGE_SIZE = 20;

export interface AdminClaimSummary {
  id: string;
  reason: ClaimReason;
  description: string;
  amountClaimed: number;
  amountUpheld: number | null;
  /** The deposit the claim is measured against, from the payment where one exists. */
  securityDeposit: number;
  status: ClaimStatus;
  filedAt: Date;
  /**
   * `null` on a claim that reached the queue by silence rather than by dispute.
   *
   * The difference matters to whoever decides it: one party contested the account, or nobody
   * answered at all. Collapsing them would present an absence as a disagreement.
   */
  respondedAt: Date | null;
  responseNote: string | null;
  resolution: string | null;
  resolvedAt: Date | null;
  resolvedBy: { name: string | null } | null;
  claimant: { id: string; name: string | null };
  respondent: { id: string; name: string | null };
  listing: { id: string; title: string };
  bookingCompletedAt: Date | null;
  /** Both sides' photos, in order, tagged with who attached each. */
  photos: { id: string; url: string; byClaimant: boolean }[];
  /** The return condition record, when one exists. */
  handover: {
    condition: HandoverCondition;
    notes: string | null;
    photos: { id: string; url: string }[];
  } | null;
  /**
   * Whether that record backs the claim up.
   *
   * `false` when the owner recorded the item as fine and is now claiming damage - which is not a
   * refusal, but is the first thing an administrator should see.
   */
  supportedByHandover: boolean;
}

interface ClaimPageOptions {
  status?: ClaimStatus;
  page?: number;
  pageSize?: number;
}

/**
 * A page of claims, oldest first.
 *
 * The opposite ordering to the report queue, and deliberately. A report is a complaint that can wait;
 * a claim holds somebody's money and has a clock attached, so the one that has waited longest is the
 * one that most needs deciding.
 */
export async function getClaims({
  status = ClaimStatus.DISPUTED,
  page = 1,
  pageSize = CLAIMS_PAGE_SIZE,
}: ClaimPageOptions = {}): Promise<PaginatedResult<AdminClaimSummary>> {
  await escalateOverdueClaims();

  const currentPage = Math.max(1, Math.trunc(page));
  const where = { status };

  // Concurrent reads, not a transaction - see the note in `getActiveListings`.
  const [rows, total] = await Promise.all([
    prisma.damageClaim.findMany({
      where,
      orderBy: { filedAt: "asc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        reason: true,
        description: true,
        amountClaimed: true,
        amountUpheld: true,
        status: true,
        filedAt: true,
        respondedAt: true,
        responseNote: true,
        resolution: true,
        resolvedAt: true,
        claimantId: true,
        resolvedBy: { select: { name: true } },
        claimant: { select: { id: true, name: true } },
        respondent: { select: { id: true, name: true } },
        photos: {
          orderBy: { order: "asc" },
          select: { id: true, url: true, uploadedById: true },
        },
        handover: {
          select: {
            condition: true,
            notes: true,
            photos: {
              orderBy: { order: "asc" },
              select: { id: true, url: true },
            },
          },
        },
        booking: {
          select: {
            completedAt: true,
            securityDeposit: true,
            listing: { select: { id: true, title: true } },
            payment: { select: { securityDeposit: true } },
          },
        },
      },
    }),
    prisma.damageClaim.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      reason: row.reason,
      description: row.description,
      amountClaimed: row.amountClaimed,
      amountUpheld: row.amountUpheld,
      // Same precedence as everywhere else: the payment's figure is what the money moved against.
      securityDeposit:
        row.booking.payment?.securityDeposit ?? row.booking.securityDeposit,
      status: row.status,
      filedAt: row.filedAt,
      respondedAt: row.respondedAt,
      responseNote: row.responseNote,
      resolution: row.resolution,
      resolvedAt: row.resolvedAt,
      resolvedBy: row.resolvedBy,
      claimant: row.claimant,
      respondent: row.respondent,
      listing: row.booking.listing,
      bookingCompletedAt: row.booking.completedAt,
      photos: row.photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        byClaimant: photo.uploadedById === row.claimantId,
      })),
      handover: row.handover,
      supportedByHandover: claimSupportedByHandover(
        row.handover?.condition ?? null
      ),
    })),
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Disputed claims awaiting a decision, for the queue badge. */
export async function getOpenClaimCount(): Promise<number> {
  await escalateOverdueClaims();

  return prisma.damageClaim.count({ where: { status: ClaimStatus.DISPUTED } });
}

/** Exported so the page can name the record it renders without re-deriving the type. */
export const RETURN_HANDOVER = HandoverType.RETURN;
