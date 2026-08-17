import { VerifyEmailForm } from "@/components/auth/verify-email-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Confirm your email",
  // The URL carries a credential. Never indexed.
  robots: { index: false, follow: false },
};

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string | string[] }>;
}

/**
 * Confirms an email address from an emailed link.
 *
 * THE TOKEN IS ONLY CHECKED FOR PRESENCE HERE. Whether it is real, unexpired, unspent and minted for
 * the current address is the action's job - deliberately, and for the same reason as
 * `/reset-password`: validating on render would let a crawler or a link preview consume a single-use
 * token before the person ever clicked. The form makes that a button press, so the write happens on
 * a POST and not on a GET.
 *
 * NOT GATED ON `isEmailEnabled()`, unlike `/forgot-password`, which 404s when email is unconfigured.
 * A link that has already been sent must stay redeemable even if the key is later rotated away: the
 * credential is out there, and refusing to honour it strands a user mid-signup.
 *
 * Sits under `(auth)` for its layout, but is listed in `PROTECTED_PREFIXES` rather than
 * `AUTH_ROUTES`. A signed-out visitor is sent to login with the token preserved in `callbackUrl`,
 * and a signed-in one is not bounced away - the person holding a live link is exactly who needs to
 * be here.
 */
export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const { token: raw } = await searchParams;

  // A repeated query parameter arrives as an array; take the first only.
  const token = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm your email</CardTitle>
        <CardDescription>
          One step, so we know we can reach you about your rentals.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <VerifyEmailForm token={token && token.length > 0 ? token : null} />
      </CardContent>
    </Card>
  );
}
