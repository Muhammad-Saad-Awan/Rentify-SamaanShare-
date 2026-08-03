"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getAuthErrorMessage } from "@/lib/auth/errors";
import { loginSchema } from "@/lib/validations/auth";

import type { LoginInput } from "@/lib/validations/auth";

interface LoginFormProps {
  /** Already sanitised by the page - never trust the raw query parameter. */
  callbackUrl: string;
}

function LoginForm({ callbackUrl }: LoginFormProps) {
  const router = useRouter();

  /**
   * Errors that belong to the submission rather than to a single field. Field
   * errors live in `formState.errors`; this is for "incorrect email or
   * password", which cannot be attributed to either input without leaking which
   * one was wrong.
   */
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: LoginInput) {
    setFormError(null);

    /**
     * `redirect: false` keeps us on the page so a bad password can be shown
     * inline instead of bouncing through `/login?error=`. The trade-off is that
     * we own the post-success navigation.
     */
    const result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });

    if (!result || result.error) {
      setFormError(getAuthErrorMessage(result?.error));
      return;
    }

    /**
     * `refresh()` before `push()` matters. The session cookie was set by the
     * fetch above, but Server Components already rendered for this navigation
     * were cached without it - without a refresh the destination can paint as
     * signed-out.
     */
    router.refresh();
    router.push(callbackUrl);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        {formError && (
          <div
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
          >
            {formError}
          </div>
        )}

        <Field data-invalid={Boolean(errors.email)}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={Boolean(errors.email)}
            disabled={isSubmitting}
            {...form.register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field data-invalid={Boolean(errors.password)}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.password)}
            disabled={isSubmitting}
            {...form.register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}

export { LoginForm };
