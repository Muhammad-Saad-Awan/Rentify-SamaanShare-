"use client";

import { Loader2Icon, MailIcon, MailWarningIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { sendEmailVerification } from "@/actions/email-verification";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface EmailVerificationNoticeProps {
  /** `true` once the address has been confirmed. */
  isVerified: boolean;
  /**
   * Whether this deployment can send mail at all.
   *
   * Passed in from the server rather than read here: `isEmailEnabled()` reads `RESEND_API_KEY`,
   * which must never reach a browser. With no mail configured the notice renders without the
   * button, because offering a resend that cannot be sent is worse than not offering one.
   */
  canSend: boolean;
  /** The address in question, when the caller has it - shown so the member knows which inbox. */
  email?: string;
}

/**
 * Prompts the signed-in user to confirm their email address.
 *
 * SAYS WHAT CONFIRMING ACHIEVES, AND WHAT IT DOES NOT. Confirming an inbox is not identity
 * verification - that is a separate, stronger claim granted by a person after checking a document,
 * and it is what earns the badge on a public profile. Copy that implied one led to the other would
 * have people believing they were verified when they had only clicked a link.
 *
 * A CARD, NOT AN INTERSTITIAL. Renting and listing both need a confirmed address (see
 * `lib/auth/email-gate.ts`), but browsing, messaging and managing existing bookings do not, so the
 * prompt sits where it is relevant rather than blocking the whole app. The copy says what is gated
 * because a requirement discovered only at the moment of refusal reads as a judgement.
 *
 * Unconfirmed is drawn on the warning-soft surface - it needs the member's action, and nothing has
 * failed. Confirmed is a quiet row with the emerald status badge, the palette's one colour for
 * "this is settled and trusted".
 */
function EmailVerificationNotice({
  isVerified,
  canSend,
  email,
}: EmailVerificationNoticeProps) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  if (isVerified) {
    return (
      <Card size="sm">
        <div className="flex flex-wrap items-center justify-between gap-3 px-(--card-spacing)">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg border"
              aria-hidden="true"
            >
              <MailIcon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-muted-foreground text-xs">
                Email address
              </span>
              <span className="truncate text-sm font-medium">
                {email ?? "Your email address is confirmed."}
              </span>
            </div>
          </div>
          <StatusBadge variant="default" label="Confirmed" />
        </div>
      </Card>
    );
  }

  async function resend() {
    setPending(true);

    const result = await sendEmailVerification();

    setPending(false);

    if (!result.success) {
      toast.error(result.error);

      return;
    }

    setSent(true);
    toast.success(result.data.message);
  }

  return (
    <section
      aria-labelledby="email-verification-title"
      className="border-warning/40 bg-warning-soft flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-start"
    >
      <span
        className="bg-warning text-warning-foreground flex size-9 shrink-0 items-center justify-center rounded-lg"
        aria-hidden="true"
      >
        <MailWarningIcon className="size-4" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2
            id="email-verification-title"
            className="font-heading text-base font-semibold tracking-tight"
          >
            Confirm your email address
          </h2>
          <p className="text-warning-soft-foreground max-w-[65ch] text-sm leading-relaxed">
            You need a confirmed address to rent items or list your own. It also
            tells other members we can reach you, and counts towards your trust
            score. It is not the same as identity verification, which
            SamaanShare grants separately.
          </p>
          {email && (
            <p className="text-sm break-all">
              <span className="text-warning-soft-foreground">
                The link goes to{" "}
              </span>
              <span className="font-medium">{email}</span>
            </p>
          )}
        </div>

        {canSend ? (
          <div>
            <Button
              variant="outline"
              className="bg-card"
              onClick={resend}
              disabled={pending}
              aria-busy={pending}
            >
              {pending && <Loader2Icon className="animate-spin" />}
              {sent ? "Send it again" : "Send me a confirmation link"}
            </Button>
          </div>
        ) : (
          // Honest about the deployment rather than showing a button that cannot work.
          <p className="text-warning-soft-foreground text-xs">
            Email is not configured on this deployment, so a confirmation link
            cannot be sent yet.
          </p>
        )}
      </div>
    </section>
  );
}

export { EmailVerificationNotice };
