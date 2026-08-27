"use server";

import { revalidatePath } from "next/cache";

import {
  AdminActionType,
  ReportAction,
  ReportStatus,
  ReportType,
  UserStatus,
} from "@/generated/prisma/enums";
import { removeListing } from "@/lib/admin/listing-moderation";
import { writeAdminAction } from "@/lib/admin/log";
import { canSuspendUser } from "@/lib/admin/rules";
import { getActiveAdmin } from "@/lib/auth/session";
import { createNotifications } from "@/lib/notifications/create";
import { buildReportNotifications } from "@/lib/notifications/report-messages";
import { prisma } from "@/lib/prisma";
import { isActionPermittedFor, isReportOpen } from "@/lib/reports/rules";
import { recomputeUserRating } from "@/lib/reviews/publish";
import {
  dismissReportSchema,
  resolveReportSchema,
} from "@/lib/validations/report";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { Prisma } from "@/generated/prisma/client";
import type { ActionResult } from "@/types";

/**
 * Resolving reports. Admin only.
 *
 * THE DECISION AND ITS CONSEQUENCE ARE ONE TRANSACTION. Suspending an account, removing a listing or
 * removing a review is the consequence; stamping the report RESOLVED is the record of who decided it.
 * Split apart, the two failure modes are a consequence nobody is accountable for and an audit trail
 * describing something that never happened - and neither would ever be detected, because there is
 * nothing to reconcile them against.
 *
 * RESOLVED ONCE, by compare-and-swap on `status`. Two moderators working the same queue is the
 * normal case, not a race to hand-wave: without the swap, a report could be resolved twice and
 * suspend an account twice for one complaint.
 *
 * THE ACTION MUST FIT THE REPORT. Checked against `isActionPermittedFor` before anything is written.
 * `Report.targetId` is polymorphic with no foreign key, so REMOVE_LISTING on a review report would
 * run `where: { id: targetId }` against the listings table and act on whatever happens to share that
 * id. Nothing in the database would object.
 */

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

/** Reported, decided, and now closed with the consequence applied. */
export async function resolveReport(input: unknown): Promise<ActionResult> {
  const parsed = resolveReportSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the decision.",
    };
  }

  return closeReport({
    ...parsed.data,
    status: ReportStatus.RESOLVED,
  });
}

/**
 * Looked at, and nothing here breaks the rules.
 *
 * A separate entry point rather than `resolveReport` with `action: NONE`, because the two say
 * different things. NONE means the complaint was sound and the response was to leave it; DISMISSED
 * means the complaint itself did not hold. Collapsing them would lose the distinction in the one
 * place it is worth having - a target with ten dismissals reads very differently from one with ten
 * investigated-no-action decisions.
 */
export async function dismissReport(input: unknown): Promise<ActionResult> {
  const parsed = dismissReportSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the decision.",
    };
  }

  return closeReport({
    ...parsed.data,
    action: ReportAction.NONE,
    status: ReportStatus.DISMISSED,
  });
}

interface CloseReportInput {
  reportId: string;
  action: ReportAction;
  // `| undefined` explicitly: `exactOptionalPropertyTypes` is on, and the parsed schema hands over
  // the key with an undefined value rather than omitting it.
  resolution?: string | undefined;
  status: typeof ReportStatus.RESOLVED | typeof ReportStatus.DISMISSED;
}

