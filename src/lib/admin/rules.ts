import {
  AdminActionType,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";

/**
 * What an administrator may do to an account. Pure, so all of this is testable without a database.
 *
 * WHY THIS MODULE EXISTS AT ALL. These rules were already written once, inline inside
 * `applyReportAction`'s SUSPEND_USER branch in `src/actions/moderation.ts`. Adding a standalone
 * suspension to the members screen would have meant a second copy, and two copies of an
 * authorization rule is how one of them ends up missing the clause that mattered. `resolveReport`
 * now calls these, so there is one definition of who may be suspended.
 *
 * FOUR PROPERTIES THIS PROTECTS.
 *
 * 1. Nobody acts on themselves. Self-suspension locks the actor out mid-decision, and a self role
 *    change is the first thing a compromised administrator account would reach for.
 *
 * 2. Administrators are not moderated through these controls. A queue that can disable an
 *    administrator is a way to take the platform's own controls away from it; that decision belongs
 *    to a human with the intent to make it, not to a button beside a spam report.
 *
 * 3. The platform cannot be locked out of itself. Demoting the last active administrator would
 *    leave nobody able to reach the admin area - including to undo it.
 *
 * 4. A ban is terminal and a suspension is not. Both block sign-in identically today and always
 *    have; the difference introduced here is that reinstatement is offered from one and not the
 *    other, so ending a relationship is a deliberate act rather than a reversible toggle.
 */

/** Bound on the reason an administrator records. Required on every action. */
export const ADMIN_REASON_MAX = 1000;

/**
 * Floor on that reason.
 *
 * Low enough not to be a hurdle, high enough that "spam" alone does not become the permanent
 * explanation for why somebody lost their account.
 */
export const ADMIN_REASON_MIN = 10;

/** The account being acted on, reduced to what these rules need. */
export interface AdminSubject {
  id: string;
  role: UserRole;
  status: UserStatus;
  isDeleted: boolean;
}

export type AdminEligibility =
  { allowed: true } | { allowed: false; reason: string };

/**
 * The checks every moderation action shares.
 *
 * Ordered so the first refusal a person sees is the most informative one: acting on yourself is a
 * mistake worth naming before anything about the target's state.
 */
function commonGuards(
  actorId: string,
  subject: AdminSubject,
  verb: string
): AdminEligibility | null {
  if (actorId === subject.id) {
    return { allowed: false, reason: `You cannot ${verb} your own account.` };
  }

  if (subject.isDeleted) {
    return { allowed: false, reason: "That account has been deleted." };
  }

  if (subject.role === UserRole.ADMIN) {
    return {
      allowed: false,
      reason:
        "Administrators cannot be moderated here. Change their role first, deliberately.",
    };
  }

  return null;
}

/**
 * Whether this account may be suspended.
 *
 * ACTIVE only. Re-suspending an account already suspended adds nothing, and re-stamping one that has
 * been banned would quietly downgrade a stricter decision somebody else made.
 */
export function canSuspendUser(
  actorId: string,
  subject: AdminSubject
): AdminEligibility {
  const blocked = commonGuards(actorId, subject, "suspend");

  if (blocked) {
    return blocked;
  }

  if (subject.status !== UserStatus.ACTIVE) {
    return {
      allowed: false,
      reason:
        subject.status === UserStatus.SUSPENDED
          ? "That account is already suspended."
          : "That account has already been banned.",
    };
  }

  return { allowed: true };
}

/**
 * Whether this account may be banned.
 *
 * Permitted from ACTIVE *and* from SUSPENDED, unlike suspension. Escalating a hold into an ending is
 * the normal path - somebody is suspended while it is looked into, and banned once it has been - and
 * requiring a reinstatement first would mean briefly restoring access to an account being removed
 * for cause.
 */
export function canBanUser(
  actorId: string,
  subject: AdminSubject
): AdminEligibility {
  const blocked = commonGuards(actorId, subject, "ban");

  if (blocked) {
    return blocked;
  }

  if (subject.status === UserStatus.BANNED) {
    return { allowed: false, reason: "That account is already banned." };
  }

  return { allowed: true };
}

/**
 * Whether this account may be reinstated.
 *
 * SUSPENDED only, and that is the whole distinction between the two states. A suspension is a hold an
 * administrator can lift; a ban is the end of the relationship, and undoing one should cost more
 * than clicking the same button backwards.
 */
export function canReinstateUser(
  actorId: string,
  subject: AdminSubject
): AdminEligibility {
  if (actorId === subject.id) {
    return { allowed: false, reason: "You cannot reinstate your own account." };
  }

  if (subject.isDeleted) {
    return { allowed: false, reason: "That account has been deleted." };
  }

  if (subject.status === UserStatus.ACTIVE) {
    return { allowed: false, reason: "That account is already active." };
  }

  if (subject.status === UserStatus.BANNED) {
    return {
      allowed: false,
      reason:
        "A ban is not reversible from here. It is the end of the relationship, not a hold.",
    };
  }

  return { allowed: true };
}

interface RoleChangeInput {
  actorId: string;
  subject: AdminSubject;
  newRole: UserRole;
  /** How many active administrators exist right now, including the subject. */
  activeAdminCount: number;
}

/**
 * Whether this role change may be made.
 *
 * THE LAST-ADMINISTRATOR GUARD IS THE POINT. Demoting the final active administrator would leave
 * nobody able to reach the admin area at all - including to undo it - and the only route back would
 * be the bootstrap script and database credentials. It is the one mistake here with no in-app
 * recovery, so it is refused rather than warned about.
 *
 * Deliberately does NOT use `commonGuards`: promoting and demoting administrators is exactly what
 * this action is for, so the rule keeping them out of the moderation controls must not apply.
 */
export function canChangeRole({
  actorId,
  subject,
  newRole,
  activeAdminCount,
}: RoleChangeInput): AdminEligibility {
  if (actorId === subject.id) {
    return {
      allowed: false,
      reason:
        "You cannot change your own role. Ask another administrator to do it.",
    };
  }

  if (subject.isDeleted) {
    return { allowed: false, reason: "That account has been deleted." };
  }

  if (subject.role === newRole) {
    return {
      allowed: false,
      reason: `That account is already ${
        newRole === UserRole.ADMIN ? "an administrator" : "a standard member"
      }.`,
    };
  }

  /**
   * A suspended account cannot be promoted.
   *
   * Handing administrator rights to an account moderation has acted against is the one combination
   * that turns a moderation mistake into a loss of control. Demotion stays permitted in that state,
   * because that is the direction such a case actually needs.
   */
  if (newRole === UserRole.ADMIN && subject.status !== UserStatus.ACTIVE) {
    return {
      allowed: false,
      reason:
        "That account is not active, so it cannot be made an administrator.",
    };
  }

  if (
    newRole === UserRole.USER &&
    subject.role === UserRole.ADMIN &&
    activeAdminCount <= 1
  ) {
    return {
      allowed: false,
      reason:
        "That is the last active administrator. Promote someone else first, or nobody can reach the admin area.",
    };
  }

  return { allowed: true };
}

/** The action type a status change records, so the log and the write cannot disagree. */
export function actionTypeForStatus(status: UserStatus): AdminActionType {
  switch (status) {
    case UserStatus.SUSPENDED:
      return AdminActionType.SUSPEND_USER;
    case UserStatus.BANNED:
      return AdminActionType.BAN_USER;
    case UserStatus.ACTIVE:
      return AdminActionType.REINSTATE_USER;
  }
}

/** How each recorded action reads back on an account's history. */
export const ADMIN_ACTION_LABELS: Readonly<Record<AdminActionType, string>> = {
  [AdminActionType.SUSPEND_USER]: "Suspended",
  [AdminActionType.BAN_USER]: "Banned",
  [AdminActionType.REINSTATE_USER]: "Reinstated",
  [AdminActionType.CHANGE_ROLE]: "Role changed",
  [AdminActionType.VERIFY_IDENTITY]: "Identity verified",
  [AdminActionType.WITHDRAW_VERIFICATION]: "Verification withdrawn",
};
