"use client";

import { CheckCircle2Icon, Loader2Icon, MailCheckIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { verifyEmail } from "@/actions/email-verification";
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
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm leading-relaxed">
          This link is missing its confirmation code. Open the link from your
          email again, or request a new one from your profile.
        </p>
        <Button size="sm" render={<Link href="/profile" />}>
          Go to my profile
        </Button>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2Icon
            className="size-4 text-emerald-600"
            aria-hidden="true"
          />
          Your email address is confirmed.
        </p>
        {/*
          Says what this did and no more. Confirming an inbox is not identity verification, and
          copy implying a badge had been earned would be wrong in a way people would act on.
        */}
        <p className="text-muted-foreground text-sm leading-relaxed">
          We can now reach you about your rentals. Identity verification is a
          separate step and is not part of this.
        </p>
        <Button size="sm" render={<Link href="/dashboard" />}>
          Go to my dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm leading-relaxed">
        Confirm this address so we know we can reach you about your rentals.
      </p>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      <div>
        <Button
          size="sm"
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
    </div>
  );
}

export { VerifyEmailForm };
