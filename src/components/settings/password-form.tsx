"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { changePassword, setPassword } from "@/actions/security";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  changePasswordSchema,
  PASSWORD_MIN_LENGTH,
  setPasswordSchema,
} from "@/lib/validations/auth";

import type {
  ChangePasswordInput,
  SetPasswordInput,
} from "@/lib/validations/auth";
import type {
  FieldError as FieldErrorType,
  UseFormRegisterReturn,
} from "react-hook-form";

/**
 * The password half of `/settings`.
 *
 * TWO COMPONENTS, NOT ONE WITH A FLAG, because they are two different operations rather
 * than one operation with an optional field. Changing a password requires proving you
 * know the current one; setting a first password on a Google-only account has none to
 * prove and rests on the session instead. Collapsing them would mean one schema with an
 * optional `currentPassword`, and an optional check is not a check - the server actions
 * are split for the same reason.
 *
 * What they share is `PasswordField`, which is presentational and takes a
 * `UseFormRegisterReturn`. That type is not generic over the form's values, so one
 * component serves both without either form's types leaking into the other.
 *
 * The new password is never sent anywhere but the action, and the form is reset on
 * success so it is not left sitting in the DOM.
 */

const POLICY_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a number.`;

/**
 * Changing a password on an account that already has one.
 *
 * SIGNS BACK IN AFTERWARDS, which is not cosmetic. `changePassword` increments
 * `User.tokenVersion` to revoke every session issued under the old password, and this
 * browser's cookie is one of them - without the re-sign-in the member would be bounced to
 * the login page by the very next request, having done nothing wrong. Same
 * `redirect: false` + `refresh()` pattern as `ResetPasswordForm`, including the reason:
 * a failure *after* a successful change has to stay distinguishable from the change
 * failing, or the member retries and is told their current password is wrong.
 */
function ChangePasswordForm() {
  const router = useRouter();
  const [signInFailed, setSignInFailed] = useState(false);

  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: ChangePasswordInput) {
    const result = await changePassword(values);

    if (!result.success) {
      /**
       * Reported against the current-password field when that is what was wrong.
       *
       * `setError` rather than a banner: "Your current password is not correct" is about
       * one input, and putting it there means a screen reader announces it with the field
       * the person has to retype - which a banner at the top of the form does not.
       */
      if (result.error === "Your current password is not correct.") {
        form.setError("currentPassword", { message: result.error });
        form.resetField("currentPassword");

        return;
      }

      toast.error(result.error);

      return;
    }

    // The email comes from the action, read fresh from the database, rather than from
    // the session - whose copy is a snapshot from whenever the token was minted.
    const signedIn = await signIn("credentials", {
      email: result.data.email,
      password: values.newPassword,
      redirect: false,
    });

    // Cleared before anything else can go wrong: three plaintext passwords have no
    // reason to stay in form state once the change has been accepted.
    form.reset();

    if (!signedIn || signedIn.error) {
      // The password WAS changed. Saying so is the whole point - otherwise the member
      // tries again with a "current password" that no longer exists and concludes the
      // feature is broken.
      setSignInFailed(true);

      return;
    }

    toast.success("Password changed. Any other devices have been signed out.");

    router.refresh();
  }

  if (signInFailed) {
    return (
      <div
        role="status"
        className="border-primary/30 bg-accent/40 rounded-lg border px-3 py-3 text-sm leading-relaxed"
      >
        Your password has been changed and every session has been signed out,
        including this one, but we could not sign you back in automatically.
        Please sign in again with your new password.
      </div>
    );
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
      noValidate
    >
      <FieldGroup>
        <PasswordField
          id="currentPassword"
          label="Current password"
          autoComplete="current-password"
          disabled={isSubmitting}
          error={errors.currentPassword}
          registration={form.register("currentPassword")}
        />

        <PasswordField
          id="newPassword"
          label="New password"
          description={POLICY_HINT}
          autoComplete="new-password"
          disabled={isSubmitting}
          error={errors.newPassword}
          registration={form.register("newPassword")}
        />

        <PasswordField
          id="confirmPassword"
          label="Confirm new password"
          autoComplete="new-password"
          disabled={isSubmitting}
          error={errors.confirmPassword}
          registration={form.register("confirmPassword")}
        />
      </FieldGroup>

      <SubmitRow isSubmitting={isSubmitting} label="Change password" />
    </form>
  );
}

/** Adding a first password to an account that signs in with Google only. */
function SetPasswordForm() {
  const form = useForm<SetPasswordInput>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const { errors, isSubmitting } = form.formState;

  async function onSubmit(values: SetPasswordInput) {
    const result = await setPassword(values);

    if (!result.success) {
      toast.error(result.error);

      return;
    }

    form.reset();

    toast.success("Password set. You can now sign in with your email address.");
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-6"
      noValidate
    >
      <FieldGroup>
        <PasswordField
          id="newPassword"
          label="Password"
          description={POLICY_HINT}
          autoComplete="new-password"
          disabled={isSubmitting}
          error={errors.newPassword}
          registration={form.register("newPassword")}
        />

        <PasswordField
          id="confirmPassword"
          label="Confirm password"
          autoComplete="new-password"
          disabled={isSubmitting}
          error={errors.confirmPassword}
          registration={form.register("confirmPassword")}
        />
      </FieldGroup>

      <SubmitRow isSubmitting={isSubmitting} label="Set password" />
    </form>
  );
}

interface PasswordFieldProps {
  id: string;
  label: string;
  description?: string;
  autoComplete: "current-password" | "new-password";
  disabled: boolean;
  error: FieldErrorType | undefined;
  /**
   * The result of `form.register(...)`.
   *
   * `UseFormRegisterReturn` is not generic over the form's value type, which is what lets
   * one field component serve two forms with different shapes.
   */
  registration: UseFormRegisterReturn;
}

function PasswordField({
  id,
  label,
  description,
  autoComplete,
  disabled,
  error,
  registration,
}: PasswordFieldProps) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="password"
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        disabled={disabled}
        {...registration}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError errors={[error]} />
    </Field>
  );
}

interface SubmitRowProps {
  isSubmitting: boolean;
  label: string;
}

function SubmitRow({ isSubmitting, label }: SubmitRowProps) {
  return (
    <div className="flex justify-end">
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2Icon className="animate-spin" />
            Saving...
          </>
        ) : (
          label
        )}
      </Button>
    </div>
  );
}

export { ChangePasswordForm, SetPasswordForm };
