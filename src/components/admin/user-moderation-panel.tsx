"use client";

import { Loader2Icon, ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  banUser,
  changeUserRole,
  reinstateUser,
  suspendUser,
} from "@/actions/admin-users";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserRole, UserStatus } from "@/generated/prisma/enums";
import {
  ADMIN_REASON_MAX,
  ADMIN_REASON_MIN,
  canBanUser,
  canChangeRole,
  canReinstateUser,
  canSuspendUser,
} from "@/lib/admin/rules";

import type { AdminUserDetail } from "@/lib/queries/admin-users";

interface UserModerationPanelProps {
  user: AdminUserDetail;
  /** The signed-in administrator, so the panel can refuse to offer self-action. */
  adminId: string;
  /** Active administrators right now, for the last-administrator explanation. */
  activeAdminCount: number;
}

type PendingAction = "suspend" | "ban" | "reinstate" | "promote" | "demote";

/**
 * Suspension, ban, reinstatement and role changes for one account.
 *
 * THE SAME PREDICATES THE SERVER USES decide which controls appear - `canSuspendUser` and friends
 * from `src/lib/admin/rules.ts`, imported here rather than re-expressed. A button the action would
 * refuse is a button that only produces an error, and a rule written twice is a rule that will
 * disagree with itself.
 *
 * EVERY ACTION REQUIRES A REASON, and the field is one shared box rather than one per control. What
 * is being recorded is the same thing each time - why this account's access changed - and four
 * separate boxes would invite four different standards of explanation.
 *
 * REFUSALS ARE SHOWN, NOT HIDDEN. When an action is unavailable the reason is printed beside it.
 * "Why is there no reinstate button" is a question an administrator would otherwise answer by
 * reading source, and the answers here are policy rather than accident.
 */
function UserModerationPanel({
  user,
  adminId,
  activeAdminCount,
}: UserModerationPanelProps) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<PendingAction | null>(null);

  const subject = {
    id: user.id,
    role: user.role,
    status: user.status,
    isDeleted: user.isDeleted,
  };

  const suspendable = canSuspendUser(adminId, subject);
  const bannable = canBanUser(adminId, subject);
  const reinstatable = canReinstateUser(adminId, subject);
  const promotable = canChangeRole({
    actorId: adminId,
    subject,
    newRole: UserRole.ADMIN,
    activeAdminCount,
  });
  const demotable = canChangeRole({
    actorId: adminId,
    subject,
    newRole: UserRole.USER,
    activeAdminCount,
  });

  const reasonReady = reason.trim().length >= ADMIN_REASON_MIN;

  async function run(
    action: PendingAction,
    call: () => Promise<{ success: boolean; error?: string }>,
    success: string
  ) {
    if (!reasonReady) {
      return;
    }

    setPending(action);

    const result = await call();

    setPending(null);

    if (!result.success) {
      toast.error(result.error ?? "Something went wrong.");

      return;
    }

    toast.success(success);
    setReason("");
  }

  const payload = () => ({ userId: user.id, reason: reason.trim() });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`reason-${user.id}`} className="text-xs font-medium">
          Reason — recorded permanently against this account
        </label>
        <Textarea
          id={`reason-${user.id}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={ADMIN_REASON_MAX}
          rows={3}
          placeholder="What happened, and why this action. Both are kept in the audit log."
          disabled={pending !== null}
        />
        {!reasonReady && (
          <p className="text-muted-foreground text-xs">
            At least {ADMIN_REASON_MIN} characters. Every action below requires
            one.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {suspendable.allowed && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending !== null || !reasonReady}
            aria-busy={pending === "suspend"}
            onClick={() =>
              run(
                "suspend",
                () => suspendUser(payload()),
                "Account suspended. They can be reinstated."
              )
            }
          >
            {pending === "suspend" && <Loader2Icon className="animate-spin" />}
            Suspend
          </Button>
        )}

        {reinstatable.allowed && (
          <Button
            size="sm"
            disabled={pending !== null || !reasonReady}
            aria-busy={pending === "reinstate"}
            onClick={() =>
              run(
                "reinstate",
                () => reinstateUser(payload()),
                "Account reinstated."
              )
            }
          >
            {pending === "reinstate" && (
              <Loader2Icon className="animate-spin" />
            )}
            <ShieldCheckIcon aria-hidden="true" />
            Reinstate
          </Button>
        )}

        {bannable.allowed && (
          <Button
            size="sm"
            variant="destructive"
            disabled={pending !== null || !reasonReady}
            aria-busy={pending === "ban"}
            onClick={() =>
              run(
                "ban",
                () => banUser(payload()),
                "Account banned. This is not reversible from here."
              )
            }
          >
            {pending === "ban" && <Loader2Icon className="animate-spin" />}
            <ShieldAlertIcon aria-hidden="true" />
            Ban
          </Button>
        )}

        {promotable.allowed && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending !== null || !reasonReady}
            aria-busy={pending === "promote"}
            onClick={() =>
              run(
                "promote",
                () => changeUserRole({ ...payload(), newRole: UserRole.ADMIN }),
                "Now an administrator."
              )
            }
          >
            {pending === "promote" && <Loader2Icon className="animate-spin" />}
            Make administrator
          </Button>
        )}

        {demotable.allowed && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending !== null || !reasonReady}
            aria-busy={pending === "demote"}
            onClick={() =>
              run(
                "demote",
                () => changeUserRole({ ...payload(), newRole: UserRole.USER }),
                "Administrator rights removed."
              )
            }
          >
            {pending === "demote" && <Loader2Icon className="animate-spin" />}
            Remove administrator
          </Button>
        )}
      </div>

      {/*
        Why an action is missing. Policy, not accident - and an administrator should not have to
        read source to find out that a ban is deliberately not reversible from here.
      */}
      <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
        {!suspendable.allowed &&
          user.status === UserStatus.ACTIVE &&
          !reinstatable.allowed && <li>{suspendable.reason}</li>}
        {!reinstatable.allowed && user.status === UserStatus.BANNED && (
          <li>{reinstatable.reason}</li>
        )}
        {!promotable.allowed && user.role === UserRole.USER && (
          <li>{promotable.reason}</li>
        )}
        {!demotable.allowed && user.role === UserRole.ADMIN && (
          <li>{demotable.reason}</li>
        )}
      </ul>
    </div>
  );
}

export { UserModerationPanel };