/** The shared body: authorise, check the fit, swap the status, apply the consequence, notify. */
async function closeReport({
  reportId,
  action,
  resolution,
  status,
}: CloseReportInput): Promise<ActionResult> {
  const admin = await getActiveAdmin();

  if (!admin) {
    /**
     * Two failures, one message, and deliberately so.
     *
     * A signed-out caller and a signed-in non-admin get the same answer, so this cannot be used to
     * discover whether moderation endpoints exist or whether an account has the role. The
     * unauthenticated sentinel is still returned for a genuinely absent session, because the caller
     * branches on it to offer a sign-in rather than an error.
     */
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  try {
    const report = await prisma.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        type: true,
        targetId: true,
        status: true,
        reporterId: true,
      },
    });

    if (!report) {
      return { success: false, error: "That report was not found." };
    }

    if (!isReportOpen(report.status)) {
      return {
        success: false,
        error: "That report has already been decided.",
      };
    }

    if (!isActionPermittedFor(report.type, action)) {
      return {
        success: false,
        error: "That action cannot be taken on this kind of report.",
      };
    }

    const outcome = await prisma.$transaction(async (tx) => {
      /**
       * The compare-and-swap. `status: PENDING` in the predicate is what makes a second resolution
       * a no-op rather than a second suspension, and it is checked here rather than trusted from the
       * read above - the read is outside this transaction and can be stale by the time we write.
       */
      const claimed = await tx.report.updateMany({
        where: { id: report.id, status: ReportStatus.PENDING },
        data: {
          status,
          action,
          resolvedBy: admin.id,
          resolvedAt: new Date(),
          ...(resolution ? { resolution } : {}),
        },
      });

      if (claimed.count === 0) {
        return { claimed: false as const };
      }

      const applied = await applyReportAction(tx, {
        type: report.type,
        targetId: report.targetId,
        action,
        adminId: admin.id,
        reportId: report.id,
        ...(resolution ? { resolution } : {}),
      });

      await createNotifications(
        tx,
        buildReportNotifications({
          reportId: report.id,
          reporterId: report.reporterId,
          status,
        })
      );

      return { claimed: true as const, applied };
    });

    if (!outcome.claimed) {
      return {
        success: false,
        error: "That report has already been decided.",
      };
    }

    if (outcome.applied.error) {
      // The transaction committed - the decision and its record stand - but the target had moved on.
      // Reported as a warning rather than a failure, because retrying would not help.
      return { success: false, error: outcome.applied.error };
    }

    revalidateModerationPaths(report.type, report.targetId);

    return { success: true, data: undefined };
  } catch (error) {
    console.error("closeReport failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

interface ApplyActionInput {
  type: ReportType;
  targetId: string;
  action: ReportAction;
  adminId: string;
  /** The report being resolved, so a suspension it causes can point back at it. */
  reportId: string;
  /** The moderator's note, reused as the audit reason - the only one this path has. */
  resolution?: string | undefined;
}

/**
 * Carries out the consequence, inside the caller's transaction.
 *
 * Returns an `error` string rather than throwing when the target has already gone. A listing deleted
 * by its owner between the report and the decision is an ordinary race, and rolling the whole
 * resolution back would put the report back in the queue for a decision that can never be applied -
 * the moderator would resolve it again, and again.
 */
async function applyReportAction(
  tx: Prisma.TransactionClient,
  { type, targetId, action, adminId, reportId, resolution }: ApplyActionInput
): Promise<{ error?: string }> {
  switch (action) {
    case ReportAction.NONE:
      return {};

    case ReportAction.REMOVE_LISTING:
      /**
       * THE SAME REMOVAL THE LISTINGS SCREEN USES - see `src/lib/admin/listing-moderation.ts`.
       *
       * This branch used to write the soft delete inline and record nothing else, which left a
       * listing removed through the queue with the Report as its only evidence: the listing row said
       * nothing but DELETED, and the owner's history said nothing at all. Exactly the gap
       * `admin_actions` closed for suspensions, and it closes the same way - one function, called
       * from both paths, writing one shape of record.
       *
       * The moderator's resolution note becomes the audit reason, as it does for SUSPEND_USER; the
       * fallback covers a resolution left blank, which the schema allows.
       */
      return removeListing(tx, {
        listingId: targetId,
        adminId,
        reason: resolution ?? "Removed while resolving a report.",
        reportId,
      });

    case ReportAction.REMOVE_REVIEW: {
      const review = await tx.review.findUnique({
        where: { id: targetId },
        select: { id: true, revieweeId: true, removedAt: true },
      });

      if (!review || review.removedAt) {
        return { error: "That review had already been removed." };
      }

      await tx.review.update({
        where: { id: review.id },
        data: { removedAt: new Date() },
      });

      /**
       * The aggregate has to move with it, in this same transaction.
       *
       * A removed review is unreadable, so leaving it counted would keep a rating nobody is allowed
       * to see - and the number on the listing page would then disagree with the reviews beneath it,
       * which is precisely the defect the directional split was made to fix. `recomputeUserRating`
       * recounts rather than adjusting, so it needs no knowledge of which review went.
       */
      await recomputeUserRating(tx, review.revieweeId);

      return {};
    }

    case ReportAction.SUSPEND_USER: {
      const subjectId = await resolveSubjectUserId(tx, type, targetId);

      if (!subjectId) {
        return { error: "The account behind that report could not be found." };
      }

      const subject = await tx.user.findUnique({
        where: { id: subjectId },
        select: { id: true, role: true, status: true, deletedAt: true },
      });

      if (!subject) {
        return { error: "The account behind that report could not be found." };
      }

      /**
       * The SAME predicate the members screen uses - see `src/lib/admin/rules.ts`.
       *
       * These rules used to be written out here: not yourself, not an administrator, not deleted,
       * must be ACTIVE. Adding a standalone suspension meant a second copy, and two copies of an
       * authorization rule is how one of them ends up missing the clause that mattered. The
       * reasoning behind each clause now lives with the predicate rather than here.
       */
      const eligibility = canSuspendUser(adminId, {
        id: subject.id,
        role: subject.role,
        status: subject.status,
        isDeleted: subject.deletedAt !== null,
      });

      if (!eligibility.allowed) {
        return { error: eligibility.reason };
      }

      const suspended = await tx.user.updateMany({
        // Guarded on the status just read, so a concurrent change is refused rather than overwritten.
        where: { id: subject.id, status: subject.status, deletedAt: null },
        data: { status: UserStatus.SUSPENDED },
      });

      if (suspended.count === 0) {
        return { error: "That account could not be suspended." };
      }

      /**
       * The same audit row a suspension from the members screen writes, with the report attached.
       *
       * That link is what keeps the two paths from producing different kinds of evidence: before
       * this, a suspension through the queue left the Report as its only trace and the User row said
       * nothing but SUSPENDED. The reason recorded is the moderator's own resolution note, which is
       * the closest thing this path has to one.
       */
      await writeAdminAction(tx, {
        actorId: adminId,
        subjectId: subject.id,
        type: AdminActionType.SUSPEND_USER,
        reason: resolution ?? "Suspended while resolving a report.",
        previousValue: subject.status,
        newValue: UserStatus.SUSPENDED,
        reportId,
      });

      return {};
    }
  }
}

/**
 * The account that answers for a reported target.
 *
 * Deliberately unfiltered by visibility, unlike the equivalent in `src/actions/reports.ts`. Filing a
 * report requires being able to see the target; acting on one must still work after the listing has
 * been paused or the owner has hidden it, which is a common response to being reported.
 */
async function resolveSubjectUserId(
  tx: Prisma.TransactionClient,
  type: ReportType,
  targetId: string
): Promise<string | null> {
  switch (type) {
    case ReportType.USER:
      return targetId;

    case ReportType.LISTING: {
      const listing = await tx.listing.findUnique({
        where: { id: targetId },
        select: { ownerId: true },
      });

      return listing?.ownerId ?? null;
    }

    case ReportType.REVIEW: {
      const review = await tx.review.findUnique({
        where: { id: targetId },
        // The AUTHOR, not the subject of the review. Suspending the person a review was unfair to
        // would be the exact inversion of what the report asked for.
        select: { reviewerId: true },
      });

      return review?.reviewerId ?? null;
    }
  }
}

/**
 * Refreshes what a moderation decision changes.
 *
 * The queue always. A removed listing or review also changes public pages, and a suspension hides
 * every listing that account owns - `VISIBLE_LISTING_WHERE` filters on owner status - so the browse
 * pages have to be rebuilt too, or a suspended owner's inventory stays rentable from cache.
 */
function revalidateModerationPaths(type: ReportType, targetId: string): void {
  revalidatePath("/admin/reports", "page");
  revalidatePath("/dashboard/notifications", "page");
  revalidatePath("/listings", "page");
  revalidatePath("/", "page");

  if (type === ReportType.LISTING) {
    revalidatePath(`/listings/${targetId}`, "page");
  }
}
