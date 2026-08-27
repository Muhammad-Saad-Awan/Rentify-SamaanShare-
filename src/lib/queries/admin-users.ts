import { prisma } from "@/lib/prisma";

import type {
  AdminActionType,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import type { PaginatedResult } from "@/types";

/**
 * Member lookup for the admin area.
 *
 * SEARCH-FIRST, NOT BROWSE-FIRST. The page shows nothing until a query is entered, which is
 * deliberate: an administrator opening a screen has a person in mind, and a default listing of every
 * account turns an identity-verification tool into a directory of the user base, complete with email
 * addresses, that gets left open on a shared screen.
 *
 * `email` IS selected here, unlike every public query in this codebase. It is the only reliable way
 * to tell two members with the same display name apart, which is exactly the judgement this screen
 * exists to support. It never leaves the admin area.
 */

/** Members shown per page. */
export const ADMIN_USERS_PAGE_SIZE = 20;

export interface AdminUserSummary {
  id: string;
  name: string | null;
  email: string;
  city: string | null;
  role: UserRole;
  status: UserStatus;
  isVerified: boolean;
  verifiedAt: Date | null;
  /** Who granted the verification. Name only - an admin identifying a colleague. */
  verifiedBy: { name: string | null } | null;
  /** `null` until the address is confirmed. */
  emailVerified: Date | null;
  createdAt: Date;
  isDeleted: boolean;
}

interface AdminUserSearchOptions {
  query: string;
  /** Narrow to one standing. Omitted means every status. */
  status?: UserStatus | undefined;
  /** Narrow to one role. Omitted means both. */
  role?: UserRole | undefined;
  /** Narrow to verified or unverified identities. Omitted means both. */
  verified?: boolean | undefined;
  page?: number;
  pageSize?: number;
}

/**
 * Finds members by name or email.
 *
 * Case-insensitive substring on both. A prefix match would be faster and wrong for the actual task:
 * an administrator working from a report usually has a fragment - a domain, half a name as it was
 * typed to them - rather than the beginning of the stored value.
 *
 * Soft-deleted accounts ARE included, and flagged. Verification has to be withdrawable from an
 * account that has since been deleted, and hiding them would leave a granted badge with no way to
 * reach it.
 */
export async function searchUsers({
  query,
  status,
  role,
  verified,
  page = 1,
  pageSize = ADMIN_USERS_PAGE_SIZE,
}: AdminUserSearchOptions): Promise<PaginatedResult<AdminUserSummary>> {
  const trimmed = query.trim();
  const currentPage = Math.max(1, Math.trunc(page));

  const hasFilter =
    status !== undefined || role !== undefined || verified !== undefined;

  /**
   * Nothing is listed for an empty query UNLESS a filter is applied.
   *
   * The search-first rule exists so this screen is not a browsable directory of the user base with
   * email addresses attached. A filter is a different request: "show me the suspended accounts" is
   * an operational question with a bounded answer, where "show me everyone" is a dossier. So a
   * filter opens the listing and a blank screen does not.
   */
  if (trimmed.length === 0 && !hasFilter) {
    return {
      items: [],
      total: 0,
      page: currentPage,
      pageSize,
      totalPages: 1,
    };
  }

  const where = {
    ...(status !== undefined ? { status } : {}),
    ...(role !== undefined ? { role } : {}),
    ...(verified !== undefined ? { isVerified: verified } : {}),
    ...(trimmed.length > 0
      ? {
          OR: [
            { name: { contains: trimmed, mode: "insensitive" as const } },
            { email: { contains: trimmed, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  // Concurrent reads, not a transaction - see the note in `getActiveListings`.
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        city: true,
        role: true,
        status: true,
        isVerified: true,
        verifiedAt: true,
        verifiedBy: { select: { name: true } },
        emailVerified: true,
        createdAt: true,
        deletedAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      city: row.city,
      role: row.role,
      status: row.status,
      isVerified: row.isVerified,
      verifiedAt: row.verifiedAt,
      verifiedBy: row.verifiedBy,
      emailVerified: row.emailVerified,
      createdAt: row.createdAt,
      isDeleted: row.deletedAt !== null,
    })),
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** One recorded administrator action, as the detail screen shows it. */
export interface AdminActionEntry {
  id: string;
  type: AdminActionType;
  reason: string;
  previousValue: string | null;
  newValue: string | null;
  createdAt: Date;
  /** Name only. An administrator identifying a colleague, not contacting them. */
  actor: { name: string | null } | null;
  /** Set when the action answered a report, so the queue and this screen agree. */
  reportId: string | null;
}

export interface AdminUserDetail extends AdminUserSummary {
  bio: string | null;
  phone: string | null;
  /** Counts, not rows: this screen decides about a person, not about their inventory. */
  listingCount: number;
  bookingsAsRenter: number;
  bookingsAsOwner: number;
  /** Reports filed BY them and AGAINST them - the second is the one that matters here. */
  reportsFiled: number;
  reportsAgainst: number;
  /** Everything staff have done to this account, newest first. */
  history: AdminActionEntry[];
}

/**
 * One member, with the whole record an administrator needs to decide about them.
 *
 * `null` for an id that does not exist, so the route can turn it into a real 404 from its layout
 * rather than rendering an empty screen - see the invariant in AGENTS.md.
 *
 * SOFT-DELETED ACCOUNTS ARE RETURNED, unlike every public query. Verification has to be withdrawable
 * from an account that has since been deleted, and a moderator looking into a complaint about
 * somebody who then deleted themselves still needs to see what happened.
 *
 * `phone` is selected here and nowhere public. Two members can share a display name and even a
 * plausible email; the phone number is often what settles which account a report is about.
 */
export async function getAdminUserDetail(
  id: string
): Promise<AdminUserDetail | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      bio: true,
      city: true,
      role: true,
      status: true,
      isVerified: true,
      verifiedAt: true,
      verifiedBy: { select: { name: true } },
      emailVerified: true,
      createdAt: true,
      deletedAt: true,
      adminActionsReceived: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          reason: true,
          previousValue: true,
          newValue: true,
          createdAt: true,
          reportId: true,
          actor: { select: { name: true } },
        },
      },
      _count: {
        select: {
          listings: true,
          bookingsAsRenter: true,
          bookingsAsOwner: true,
          reportsSubmitted: true,
        },
      },
    },
  });

  if (!user) {
    return null;
  }

  /**
   * Reports against them cannot come from `_count`.
   *
   * `Report.targetId` is polymorphic with no foreign key (D4), so there is no relation to count -
   * the same limitation that made damage claims need their own model. Counted separately, matching
   * on the user's own id as a USER-type target.
   */
  const reportsAgainst = await prisma.report.count({
    where: { type: "USER", targetId: user.id },
  });

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    bio: user.bio,
    city: user.city,
    role: user.role,
    status: user.status,
    isVerified: user.isVerified,
    verifiedAt: user.verifiedAt,
    verifiedBy: user.verifiedBy,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    isDeleted: user.deletedAt !== null,
    listingCount: user._count.listings,
    bookingsAsRenter: user._count.bookingsAsRenter,
    bookingsAsOwner: user._count.bookingsAsOwner,
    reportsFiled: user._count.reportsSubmitted,
    reportsAgainst,
    history: user.adminActionsReceived,
  };
}

/**
 * How many active administrators exist.
 *
 * Read by the members screen so the last-administrator guard can be explained before somebody
 * attempts a demotion, rather than only refusing it afterwards. `canChangeRole` enforces it inside
 * the transaction regardless - this is for the sentence on the page, not the rule.
 */
export async function getActiveAdminCount(): Promise<number> {
  return prisma.user.count({
    where: { role: "ADMIN", status: "ACTIVE", deletedAt: null },
  });
}
