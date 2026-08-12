import Link from "next/link";
import { notFound } from "next/navigation";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isEmailEnabled } from "@/config/env";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot password",
  description: "Request a link to reset your SamaanShare password.",
};

/**
 * Requests a reset link.
 *
 * 404s WHEN EMAIL IS NOT CONFIGURED. Same principle as the Google button: an unconfigured
 * integration is a feature that is not offered, not a broken one. Without a transport this page
 * would accept an address, report success, and send nothing - the worst possible outcome for a
 * recovery flow, because the user waits instead of looking for another way in. The login page hides
 * its link on the same condition, so this is the backstop for a direct visit.
 *
 * `notFound()` is thrown from the page rather than a layout, and that is safe here in a way it is
 * not for `/listings/[id]`: there is no `loading.tsx` above this route, so no shell has been flushed
 * and the 404 status is still the real one. See the note in AGENTS.md.
 */
export default async function ForgotPasswordPage() {
  if (!isEmailEnabled()) {
    notFound();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot your password?</CardTitle>
        <CardDescription>
          Enter the email address on your account and we will send you a link to
          choose a new password.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <ForgotPasswordForm />

        <p className="text-muted-foreground text-center text-sm">
          Remembered it?{" "}
          <Link
            href="/login"
            className="text-foreground font-medium underline underline-offset-4"
          >
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
