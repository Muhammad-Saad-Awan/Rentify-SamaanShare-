"use server";

import { ReportStatus, ReportType } from "@/generated/prisma/enums";
import { getActiveUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { VISIBLE_LISTING_WHERE } from "@/lib/queries/visibility";
import { checkRateLimit } from "@/lib/rate-limit";
import { canFileReport, isReasonValidFor } from "@/lib/reports/rules";
import { createReportSchema } from "@/lib/validations/report";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ReportReason } from "@/generated/prisma/enums";
import type { ActionResult } from "@/types";

/**
 * Filing a report.
 *
 * THE TYPE IS FIXED BY WHICH FUNCTION YOU CALL, never accepted as input. `Report.targetId` is
 * polymorphic with no foreign key, so a client that could pair `type: LISTING` with a review's id
 * would be choosing which table a moderator's REMOVE_LISTING later runs against. Three entry points
 * with the type hard-coded removes the question rather than validating it.
 *
 * YOU CAN ONLY REPORT WHAT YOU CAN SEE. Each target is looked up through the same predicate that
 * governs reading it - `VISIBLE_LISTING_WHERE` for listings, released-and-not-removed for reviews,
 * not-deleted for users - and a target that fails it reports "not found", identically to one that
 * never existed. Without that, this becomes an oracle for probing ids: file a report, read the error,
 * learn whether a hidden listing exists.
 *
 * NOTHING IS NOTIFIED ON FILING. Not the reported account - that hands them the warning and the
 * motive to retaliate against whoever could plausibly have filed it, which in a two-party rental is
 * usually one person - and not moderators, whose queue would then be floodable. See
 * `src/lib/notifications/report-messages.ts`.
 */

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

const NOT_FOUND_ERROR = "That was not found.";

/**
 * Reports per user per hour.
 *
 * Generous for a person - reporting several items in a bad afternoon is legitimate - and low enough
 * that a script cannot bury the moderation queue. Keyed on the user id, so the spoofable
 * `x-forwarded-for` path is not involved.
 */
const REPORT_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

/** Reporting a listing. The subject is its owner: they wrote it and they answer for it. */
export async function reportListing(input: unknown): Promise<ActionResult> {
  return fileReport(ReportType.LISTING, input, async (targetId) => {
    const listing = await prisma.listing.findFirst({
      // Only a listing this person could have been looking at. A paused, rejected, soft-deleted or
      // banned-owner listing is not reportable, because it is not visible to report.
      where: { id: targetId, ...VISIBLE_LISTING_WHERE },
      select: { ownerId: true },
    });

    return listing ? { subjectUserId: listing.ownerId } : null;
  });
}

/** Reporting a person directly - conduct during a rental rather than anything they published. */
export async function reportUser(input: unknown): Promise<ActionResult> {
  return fileReport(ReportType.USER, input, async (targetId) => {
    const user = await prisma.user.findFirst({
      // Soft-deleted accounts are not reportable: there is no one left to act against, and the row
      // exists only to keep old bookings and reviews intact.
      where: { id: targetId, deletedAt: null },
      select: { id: true },
    });

    return user ? { subjectUserId: user.id } : null;
  });
}

/**
 * Reporting a review.
 *
 * The subject is the review's *author*, not the person it is about. A review is something someone
 * wrote, and a suspension arising from this report has to land on whoever wrote it - the obvious
 * mistake here would suspend the person the review was already unfair to.
 */
export async function reportReview(input: unknown): Promise<ActionResult> {
  return fileReport(ReportType.REVIEW, input, async (targetId) => {
    const review = await prisma.review.findFirst({
      where: {
        id: targetId,
        // Released and not already removed - the two conditions under which anyone can read it.
        // A withheld review must not be reportable, or the refusal alone would confirm it exists.
        publishedAt: { not: null },
        removedAt: null,
      },
      select: { reviewerId: true },
    });

    return review ? { subjectUserId: review.reviewerId } : null;
  });
}

/** What a target resolves to: the account that answers for it, or `null` if it is not visible. */
type TargetResolver = (
  targetId: string
) => Promise<{ subjectUserId: string } | null>;

/**
 * The shared body of all three entry points.
 *
 * Written once because the parts that must not be forgotten - the visibility check, the self-report
 * refusal, the duplicate guard - are identical, and three copies is how one of them ends up missing
 * the guard that mattered.
 */
async function fileReport(
  type: ReportType,
  input: unknown,
  resolveTarget: TargetResolver
): Promise<ActionResult> {
  const parsed = createReportSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the report.",
    };
  }

  const { targetId, reason, description } = parsed.data;

  if (!isReasonValidFor(type, reason as ReportReason)) {
    return {
      success: false,
      error: "That reason does not apply to what you are reporting.",
    };
  }

  const user = await getActiveUser();

  if (!user) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const rate = checkRateLimit(`report:${user.id}`, REPORT_RATE_LIMIT);

  if (!rate.allowed) {
    return {
      success: false,
      error: "Too many reports just now. Please try again shortly.",
    };
  }

  try {
    const target = await resolveTarget(targetId);

    if (!target) {
      return { success: false, error: NOT_FOUND_ERROR };
    }

    const eligibility = canFileReport({
      reporterId: user.id,
      subjectUserId: target.subjectUserId,
    });

    if (!eligibility.allowed) {
      return { success: false, error: eligibility.reason };
    }

    /**
     * One open report per person per target.
     *
     * Scoped to `PENDING` rather than enforced by a unique constraint, and the scope is the reason:
     * a constraint on `[reporterId, type, targetId]` would refuse a second report forever, including
     * one filed months after the first was dismissed and the behaviour recurred. Being unable to
     * report a repeat offender again is a worse failure than a duplicate row.
     *
     * Not a transaction with the insert below. Two simultaneous submissions from one person could
     * both pass this check and create two rows - which costs a moderator one extra glance and is
     * strictly less harmful than the constraint that would prevent it.
     */
    const existing = await prisma.report.findFirst({
      where: {
        reporterId: user.id,
        type,
        targetId,
        status: ReportStatus.PENDING,
      },
      select: { id: true },
    });

    if (existing) {
      return {
        success: false,
        error: "You have already reported this. We are still looking at it.",
      };
    }

    await prisma.report.create({
      data: {
        reporterId: user.id,
        type,
        targetId,
        reason,
        ...(description ? { description } : {}),
        // PENDING by default, and every other moderation column stays null until a decision.
      },
      select: { id: true },
    });

    /**
     * No `revalidatePath`. Filing a report changes nothing anyone can see - deliberately, since a
     * listing that visibly changed the moment it was reported would tell its owner they had been.
     */
    return { success: true, data: undefined };
  } catch (error) {
    console.error("fileReport failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}
