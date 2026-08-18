"use client";

import { CheckCircle2Icon, Loader2Icon, MailWarningIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { sendEmailVerification } from "@/actions/email-verification";
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
}

/**
 * Prompts the signed-in user to confirm their email address.
 *
 * SAYS WHAT CONFIRMING ACHIEVES, AND WHAT IT DOES NOT. Confirming an inbox is not identity
 * verification - that is a separate, stronger claim granted by a person after checking a document,
 * and it is what earns the badge on a public profile. Copy that implied one led to the other would
 * have people believing they were verified when they had only clicked a link.
 *
 * NOT A BLOCKER. Nothing on SamaanShare is gated on a confirmed address, so this is a card rather
 * than an interstitial. It affects the trust score, and the honest way to say that is to say it.
 */
function EmailVerificationNotice({
  isVerified,
  canSend,
}: EmailVerificationNoticeProps) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  if (isVerified) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <CheckCircle2Icon
          className="size-4 shrink-0 text-emerald-600"
          aria-hidden="true"
        />
        Your email address is confirmed.
      </p>
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
    <Card>
      <div className="flex flex-col gap-2.5 px-(--card-spacing)">
        <p className="flex items-center gap-2 text-sm font-medium">
          <MailWarningIcon className="size-4 shrink-0" aria-hidden="true" />
          Your email address is not confirmed
        </p>

        <p className="text-muted-foreground text-sm leading-relaxed">
          Confirming it tells other members we can reach you, and it counts
          towards your trust score. It is not the same as identity verification,
          which SamaanShare grants separately.
        </p>

        {canSend ? (
          <div>
            <Button
              size="sm"
              variant="outline"
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
          <p className="text-muted-foreground text-xs">
            Email is not configured on this deployment, so a confirmation link
            cannot be sent yet.
          </p>
        )}
      </div>
    </Card>
  );
}

export { EmailVerificationNotice };
