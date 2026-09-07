import { EmailVerificationNotice } from "@/components/auth/email-verification-notice";
import { PageHeader } from "@/components/dashboard/page-header";
import { AvatarUploader } from "@/components/profile/avatar-uploader";
import { ProfileForm } from "@/components/profile/profile-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { isEmailEnabled } from "@/config/env";
import { UserRole } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getInitials } from "@/lib/utils/user";
import { formatPhone } from "@/lib/validations/profile";

import type { ProfileFormValues } from "@/lib/validations/profile";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your SamaanShare profile.",
};

/**
 * The member's own profile: photo, the four editable fields, and email confirmation.
 *
 * EVERY VALUE COMES FROM THE DATABASE, not the session, and the reason is the one
 * `emailVerified` already had before the form existed: the JWT is minted at sign-in, so
 * a token's copy of `name` can be 24 hours old. Seeding an edit form from it would let a
 * save silently write a stale name back over a newer one - the classic lost update, and
 * from the one screen whose whole job is editing that field.
 *
 * One read for all of it. `requireUser` makes its own query to check `status`, so this is
 * the second and last.
 */
export default async function ProfilePage() {
  const user = await requireUser();

  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      bio: true,
      city: true,
      phone: true,
      image: true,
      avatarUrl: true,
      emailVerified: true,
    },
  });

  // `requireUser` has already established the row exists and is active; this narrows the
  // type rather than handling a case that can happen.
  if (!current) {
    throw new Error("Signed-in user has no profile row.");
  }

  const defaults: ProfileFormValues = {
    name: current.name ?? "",
    bio: current.bio ?? "",
    city: current.city ?? "",
    // Stored as E.164 and shown grouped - `normalizePhone` accepts the spaced form back,
    // so what is displayed is also what can be re-submitted unchanged.
    phone: current.phone === null ? "" : formatPhone(current.phone),
  };

  return (
    <>
      <PageHeader
        title="Profile"
        description="How you appear to other members of SamaanShare."
      />

      <Card>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <AvatarUploader
              url={current.avatarUrl ?? current.image}
              initials={getInitials({
                name: current.name,
                // `?? null` rather than passing it through: `Session["user"].email` is
                // optional, and under `exactOptionalPropertyTypes` an explicit
                // `undefined` is not assignable to an optional `string | null`.
                email: user.email ?? null,
              })}
              // Only our own upload is ours to delete. Clearing `avatarUrl` would not
              // remove a Google picture, so offering "Remove" beside one would be a
              // button that appears to do nothing.
              canRemove={current.avatarUrl !== null}
            />

            <div className="flex flex-col items-end gap-1">
              {user.role === UserRole.ADMIN && (
                <Badge variant="secondary">Admin</Badge>
              )}
              {user.email && (
                <span className="text-muted-foreground truncate text-sm">
                  {user.email}
                </span>
              )}
            </div>
          </div>

          <ProfileForm defaults={defaults} />
        </CardContent>
      </Card>

      <EmailVerificationNotice
        isVerified={current.emailVerified !== null}
        canSend={isEmailEnabled()}
      />
    </>
  );
}
