"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { resetPassword } from "@/actions/password-reset";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DEFAULT_LOGIN_REDIRECT } from "@/config/routes";
import { resetPasswordSchema } from "@/lib/validations/auth";

import type { ResetPasswordInput } from "@/lib/validations/auth";

interface ResetPasswordFormProps {
  /** Straight from the query string - shape-validated by the schema, never trusted for meaning. */
  token: string;
}

/**
 * Chooses a new password from a reset link.
 *
 * SIGNS THE USER IN ON SUCCESS. The alternative - bounce to the login page and make them type the
 * password they just chose - is the moment people give up, and they have already proved control of
 * the mailbox and just set the credential. Done with the same `redirect: false` + `refresh()` pattern
 * as the login form, so a sign-in failure after a *successful* reset stays distinguishable from the
 * reset failing.
 *
 * The token is carried in a hidden field rather than re-read from the URL at submit time, so a
 * client-side navigation cannot change it mid-flight.
 */
function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [signInFailed, setSignInFailed] = useState(false);

  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "", confirmPassword: "" },
  });

  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ResetPasswordInput) {
    setFormError(null);

    const result = await resetPassword(values);

    if (!result.success) {
      setFormError(result.error);

      return;
    }

    const signedIn = await signIn("credentials", {
      email: result.data.email,
      password: values.password,
      redirect: false,
    });

    if (!signedIn || signedIn.error) {
      // The password *was* changed. Saying so matters - otherwise the user retries the reset with a
      // token that is now spent and concludes the whole thing is broken.
      setSignInFailed(true);

      return;
    }

    router.refresh();
    router.push(DEFAULT_LOGIN_REDIRECT);
  }

  if (signInFailed) {
    return (
      <div className="flex flex-col gap-3">
        <div
          role="status"
          className="border-primary/30 bg-accent/40 rounded-lg border px-3 py-3 text-sm leading-relaxed"
        >
          Your password has been changed, but we could not sign you in
          automatically. Please sign in with your new password.
        </div>

        <Button className="w-full" render={<Link href="/login" />}>
          Go to sign in
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        {formError && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
          >
            {formError}{" "}
            <Link
              href="/forgot-password"
              className="font-medium underline underline-offset-4"
            >
              Request a new link
            </Link>
          </div>
        )}

        <input type="hidden" {...form.register("token")} />

        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">New password</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.password)}
            disabled={isSubmitting}
            {...form.register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>

        <Field data-invalid={Boolean(errors.confirmPassword)}>
          <FieldLabel htmlFor="confirmPassword">
            Confirm new password
          </FieldLabel>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirmPassword)}
            disabled={isSubmitting}
            {...form.register("confirmPassword")}
          />
          <FieldError errors={[errors.confirmPassword]} />
        </Field>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Set new password"}
        </Button>
      </FieldGroup>
    </form>
  );
}

export { ResetPasswordForm };
