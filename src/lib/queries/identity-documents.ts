import { IdentityDocumentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

import type { PaginatedResult } from "@/types";

export const IDENTITY_DOCUMENTS_PAGE_SIZE = 10;

/** One CNIC submission as the review queue shows it. Never carries an image URL - see the route. */
export interface AdminIdentityDocumentSummary {
  id: string;
  status: IdentityDocumentStatus;
  cnicNumber: string;
  rejectionReason: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewedByName: string | null;
  user: {
    id: string;
    name: string | null;
    email: string;
    city: string | null;
    phone: string | null;
    createdAt: Date;
    isVerified: boolean;
  };
}

interface IdentityDocumentPageOptions {
  status?: IdentityDocumentStatus;
  page?: number;
  pageSize?: number;
}

/**
 * A page of CNIC submissions, oldest first.
 *
 * Oldest first for the same reason as claims: a member is waiting on each one, and the one who has
 * waited longest should be decided next. Soft-deleted accounts are left out - there is nobody left to
 * verify.
 */
export async function getIdentityDocuments({
  status = IdentityDocumentStatus.PENDING,
  page = 1,
  pageSize = IDENTITY_DOCUMENTS_PAGE_SIZE,
}: IdentityDocumentPageOptions = {}): Promise<
  PaginatedResult<AdminIdentityDocumentSummary>
> {
  const currentPage = Math.max(1, Math.trunc(page));
  const where = { status, user: { deletedAt: null } };

  const [rows, total] = await Promise.all([
    prisma.identityDocument.findMany({
      where,
      orderBy: { submittedAt: "asc" },
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        status: true,
        cnicNumber: true,
        rejectionReason: true,
        submittedAt: true,
        reviewedAt: true,
        reviewedBy: { select: { name: true } },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            city: true,
            phone: true,
            createdAt: true,
            isVerified: true,
          },
        },
      },
    }),
    prisma.identityDocument.count({ where }),
  ]);

  return {
    items: rows.map(({ reviewedBy, ...row }) => ({
      ...row,
      reviewedByName: reviewedBy?.name ?? null,
    })),
    total,
    page: currentPage,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Submissions waiting for a decision - for the admin overview and nav badge, if wanted. */
export function countPendingIdentityDocuments(): Promise<number> {
  return prisma.identityDocument.count({
    where: {
      status: IdentityDocumentStatus.PENDING,
      user: { deletedAt: null },
    },
  });
}
