import {
  HandoverConfirmation,
  ReportStatus,
  ReportType,
} from "@/generated/prisma/enums";

import type { ClaimStatus } from "@/generated/prisma/enums";

/**
 * When an administrator may read a private conversation. Pure.
 *
 * ADMINISTRATORS DO NOT HAVE ACCESS BY ROLE. A conversation belongs to its two participants, and being
 * staff is not a reason to read it. What is a reason is a matter staff have to decide that the
 * conversation is evidence for. There are three:
 *
 *   - CLAIM: a deposit claim on a booking between these two people about this listing. Any status -
 *     a resolved claim can be appealed, and the thread is the record of what was agreed at handover.
 *   - DISPUTE: a handover record on such a booking that the other party disputed.
 *   - REPORT: a USER report one participant filed against the other, while PENDING or after it was
 *     RESOLVED. A DISMISSED report was found to have nothing in it, and is not grounds.
 *
 * READ-ONLY, AND EVERY READ IS LOGGED. The caller writes a VIEW_CONVERSATION `AdminAction` naming the
 * ground and the administrator's reason BEFORE returning any message. This module only decides
 * whether a ground exists and who the entry is about.
 *
 * The inputs are the rows on the bookings between this renter and owner for this listing, found by
 * (listingId, renterId) rather than by `Booking.conversationId`. Bookings made before chat existed
 * have no link, and a claim on one is still grounds.
 */

export type AdminViewGroundKind = "claim" | "dispute" | "report";

export interface AdminViewGround {
  kind: AdminViewGroundKind;
  /** The claim, handover record or report id. */
  id: string;
  /** Who the audit entry is about - see `AdminAction.subjectId`. */
  subjectId: string;
}

interface GroundInputs {
  renterId: string;
  ownerId: string;
  claims: readonly {
    id: string;
    status: ClaimStatus;
    respondentId: string;
  }[];
  handovers: readonly {
    id: string;
    confirmation: HandoverConfirmation;
    recordedById: string;
  }[];
  reports: readonly {
    id: string;
    type: ReportType;
    status: ReportStatus;
    reporterId: string;
    targetId: string;
  }[];
}

/** Report statuses that still justify reading the conversation. */
const REPORT_GROUND_STATUSES: readonly ReportStatus[] = [
  ReportStatus.PENDING,
  ReportStatus.RESOLVED,
];

/**
 * Every ground on which an administrator may read this conversation. Empty means none.
 *
 * Subjects follow the payment actions' rule - whoever the matter is about:
 *   - a claim is about its respondent;
 *   - a dispute is about the party whose record was disputed;
 *   - a report is about its target.
 *
 * Reports are matched in both directions, and only between these two people. A report against the
 * owner by some third party is about the owner, not about this conversation.
 */
export function adminConversationGrounds({
  renterId,
  ownerId,
  claims,
  handovers,
  reports,
}: GroundInputs): AdminViewGround[] {
  const grounds: AdminViewGround[] = [];

  // Every claim status is a ground - see the module note.
  for (const claim of claims) {
    grounds.push({
      kind: "claim",
      id: claim.id,
      subjectId: claim.respondentId,
    });
  }

  for (const handover of handovers) {
    if (handover.confirmation === HandoverConfirmation.DISPUTED) {
      grounds.push({
        kind: "dispute",
        id: handover.id,
        subjectId: handover.recordedById,
      });
    }
  }

  const pair = new Set([renterId, ownerId]);

  for (const report of reports) {
    if (
      report.type === ReportType.USER &&
      REPORT_GROUND_STATUSES.includes(report.status) &&
      report.reporterId !== report.targetId &&
      pair.has(report.reporterId) &&
      pair.has(report.targetId)
    ) {
      grounds.push({
        kind: "report",
        id: report.id,
        subjectId: report.targetId,
      });
    }
  }

  return grounds;
}

/**
 * The ground an administrator named, if it is one of the real ones.
 *
 * The administrator names it rather than the server picking one, so the audit entry records what
 * they actually said they were looking into. A ground that is not in the list is refused, so the
 * request cannot cite a claim on some other booking.
 */
export function findAdminViewGround(
  grounds: readonly AdminViewGround[],
  requested: { kind: AdminViewGroundKind; id: string }
): AdminViewGround | null {
  return (
    grounds.find(
      (ground) => ground.kind === requested.kind && ground.id === requested.id
    ) ?? null
  );
}

/** How a ground is written into `AdminAction.newValue`, for the history screen. */
export function describeAdminViewGround(ground: AdminViewGround): string {
  return `${ground.kind}:${ground.id}`;
}
