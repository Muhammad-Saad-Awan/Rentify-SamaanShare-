import { ClaimStatus } from "@/generated/prisma/enums";
import { claimResponseDueAt, CLAIM_RESPONSE_DAYS } from "@/lib/claims/rules";
import { prisma } from "@/lib/prisma";

/**
 * Moving unanswered claims to a human.
 *
 * WHY THIS EXISTS AT ALL. A claim that nobody answers cannot simply sit there: the deposit clock is
 * paused behind it, so the renter's money is in limbo and the owner has no route to a decision. The
 * obvious alternative - treating silence as acceptance - was rejected deliberately, because unlike a
 * handover record a claim has a price attached, and letting a missed notification cost someone money
 * is not a policy so much as a way of collecting from the inattentive.
 *
 * So silence escalates to `DISPUTED` and an administrator decides on the evidence. The renter loses
 * their chance to answer directly; they do not lose the money by default.
 *
 * WHY LAZY RATHER THAN SCHEDULED, which is the same argument as `expireStalePendingBookings` and
 * `releaseDueReviews`. A cron that silently stopped would leave claims open forever with deposits
 * frozen behind them and nothing in the app noticing. Sweeping on the read paths that care means an
 * overdue claim is escalated by definition the moment anyone looks at it.
 *
 * `respondedAt` stays null through an escalation, so a claim that reached `DISPUTED` because nobody
 * answered is distinguishable from one the renter actually contested. An administrator needs that
 * difference: one is a disagreement, the other is an absence.
 */

/**
 * Ceiling on one sweep.
 *
 * A backlog is escalated over several reads rather than in one long transaction. Oldest first, so
 * the claims that have waited longest go first.
 */
const MAX_ESCALATION_BATCH = 50;

/**
 * Escalates claims whose response window has closed.
 *
 * Scoped to one booking when given an id, which is the common case: a dashboard row only cares about
 * its own claim, and sweeping the whole table on every card render would be wasteful.
 *
 * Returns how many were escalated, mostly so callers can log or test it.
 */
export async function escalateOverdueClaims(
  bookingId?: string
): Promise<number> {
  const now = new Date();

  /**
   * Derived from `claimResponseDueAt` rather than re-deriving the arithmetic, so the query and the
   * pure predicate cannot disagree about the boundary - which would show a claim as escalated on one
   * screen and awaiting a response on another.
   */
  const cutoff = new Date(
    now.getTime() -
      (claimResponseDueAt(new Date(0)).getTime() - new Date(0).getTime())
  );

  const due = await prisma.damageClaim.findMany({
    where: {
      status: ClaimStatus.OPEN,
      filedAt: { lte: cutoff },
      ...(bookingId ? { bookingId } : {}),
    },
    orderBy: { filedAt: "asc" },
    take: MAX_ESCALATION_BATCH,
    select: { id: true },
  });

  if (due.length === 0) {
    return 0;
  }

  /**
   * Guarded on `status: OPEN` so a claim the renter answered between the read and the write is not
   * overwritten - the same compare-and-swap every other transition here uses. Note what is NOT set:
   * `respondedAt` stays null, which is how an escalation stays distinguishable from a real dispute.
   */
  const escalated = await prisma.damageClaim.updateMany({
    where: {
      id: { in: due.map((claim) => claim.id) },
      status: ClaimStatus.OPEN,
    },
    data: { status: ClaimStatus.DISPUTED },
  });

  return escalated.count;
}

/** Exported for copy that needs to state the window without importing the rules module. */
export const CLAIM_ESCALATION_DAYS = CLAIM_RESPONSE_DAYS;
