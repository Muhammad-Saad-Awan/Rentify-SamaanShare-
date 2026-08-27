"use server";

import { revalidatePath } from "next/cache";

import {
  AdminActionType,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import { writeAdminAction } from "@/lib/admin/log";
import {
  actionTypeForStatus,
  canBanUser,
  canChangeRole,
  canReinstateUser,
  canSuspendUser,
} from "@/lib/admin/rules";
import { getActiveAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { changeRoleSchema, moderateUserSchema } from "@/lib/validations/admin";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { AdminSubject } from "@/lib/admin/rules";
import type { ActionResult } from "@/types";

/**
 * Administrator actions on accounts. Phase 6.
 *
 * THE RULES LIVE IN `src/lib/admin/rules.ts`, NOT HERE. They were already written once, inline in
 * `applyReportAction`, and a second copy is how one of them ends up missing the clause that
 * mattered. `resolveReport` now calls the same predicates these do.
 *
 * EVERY ACTION WRITES AN AUDIT ROW, in the same transaction as the change it describes. A status
 * change without its record is the state this work exists to end - an account marked SUSPENDED with
 * no indication of who decided it or why - and a record without the change would be a claim that
 * something happened when it did not.
 *
 * NOTHING HERE REDIRECTS. `getActiveAdmin` rather than `requireAdmin`: an action invoked from a
 * button must return a result its caller can show, not navigate the page out from under an
 * administrator mid-decision and discard the reason they had typed.
 */

const UNEXPECTED_ERROR = "Something went wrong. Please try again.";

/**
 * Suspends an account. Reversible.
 *
 * A hold, not an ending - see `canReinstateUser` for the distinction from a ban, which is the whole
 * of what separates the two statuses.
 */
export async function suspendUser(input: unknown): Promise<ActionResult> {
  return moderate(input, UserStatus.SUSPENDED);
}

/**
 * Bans an account. Terminal.
 *
 * Permitted from ACTIVE and from SUSPENDED, so a hold can be escalated into an ending without
 * briefly restoring access to an account being removed for cause.
 */
export async function banUser(input: unknown): Promise<ActionResult> {
  return moderate(input, UserStatus.BANNED);
}

/** Lifts a suspension. Refused on a ban, which is not reversible from here. */
export async function reinstateUser(input: unknown): Promise<ActionResult> {
  return moderate(input, UserStatus.ACTIVE);
}

/**
 * The shared body of the three status changes.
 *
 * One path rather than three: the eligibility check differs by target status and everything else -
 * authorization, the audit row, the compare-and-swap, what gets revalidated - is identical, and
 * three copies is three chances to forget the log.
 */
async function moderate(
  input: unknown,
  target: UserStatus
): Promise<ActionResult> {
  const parsed = moderateUserSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the request.",
    };
  }

  const admin = await getActiveAdmin();

  if (!admin) {
    // One message for a signed-out caller and a signed-in non-admin, so this cannot be used to
    // discover whether an account holds the role.
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const { userId, reason } = parsed.data;

  try {
    const found = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true, deletedAt: true },
    });

    if (!found) {
      return { success: false, error: "That member was not found." };
    }

    const subject: AdminSubject = {
      id: found.id,
      role: found.role,
      status: found.status,
      isDeleted: found.deletedAt !== null,
    };

    const eligibility =
      target === UserStatus.SUSPENDED
        ? canSuspendUser(admin.id, subject)
        : target === UserStatus.BANNED
          ? canBanUser(admin.id, subject)
          : canReinstateUser(admin.id, subject);

    if (!eligibility.allowed) {
      return { success: false, error: eligibility.reason };
    }

    const applied = await prisma.$transaction(async (tx) => {
      /**
       * Compare-and-swap on the status we read.
       *
       * Two administrators working the same account is the ordinary case, not a hypothetical:
       * without the guard, a suspension and a ban issued moments apart would both report success
       * and the second would silently overwrite the first, leaving two audit rows describing
       * transitions only one of which happened.
       */
      const changed = await tx.user.updateMany({
        where: { id: subject.id, status: found.status, deletedAt: null },
        data: { status: target },
      });

      if (changed.count === 0) {
        return false;
      }

      await writeAdminAction(tx, {
        actorId: admin.id,
        subjectId: subject.id,
        type: actionTypeForStatus(target),
        reason,
        previousValue: found.status,
        newValue: target,
      });

      return true;
    });

    if (!applied) {
      return {
        success: false,
        error: "That account was just changed elsewhere. Please refresh.",
      };
    }

    revalidateAdminUserPaths(subject.id);

    return { success: true, data: undefined };
  } catch (error) {
    console.error("moderate user failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * Promotes or demotes an account.
 *
 * THE MOST CONSEQUENTIAL ACTION IN THE SYSTEM, and the only one whose failure mode has no in-app
 * recovery: demote the last active administrator and nobody can reach the admin area, including to
 * undo it. `canChangeRole` refuses that outright rather than warning about it.
 *
 * The administrator count is read inside the transaction, because the guard is only worth anything
 * if it sees the same state the write does - two concurrent demotions each seeing two admins would
 * otherwise both proceed and leave none.
 */
export async function changeUserRole(input: unknown): Promise<ActionResult> {
  const parsed = changeRoleSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Please check the request.",
    };
  }

  const admin = await getActiveAdmin();

  if (!admin) {
    return { success: false, error: UNAUTHENTICATED_ERROR };
  }

  const { userId, newRole, reason } = parsed.data;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const found = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, status: true, deletedAt: true },
      });

      if (!found) {
        return { error: "That member was not found." };
      }

      const activeAdminCount = await tx.user.count({
        where: {
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
      });

      const eligibility = canChangeRole({
        actorId: admin.id,
        subject: {
          id: found.id,
          role: found.role,
          status: found.status,
          isDeleted: found.deletedAt !== null,
        },
        newRole,
        activeAdminCount,
      });

      if (!eligibility.allowed) {
        return { error: eligibility.reason };
      }

      // Guarded on the role we just read, so a concurrent change is refused rather than overwritten.
      const changed = await tx.user.updateMany({
        where: { id: found.id, role: found.role, deletedAt: null },
        data: { role: newRole },
      });

      if (changed.count === 0) {
        return {
          error: "That account was just changed elsewhere. Please refresh.",
        };
      }

      await writeAdminAction(tx, {
        actorId: admin.id,
        subjectId: found.id,
        type: AdminActionType.CHANGE_ROLE,
        reason,
        previousValue: found.role,
        newValue: newRole,
      });

      return {};
    });

    if (outcome.error) {
      return { success: false, error: outcome.error };
    }

    revalidateAdminUserPaths(userId);

    return { success: true, data: undefined };
  } catch (error) {
    console.error("changeUserRole failed", error);

    return { success: false, error: UNEXPECTED_ERROR };
  }
}

/**
 * Refreshes what a status or role change affects.
 *
 * The member's own public profile, because a suspended account must stop having one, and the browse
 * pages, because `VISIBLE_LISTING_WHERE` filters on owner status - a suspended owner's listings have
 * to leave the marketplace, and a cached page would keep renting them out.
 */
function revalidateAdminUserPaths(userId: string): void {
  revalidatePath("/admin/users", "page");
  revalidatePath(`/admin/users/${userId}`, "page");
  revalidatePath(`/users/${userId}`, "page");
  revalidatePath("/listings", "page");
  revalidatePath("/", "page");
}
