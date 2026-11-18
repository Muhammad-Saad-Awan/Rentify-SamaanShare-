"use client";

import { Loader2Icon, MailCheckIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { verifyEmail } from "@/actions/email-verification";
import { FormAlert } from "@/components/ui/form-alert";
import { Button } from "@/components/ui/button";

interface VerifyEmailFormProps {
  /** The raw `?token=` value, or `null` when the link arrived without one. */
  token: string | null;
}

/**
 * Confirming an email address.
 *
 * A BUTTON, NOT AN EFFECT ON RENDER. Redeeming the token is a write, and a write triggered by
 * loading a page fires on every link preview, mail scanner and prefetch that touches the URL. This
 * codebase has already made that call twice - `viewCount` is recorded from an explicit browser
 * effect rather than during the listing render, and the reset-password page deliberately does not
 * validate its token on render for exactly this reason. A scanner spending the token would leave the
 * person who actually clicked staring at "no longer valid".
 *
 * The cost is one extra click, on a page reached once per account.
 */
function VerifyEmailForm({ token }: VerifyEmailFormProps) {
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token) {
      return;
    }

    setState("working");
    setError(null);

    const result = await verifyEmail(token);

    if (!result.success) {
      setState("idle");
      setError(result.error);

      return;
    }

    setState("done");
  }

  if (!token) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert tone="warning" title="This link is incomplete">
          It is missing its confirmation code. Open the link from your email
          again, or request a new one from your profile.
        </FormAlert>
        <Button size="lg" className="w-full" render={<Link href="/profile" />}>
          Go to my profile
        </Button>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="flex flex-col gap-5">
        {/*
          Says what this did and no more. Confirming an inbox is not identity verification, and
          copy implying a badge had been earned would be wrong in a way people would act on.
        */}
        <FormAlert tone="success" title="Your email address is confirmed.">
          We can now reach you about your rentals. Identity verification is a
          separate step and is not part of this.
        </FormAlert>
        <Button
          size="lg"
          className="w-full"
          render={<Link href="/dashboard" />}
        >
          Go to my dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-muted-foreground text-sm leading-relaxed">
        Press the button to confirm this address. Nothing else about your
        account changes.
      </p>

      {error && <FormAlert tone="error">{error}</FormAlert>}

      <Button
        size="lg"
        className="w-full"
        onClick={submit}
        disabled={state === "working"}
        aria-busy={state === "working"}
      >
        {state === "working" ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <MailCheckIcon aria-hidden="true" />
        )}
        Confirm my email
      </Button>
    </div>
  );
}

export { VerifyEmailForm };
