import Link from "next/link";

import { GoogleButton } from "@/components/auth/google-button";
import { RegisterForm } from "@/components/auth/register-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldSeparator } from "@/components/ui/field";
import { CALLBACK_URL_PARAM, sanitizeCallbackUrl } from "@/config/routes";
import { isGoogleEnabled } from "@/lib/auth/providers";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Join SamaanShare to rent and lend items across Pakistan.",
};

interface RegisterPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RegisterPage({
  searchParams,
}: RegisterPageProps) {
  const params = await searchParams;

  const rawCallbackUrl = params[CALLBACK_URL_PARAM];
  const callbackUrl = sanitizeCallbackUrl(
    Array.isArray(rawCallbackUrl) ? rawCallbackUrl[0] : rawCallbackUrl
  );

  const googleEnabled = isGoogleEnabled();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an account</CardTitle>
        <CardDescription>
          Rent what you need, lend what you don&apos;t.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <RegisterForm callbackUrl={callbackUrl} />

        {googleEnabled && (
          <>
            <FieldSeparator>or</FieldSeparator>
            {/*
              Google's flow is identical for sign-up and sign-in: the adapter
              creates the user on first return, so there is no separate
              "register with Google" path.
            */}
            <GoogleButton callbackUrl={callbackUrl} />
          </>
        )}

        <p className="text-muted-foreground text-center text-sm">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-foreground font-medium underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
