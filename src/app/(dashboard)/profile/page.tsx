import { UserIcon } from "lucide-react";

import { EmailVerificationNotice } from "@/components/auth/email-verification-notice";
import { PageHeader } from "@/components/dashboard/page-header";
import { PlaceholderCard } from "@/components/dashboard/placeholder-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { isEmailEnabled } from "@/config/env";
import { UserRole } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getDisplayName, getInitials } from "@/lib/utils/user";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your SamaanShare profile.",
};

/**
 * Profile page. Read-only apart from email confirmation.
 *
 * Shows what the session already holds - name, email, role - so the page is not
 * empty, without adding the edit form, the Cloudinary upload or the city and
 * phone fields, all of which are Phase 1's remaining profile work.
 *
 * ONE DATABASE READ, for `emailVerified`. It cannot come from the session: the
 * JWT is minted at sign-in, so a user who confirms their address would keep
 * seeing the prompt for up to 24 hours - the same staleness that made
 * `requireUser` re-read `status`.
 */
export default async function ProfilePage() {
  const user = await requireUser();

  const current = await prisma.user.findUnique({
    where: { id: user.id },
    select: { emailVerified: true },
  });

  return (
    <>
      <PageHeader
        title="Profile"
        description="How you appear to other members of SamaanShare."
      />

      <Card>
        <CardContent className="flex items-center gap-4">
          <Avatar size="lg">
            {user.image && <AvatarImage src={user.image} alt="" />}
            <AvatarFallback>{getInitials(user)}</AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-heading font-medium">
                {getDisplayName(user)}
              </span>
              {user.role === UserRole.ADMIN && (
                <Badge variant="secondary">Admin</Badge>
              )}
            </div>

            {user.email && (
              <span className="text-muted-foreground truncate text-sm">
                {user.email}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <EmailVerificationNotice
        isVerified={current?.emailVerified !== null}
        canSend={isEmailEnabled()}
      />

      <PlaceholderCard
        icon={UserIcon}
        title="Profile editing"
        description="Editing your name, bio, city and phone number, plus profile photo upload, completes in Phase 1's remaining profile work."
        phase="Phase 1"
      />
    </>
  );
}
