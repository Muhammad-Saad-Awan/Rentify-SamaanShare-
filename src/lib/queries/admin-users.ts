import { prisma } from "@/lib/prisma";

import type { UserRole, UserStatus } from "@/generated/prisma/enums";
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
  page = 1,
  pageSize = ADMIN_USERS_PAGE_SIZE,
}: AdminUserSearchOptions): Promise<PaginatedResult<AdminUserSummary>> {
  const trimmed = query.trim();
  const currentPage = Math.max(1, Math.trunc(page));

  if (trimmed.length === 0) {
    return {
      items: [],
      total: 0,
      page: currentPage,
      pageSize,
      totalPages: 1,
    };
  }

  const where = {
    OR: [
      { name: { contains: trimmed, mode: "insensitive" as const } },
      { email: { contains: trimmed, mode: "insensitive" as const } },
    ],
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
