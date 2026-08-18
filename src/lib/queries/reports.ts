import { ReportStatus, ReportType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

import type { ReportAction, ReportReason } from "@/generated/prisma/enums";
import type { PaginatedResult } from "@/types";

/**
 * The moderation queue. Admin reads only.
 *
 * THE HARD PART IS THE TARGET. `Report.targetId` is polymorphic with no foreign key (D4), so Prisma
 * cannot join it and a report on its own says only "LISTING, id abc123, PROHIBITED_ITEM". A queue
 * that cannot show what was reported is a queue where every decision starts with opening another
 * tab, which is how a moderator ends up resolving from the reason alone.
 *
 * So targets are hydrated in a second pass: the page of reports is read first, then one query per
 * kind for the ids actually present. Three extra queries for a page of twenty, rather than one
 * per report - and a report whose target has since been deleted comes back as `null` and renders as
 * "no longer exists", which is information a moderator needs rather than an error.
 *
 * NOTHING HERE FILTERS BY VISIBILITY. A paused listing, a soft-deleted account and a removed review
 * must all still be inspectable: hiding a target the moment its owner hides it would make "pause the
 * listing" an effective way to escape moderation.
 */

/** How many reports a moderator sees at once. */
export const REPORTS_PAGE_SIZE = 20;

/** What was reported, as much as can be shown without leaving the queue. */
export type ReportTarget =
  | { kind: "listing"; id: string; title: string; ownerName: string | null }
  | {
      kind: "user";
      id: string;
      name: string | null;
      status: string;
      isDeleted: boolean;
    }
  | {
      kind: "review";
      id: string;
      rating: number;
      comment: string | null;
      authorName: string | null;
      isRemoved: boolean;
    }
  /** The row it pointed at is gone. Not an error - a decision can still be recorded. */
  | { kind: "missing" };

export interface ReportSummary {
  id: string;
  type: ReportType;
  reason: ReportReason;
  description: string | null;
  status: ReportStatus;
  action: ReportAction | null;
  resolution: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  /** Name only. A moderator needs to recognise a repeat reporter, not to contact them. */
  reporter: { id: string; name: string | null };
  resolver: { name: string | null } | null;
  target: ReportTarget;
  /**
   * How many other reports name this same target.
   *
   * The single most useful number on the screen. One complaint about a listing is a disagreement;
   * six from six people is a pattern, and without this a moderator would have to notice it by
   * memory across pages.
   */
  otherReportsOnTarget: number;
}

interface ReportPageOptions {
  status?: ReportStatus;
  page?: number;
  pageSize?: number;
}

/**
 * A page of reports, newest first.
 *
 * Oldest-first is the tempting order for a work queue - first in, first out - and it is wrong here.
 * A backlog would bury today's reports behind a month of stale ones, and the reports that matter
 * most (an unsafe item still listed, an account still active) are the recent ones.
 */
export async function getReports({
  status = ReportStatus.PENDING,
  page = 1,
  pageSize = REPORTS_PAGE_SIZE,
}: ReportPageOptions = {}): Promise<PaginatedResult<ReportSummary>> {
  const currentPage = Math.max(1, Math.trunc(page));
  const where = { status };

  // Concurrent reads rather than a transaction - see the note in `getActiveListings`.
  const [rows, total] = await Promise.all([
    prisma.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        type: true,
        targetId: true,
        reason: true,
        description: true,
        status: true,
        action: true,
        resolution: true,
        resolvedAt: true,
        createdAt: true,
        reporter: { select: { id: true, name: true } },
        resolver: { select: { name: true } },
      },
    }),
    prisma.report.count({ where }),
  ]);

  const targets = await hydrateTargets(rows);
  const counts = await countReportsPerTarget(rows);

  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      reason: row.reason,
      description: row.description,
      status: row.status,
      action: row.action,
      resolution: row.resolution,
      resolvedAt: row.resolvedAt,
      createdAt: row.createdAt,
      reporter: row.reporter,
      resolver: row.resolver,
      target: targets.get(targetKey(row.type, row.targetId)) ?? {
        kind: "missing",
      },
      // Minus this report itself, so the number reads as "others", which is what a moderator wants.
      otherReportsOnTarget: Math.max(
        0,
        (counts.get(targetKey(row.type, row.targetId)) ?? 1) - 1
      ),
    })),
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** The count of pending reports, for the queue badge. */
export async function getPendingReportCount(): Promise<number> {
  return prisma.report.count({ where: { status: ReportStatus.PENDING } });
}

type ReportRow = {
  type: ReportType;
  targetId: string;
};

/** Type and id together - two kinds can hold the same id without colliding in the map. */
function targetKey(type: ReportType, targetId: string): string {
  return `${type}:${targetId}`;
}

/**
 * Fetches every reported target in three queries, whatever the page contains.
 *
 * Grouped by kind first, so a page of twenty reports costs three round trips rather than twenty -
 * and none at all for a kind that does not appear.
 */
async function hydrateTargets(
  rows: readonly ReportRow[]
): Promise<Map<string, ReportTarget>> {
  const idsOf = (type: ReportType) => [
    ...new Set(rows.filter((r) => r.type === type).map((r) => r.targetId)),
  ];

  const listingIds = idsOf(ReportType.LISTING);
  const userIds = idsOf(ReportType.USER);
  const reviewIds = idsOf(ReportType.REVIEW);

  const [listings, users, reviews] = await Promise.all([
    listingIds.length
      ? prisma.listing.findMany({
          where: { id: { in: listingIds } },
          select: { id: true, title: true, owner: { select: { name: true } } },
        })
      : [],
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, status: true, deletedAt: true },
        })
      : [],
    reviewIds.length
      ? prisma.review.findMany({
          where: { id: { in: reviewIds } },
          select: {
            id: true,
            rating: true,
            comment: true,
            removedAt: true,
            reviewer: { select: { name: true } },
          },
        })
      : [],
  ]);

  const map = new Map<string, ReportTarget>();

  for (const listing of listings) {
    map.set(targetKey(ReportType.LISTING, listing.id), {
      kind: "listing",
      id: listing.id,
      title: listing.title,
      ownerName: listing.owner.name,
    });
  }

  for (const user of users) {
    map.set(targetKey(ReportType.USER, user.id), {
      kind: "user",
      id: user.id,
      name: user.name,
      status: user.status,
      isDeleted: user.deletedAt !== null,
    });
  }

  for (const review of reviews) {
    map.set(targetKey(ReportType.REVIEW, review.id), {
      kind: "review",
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      authorName: review.reviewer.name,
      isRemoved: review.removedAt !== null,
    });
  }

  return map;
}

/**
 * How many reports exist against each target on this page, across every status.
 *
 * Every status on purpose: a target with four previously dismissed reports and one new one is a
 * different situation from a target being reported for the first time, and counting only the
 * pending ones would hide exactly that.
 */
async function countReportsPerTarget(
  rows: readonly ReportRow[]
): Promise<Map<string, number>> {
  if (rows.length === 0) {
    return new Map();
  }

  const grouped = await prisma.report.groupBy({
    by: ["type", "targetId"],
    where: {
      OR: rows.map((row) => ({ type: row.type, targetId: row.targetId })),
    },
    _count: { _all: true },
  });

  return new Map(
    grouped.map((group) => [
      targetKey(group.type, group.targetId),
      group._count._all,
    ])
  );
}
