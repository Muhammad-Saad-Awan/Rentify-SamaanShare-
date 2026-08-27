import { describe, expect, it } from "vitest";

import {
  AdminActionType,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import {
  ADMIN_ACTION_LABELS,
  actionTypeForStatus,
  canBanUser,
  canChangeRole,
  canReinstateUser,
  canSuspendUser,
} from "@/lib/admin/rules";

import type { AdminSubject } from "@/lib/admin/rules";

/**
 * Administrator actions on accounts.
 *
 * The load-bearing assertions are the three lockouts: nobody acts on themselves, administrators are
 * not moderated through these controls, and the last active administrator cannot be demoted. The
 * third is the only mistake here with no in-app recovery - the way back would be database
 * credentials and the bootstrap script.
 */

const ADMIN_ID = "admin-1";

const subject = (overrides: Partial<AdminSubject> = {}): AdminSubject => ({
  id: "user-1",
  role: UserRole.USER,
  status: UserStatus.ACTIVE,
  isDeleted: false,
  ...overrides,
});

describe("canSuspendUser", () => {
  it("allows suspending an ordinary active account", () => {
    expect(canSuspendUser(ADMIN_ID, subject()).allowed).toBe(true);
  });

  /** Self-suspension locks the actor out mid-decision. */
  it("refuses acting on yourself", () => {
    const decision = canSuspendUser(ADMIN_ID, subject({ id: ADMIN_ID }));

    expect(decision.allowed).toBe(false);

    if (!decision.allowed) {
      expect(decision.reason).toContain("your own account");
    }
  });

  /**
   * A control that can disable an administrator is a way to take the platform's own controls away
   * from it. That decision belongs in the role change, made deliberately.
   */
  it("refuses moderating another administrator", () => {
    expect(
      canSuspendUser(ADMIN_ID, subject({ role: UserRole.ADMIN })).allowed
    ).toBe(false);
  });

  it("refuses a deleted account", () => {
    expect(canSuspendUser(ADMIN_ID, subject({ isDeleted: true })).allowed).toBe(
      false
    );
  });

  /** Re-stamping a banned account would quietly downgrade a stricter decision. */
  it("refuses an account that is already suspended or banned", () => {
    for (const status of [UserStatus.SUSPENDED, UserStatus.BANNED]) {
      expect(canSuspendUser(ADMIN_ID, subject({ status })).allowed).toBe(false);
    }
  });
});

describe("canBanUser", () => {
  it("allows banning an active account", () => {
    expect(canBanUser(ADMIN_ID, subject()).allowed).toBe(true);
  });

  /**
   * THE DIFFERENCE FROM SUSPENSION. Escalating a hold into an ending is the normal path, and
   * requiring a reinstatement first would briefly restore access to an account being removed for
   * cause.
   */
  it("allows escalating a suspension straight to a ban", () => {
    expect(
      canBanUser(ADMIN_ID, subject({ status: UserStatus.SUSPENDED })).allowed
    ).toBe(true);
  });

  it("refuses an account already banned", () => {
    expect(
      canBanUser(ADMIN_ID, subject({ status: UserStatus.BANNED })).allowed
    ).toBe(false);
  });

  it("refuses yourself, a deleted account, and another administrator", () => {
    expect(canBanUser(ADMIN_ID, subject({ id: ADMIN_ID })).allowed).toBe(false);
    expect(canBanUser(ADMIN_ID, subject({ isDeleted: true })).allowed).toBe(
      false
    );
    expect(
      canBanUser(ADMIN_ID, subject({ role: UserRole.ADMIN })).allowed
    ).toBe(false);
  });
});

describe("canReinstateUser", () => {
  it("allows lifting a suspension", () => {
    expect(
      canReinstateUser(ADMIN_ID, subject({ status: UserStatus.SUSPENDED }))
        .allowed
    ).toBe(true);
  });

  /**
   * THE ONE THAT GIVES BANNED ITS MEANING.
   *
   * Both states block sign-in identically and always have. What separates them is exactly this:
   * a suspension is a hold that can be lifted, a ban is the end of the relationship and undoing it
   * should cost more than clicking the same button backwards.
   */
  it("refuses to reverse a ban", () => {
    const decision = canReinstateUser(
      ADMIN_ID,
      subject({ status: UserStatus.BANNED })
    );

    expect(decision.allowed).toBe(false);

    if (!decision.allowed) {
      expect(decision.reason).toContain("not reversible");
    }
  });

  it("refuses an account that is already active", () => {
    expect(canReinstateUser(ADMIN_ID, subject()).allowed).toBe(false);
  });

  it("refuses acting on yourself", () => {
    expect(
      canReinstateUser(
        ADMIN_ID,
        subject({ id: ADMIN_ID, status: UserStatus.SUSPENDED })
      ).allowed
    ).toBe(false);
  });
});

describe("canChangeRole", () => {
  const change = (
    overrides: Partial<Parameters<typeof canChangeRole>[0]> = {}
  ) =>
    canChangeRole({
      actorId: ADMIN_ID,
      subject: subject(),
      newRole: UserRole.ADMIN,
      activeAdminCount: 2,
      ...overrides,
    });

  it("allows promoting an active member", () => {
    expect(change().allowed).toBe(true);
  });

  it("allows demoting an administrator while others remain", () => {
    expect(
      change({
        subject: subject({ role: UserRole.ADMIN }),
        newRole: UserRole.USER,
        activeAdminCount: 2,
      }).allowed
    ).toBe(true);
  });

  /**
   * THE LOCKOUT GUARD. Demoting the final administrator leaves nobody able to reach the admin area,
   * including to undo it. The only way back would be database credentials.
   */
  it("refuses demoting the last active administrator", () => {
    const decision = change({
      subject: subject({ role: UserRole.ADMIN }),
      newRole: UserRole.USER,
      activeAdminCount: 1,
    });

    expect(decision.allowed).toBe(false);

    if (!decision.allowed) {
      expect(decision.reason).toContain("last active administrator");
    }
  });

  /** Administrators ARE the subject of this action, so the moderation exclusion must not apply. */
  it("does not treat an administrator subject as off limits", () => {
    expect(
      change({
        subject: subject({ role: UserRole.ADMIN }),
        newRole: UserRole.USER,
        activeAdminCount: 3,
      }).allowed
    ).toBe(true);
  });

  it("refuses changing your own role", () => {
    expect(change({ subject: subject({ id: ADMIN_ID }) }).allowed).toBe(false);
  });

  it("refuses a change that is not a change", () => {
    expect(
      change({
        subject: subject({ role: UserRole.ADMIN }),
        newRole: UserRole.ADMIN,
      }).allowed
    ).toBe(false);
  });

  /**
   * Handing administrator rights to an account moderation has acted against turns a moderation
   * mistake into a loss of control.
   */
  it("refuses promoting a suspended or banned account", () => {
    for (const status of [UserStatus.SUSPENDED, UserStatus.BANNED]) {
      expect(change({ subject: subject({ status }) }).allowed).toBe(false);
    }
  });

  /** Demotion stays available in that state, which is the direction such a case needs. */
  it("still allows demoting a suspended administrator", () => {
    expect(
      change({
        subject: subject({
          role: UserRole.ADMIN,
          status: UserStatus.SUSPENDED,
        }),
        newRole: UserRole.USER,
        activeAdminCount: 3,
      }).allowed
    ).toBe(true);
  });

  it("refuses a deleted account", () => {
    expect(change({ subject: subject({ isDeleted: true }) }).allowed).toBe(
      false
    );
  });
});

describe("actionTypeForStatus", () => {
  it("maps every status to the action that produced it", () => {
    expect(actionTypeForStatus(UserStatus.SUSPENDED)).toBe(
      AdminActionType.SUSPEND_USER
    );
    expect(actionTypeForStatus(UserStatus.BANNED)).toBe(
      AdminActionType.BAN_USER
    );
    expect(actionTypeForStatus(UserStatus.ACTIVE)).toBe(
      AdminActionType.REINSTATE_USER
    );
  });
});

describe("ADMIN_ACTION_LABELS", () => {
  it("labels every action type", () => {
    for (const type of Object.values(AdminActionType)) {
      expect(ADMIN_ACTION_LABELS[type]?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("every refusal explains itself", () => {
  /** A refusal with no reason reads as a bug, and the person has no idea what to do next. */
  it("always returns a usable reason", () => {
    const refusals = [
      canSuspendUser(ADMIN_ID, subject({ id: ADMIN_ID })),
      canSuspendUser(ADMIN_ID, subject({ role: UserRole.ADMIN })),
      canBanUser(ADMIN_ID, subject({ status: UserStatus.BANNED })),
      canReinstateUser(ADMIN_ID, subject({ status: UserStatus.BANNED })),
      canChangeRole({
        actorId: ADMIN_ID,
        subject: subject({ role: UserRole.ADMIN }),
        newRole: UserRole.USER,
        activeAdminCount: 1,
      }),
    ];

    for (const decision of refusals) {
      expect(decision.allowed).toBe(false);

      if (!decision.allowed) {
        expect(decision.reason.length).toBeGreaterThan(15);
      }
    }
  });
});
