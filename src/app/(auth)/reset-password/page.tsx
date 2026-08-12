import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reset password",
  // Nothing here should ever be indexed: the URL carries a live credential.
  robots: { index: false, follow: false },
};

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

/**
 * Sets a new password from an emailed link.
 *
 * DOES NOT 404 WHEN EMAIL IS UNCONFIGURED, unlike `/forgot-password`. A token that was already
 * emailed must stay redeemable even if the key is later rotated or removed - the credential is
 * already out there, and refusing to honour it would strand the user with no route back in.
 *
 * The token is only checked for *presence* here. Whether it is real, unexpired and unspent is the
 * action's job, and deliberately so: validating it on render would mean a crawler or a link
 * preview fetching this URL could consume a single-use token before the user ever clicked.
 */
export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const { token: raw } = await searchParams;

  // A repeated query parameter arrives as an array; take the first only.
  const token = (Array.isArray(raw) ? raw[0] : raw)?.trim();

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>That link is incomplete</CardTitle>
          <CardDescription>
            The reset link is missing its token. Some email clients break long
            links across lines — try copying the whole thing, or request a new
            one.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Button className="w-full" render={<Link href="/forgot-password" />}>
            Request a new link
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>
          Pick something you have not used elsewhere. You will be signed in once
          it is saved.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ResetPasswordForm token={token} />
      </CardContent>
    </Card>
  );
}
