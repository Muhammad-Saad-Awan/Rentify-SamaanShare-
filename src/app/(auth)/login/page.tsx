import Link from "next/link";

import { GoogleButton } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldSeparator } from "@/components/ui/field";
import { CALLBACK_URL_PARAM, sanitizeCallbackUrl } from "@/config/routes";
import { getAuthErrorMessage } from "@/lib/auth/errors";
import { isGoogleEnabled } from "@/lib/auth/providers";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your SamaanShare account.",
};

/**
 * In Next 15 `searchParams` is a Promise and must be awaited - it was a plain
 * object in 14. Reading it without awaiting yields a Promise, not the params.
 */
interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  const rawCallbackUrl = params[CALLBACK_URL_PARAM];
  const callbackUrl = sanitizeCallbackUrl(
    // A repeated query parameter arrives as an array; take the first only.
    Array.isArray(rawCallbackUrl) ? rawCallbackUrl[0] : rawCallbackUrl
  );

  // Set by Auth.js redirect failures and by the `signIn` callback in auth.ts.
  const rawError = params.error;
  const errorCode = Array.isArray(rawError) ? rawError[0] : rawError;

  /**
   * Evaluated on the server, where the env vars exist. The result crosses to the
   * client as a rendered element or nothing at all - `AUTH_GOOGLE_ID` never
   * reaches the browser.
   */
  const googleEnabled = isGoogleEnabled();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Welcome back. Enter your details to continue.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {errorCode && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
          >
            {getAuthErrorMessage(errorCode)}
          </div>
        )}

        <LoginForm callbackUrl={callbackUrl} />

        {googleEnabled && (
          <>
            <FieldSeparator>or</FieldSeparator>
            <GoogleButton callbackUrl={callbackUrl} />
          </>
        )}

        <p className="text-muted-foreground text-center text-sm">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="text-foreground font-medium underline underline-offset-4"
          >
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
