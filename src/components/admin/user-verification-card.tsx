"use client";

import { BadgeCheckIcon, Loader2Icon, MailCheckIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { setIdentityVerified } from "@/actions/identity-verification";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UserStatus } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/utils/date";

import type { AdminUserSummary } from "@/lib/queries/admin-users";

interface UserVerificationCardProps {
  user: AdminUserSummary;
  /** The signed-in admin, so the card can refuse to offer a self-grant. */
  adminId: string;
}

/**
 * One member, with the identity-verification control.
 *
 * SHOWS BOTH CLAIMS SEPARATELY, and that is the point of the layout. "Email confirmed" and "identity
 * verified" are different facts with different weight, and a screen that blurred them would let an
 * administrator grant the strong one on the evidence of the weak one - which is precisely the
 * mistake the two columns exist to prevent. The email line is context, never a reason.
 *
 * Suspension, banning and role changes are NOT here. They are Phase 6 user management, and bundling
 * them into a verification tool would put the platform's most consequential controls behind a search
 * box built for something else.
 */
function UserVerificationCard({ user, adminId }: UserVerificationCardProps) {
  const [pending, setPending] = useState(false);
  const isSelf = user.id === adminId;
  const canGrant = user.status === UserStatus.ACTIVE && !user.isDeleted;

  async function toggle() {
    setPending(true);

    const result = await setIdentityVerified({
      userId: user.id,
      verified: !user.isVerified,
    });

    setPending(false);

    if (!result.success) {
      toast.error(result.error);

      return;
    }

    toast.success(
      user.isVerified
        ? "Identity verification withdrawn."
        : "Identity verified."
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-3 px-(--card-spacing)">
        <div className="flex flex-wrap items-center gap-2">
          {/*
            Links to the ADMIN detail screen, not the public profile.
            A suspended or deleted account has no public profile at all - `getPublicProfile` filters
            them out and the route 404s - so from a moderation list the public link is exactly the
            one that breaks for the accounts most likely to be clicked.
          */}
          <Link
            href={`/admin/users/${user.id}`}
            className="font-heading text-sm font-medium underline-offset-4 hover:underline"
          >
            {user.name?.trim() || "Unnamed member"}
          </Link>

          {user.isVerified && (
            <Badge variant="secondary">
              <BadgeCheckIcon className="size-3" aria-hidden="true" />
              Verified
            </Badge>
          )}

          {user.status !== UserStatus.ACTIVE && (
            <Badge variant="outline">{user.status.toLowerCase()}</Badge>
          )}

          {user.isDeleted && <Badge variant="outline">deleted</Badge>}
        </div>

        {/*
          The email address. The only reliable way to tell two members with the same display name
          apart, which is the judgement this screen exists to support. Admin area only.
        */}
        <p className="text-muted-foreground text-xs break-all">{user.email}</p>

        <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
          <li className="flex items-center gap-2">
            <MailCheckIcon
              className={
                user.emailVerified
                  ? "size-3.5 shrink-0 text-emerald-600"
                  : "size-3.5 shrink-0"
              }
              aria-hidden="true"
            />
            {user.emailVerified
              ? `Email confirmed ${formatDate(user.emailVerified)}`
              : "Email not confirmed"}
            {/*
              Stated as context and labelled as insufficient. An administrator reading "email
              confirmed" as grounds to verify an identity is the exact error the separation of these
              two columns exists to prevent.
            */}
            <span className="italic">— not proof of identity</span>
          </li>

          <li>
            {user.isVerified
              ? `Identity verified${user.verifiedAt ? ` ${formatDate(user.verifiedAt)}` : ""}${
                  user.verifiedBy?.name ? ` by ${user.verifiedBy.name}` : ""
                }`
              : "Identity not verified"}
          </li>

          <li>Joined {formatDate(user.createdAt)}</li>
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={user.isVerified ? "outline" : "default"}
            onClick={toggle}
            disabled={pending || isSelf || (!canGrant && !user.isVerified)}
            aria-busy={pending}
          >
            {pending && <Loader2Icon className="animate-spin" />}
            {user.isVerified ? "Withdraw verification" : "Verify identity"}
          </Button>

          {/*
            Explained rather than left as a disabled control with no reason. The self-grant rule is
            the one an admin is most likely to hit and least likely to guess.
          */}
          {isSelf && (
            <span className="text-muted-foreground text-xs">
              You cannot verify your own account.
            </span>
          )}

          {!isSelf && !canGrant && !user.isVerified && (
            <span className="text-muted-foreground text-xs">
              Only an active account can be verified.
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

export { UserVerificationCard };
