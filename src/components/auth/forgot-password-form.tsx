"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { requestPasswordReset } from "@/actions/password-reset";
import { FormAlert } from "@/components/ui/form-alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { forgotPasswordSchema } from "@/lib/validations/auth";

import type { ForgotPasswordInput } from "@/lib/validations/auth";

/**
 * Asks for a reset link.
 *
 * THE FORM IS REPLACED BY THE CONFIRMATION, not left on screen with a message beside it. Leaving it
 * invites a second submission, which invalidates the link the first one just emailed - the user would
 * click the older link in their inbox and be told it has expired.
 *
 * The confirmation deliberately does not say whether the address is registered. That is the whole
 * design of the action behind it; see the enumeration note there.
 */
function ForgotPasswordForm() {
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ForgotPasswordInput) {
    setFormError(null);

    const result = await requestPasswordReset(values);

    if (!result.success) {
      setFormError(result.error);

      return;
    }

    setSentMessage(result.data.message);
  }

  if (sentMessage) {
    return (
      <FormAlert tone="success" title="Check your inbox">
        {sentMessage}
      </FormAlert>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        {formError && <FormAlert tone="error">{formError}</FormAlert>}

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

        <Button
          type="submit"
          size="lg"
          className="mt-1 w-full"
          disabled={isSubmitting}
        >
          {isSubmitting && <Loader2Icon className="animate-spin" />}
          {isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
      </FieldGroup>
    </form>
  );
}

export { ForgotPasswordForm };
