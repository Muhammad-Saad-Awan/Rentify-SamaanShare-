import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";

import { EmailVerificationNotice } from "@/components/auth/email-verification-notice";
import { PageHeader } from "@/components/dashboard/page-header";
import { AvatarUploader } from "@/components/profile/avatar-uploader";
import { IdentityDocumentSection } from "@/components/profile/identity-document-section";
import { ProfileForm } from "@/components/profile/profile-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { isEmailEnabled } from "@/config/env";
import { UserRole } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/session";
import { isIdentityDocumentRequired } from "@/lib/identity/gate";
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
 * ORDER FOLLOWS URGENCY. An unconfirmed address blocks renting and listing, so its banner comes
 * first; the details card is the page's main job; the confirmed-email row and the CNIC section sit
 * together below it as the member's standing. Once everything is confirmed nothing shouts, and the
 * form is the first thing on the page.
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
      identityDocument: {
        select: {
          status: true,
          cnicNumber: true,
          rejectionReason: true,
          submittedAt: true,
        },
      },
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

  const isEmailConfirmed = current.emailVerified !== null;
  // Spread rather than passed as `email={user.email}`: under `exactOptionalPropertyTypes` an
  // explicit `undefined` is not assignable to the optional prop.
  const emailProp = user.email ? { email: user.email } : {};

  return (
    <>
      <PageHeader
        title="Profile"
        description="How you appear to other members of SamaanShare."
        actions={
          <Button
            variant="outline"
            render={<Link href={`/users/${user.id}`} />}
          >
            <ExternalLinkIcon aria-hidden="true" />
            View public profile
          </Button>
        }
      />

      {!isEmailConfirmed && (
        <EmailVerificationNotice
          isVerified={false}
          canSend={isEmailEnabled()}
          {...emailProp}
        />
      )}

      <Card>
        <CardHeader className="border-b">
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Your details
          </h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Name, bio and city are public. Your phone number never is.
          </p>
          {user.role === UserRole.ADMIN && (
            <CardAction>
              <Badge variant="secondary">Admin</Badge>
            </CardAction>
          )}
        </CardHeader>

        <CardContent className="flex flex-col gap-8">
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

          <ProfileForm defaults={defaults} />
        </CardContent>
      </Card>

      {isEmailConfirmed && (
        <EmailVerificationNotice
          isVerified
          canSend={isEmailEnabled()}
          {...emailProp}
        />
      )}

      {/* Hidden where uploads are not configured - see `isIdentityDocumentRequired`. */}
      {isIdentityDocumentRequired() && (
        <IdentityDocumentSection document={current.identityDocument} />
      )}
    </>
  );
}
