import {
  BadgeCheckIcon,
  CheckIcon,
  ClockIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";

import { FormAlert } from "@/components/ui/form-alert";
import { IdentityDocumentForm } from "@/components/profile/identity-document-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { IdentityDocumentStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/date";
import { maskCnic } from "@/lib/validations/identity";

interface IdentityDocumentSectionProps {
  /** The member's submission, or `null` if they have not made one. */
  document: {
    status: IdentityDocumentStatus;
    cnicNumber: string;
    rejectionReason: string | null;
    submittedAt: Date;
  } | null;
}

type StepState = "done" | "current" | "failed" | "upcoming";

interface Step {
  title: string;
  detail: string;
  state: StepState;
}

/** What a screen reader hears for each step, since the glyph and colour are hidden from it. */
const STEP_STATE_LABEL: Record<StepState, string> = {
  done: "done",
  current: "current step",
  failed: "not accepted",
  upcoming: "not started",
};

/**
 * The three steps, worked out from the one status field.
 *
 * Kept next to the section rather than in `lib/` because it is presentation - it decides what the
 * member is told, not what they are allowed to do. The gate itself is `lib/identity/gate.ts`.
 */
function stepsFor(
  status: IdentityDocumentStatus | null,
  submittedAt: Date | null
): Step[] {
  const submitted = submittedAt ? `Sent ${formatDate(submittedAt)}` : "";

  switch (status) {
    case IdentityDocumentStatus.PENDING:
      return [
        { title: "Upload your CNIC", detail: submitted, state: "done" },
        {
          title: "Review by SamaanShare",
          detail: "In progress",
          state: "current",
        },
        {
          title: "Verified",
          detail: "Badge on your profile",
          state: "upcoming",
        },
      ];
    case IdentityDocumentStatus.APPROVED:
      return [
        { title: "Upload your CNIC", detail: submitted, state: "done" },
        { title: "Review by SamaanShare", detail: "Approved", state: "done" },
        { title: "Verified", detail: "Badge on your profile", state: "done" },
      ];
    case IdentityDocumentStatus.REJECTED:
      return [
        {
          title: "Upload your CNIC",
          detail: "Upload it again",
          state: "current",
        },
        {
          title: "Review by SamaanShare",
          detail: "Not accepted",
          state: "failed",
        },
        {
          title: "Verified",
          detail: "Badge on your profile",
          state: "upcoming",
        },
      ];
    default:
      return [
        {
          title: "Upload your CNIC",
          detail: "Number and both sides",
          state: "current",
        },
        {
          title: "Review by SamaanShare",
          detail: "Checked by our team",
          state: "upcoming",
        },
        {
          title: "Verified",
          detail: "Badge on your profile",
          state: "upcoming",
        },
      ];
  }
}

/**
 * "Identity verification" on the profile page.
 *
 * Four states, each saying what the member can do next: nothing on file (the form), under review
 * (they can already rent and list), verified, and rejected (the reason, and the form again).
 *
 * THE STATE IS SAID THREE WAYS ON PURPOSE. The badge in the corner uses the same glyph-and-label
 * vocabulary as every booking and payment, so "under review" looks like every other "waiting on
 * someone"; the three steps beneath show where in the process that is; and the sentence under them
 * says what it means for renting and listing. This is the one screen where a member decides whether
 * to hand over a copy of their ID card, so nothing about where they stand is left to inference.
 *
 * "Not submitted" is the one state with no `StatusBadge` variant: it is neither waiting on someone
 * else nor settled - it needs the member's own action, which the palette spells as warning-soft with
 * a triangle. It uses `Badge`'s `warning` variant directly until `StatusBadge` grows one.
 *
 * The number is shown masked even to its owner. The page can be on screen in a shop or a family
 * room, and the last digit is enough to tell which card is on file.
 */
function IdentityDocumentSection({ document }: IdentityDocumentSectionProps) {
  const status = document?.status ?? null;
  const steps = stepsFor(status, document?.submittedAt ?? null);

  return (
    <Card id="identity" className="scroll-mt-24">
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-heading text-lg font-bold tracking-tight">
              Identity verification
            </h2>
            <p className="text-muted-foreground max-w-[60ch] text-sm leading-relaxed">
              {status === null
                ? "Upload both sides of your CNIC to rent items or list your own. It keeps everyone on SamaanShare accountable."
                : status === IdentityDocumentStatus.REJECTED
                  ? "We could not accept your last upload. Please upload your CNIC again."
                  : "Your CNIC is on file."}
            </p>
          </div>

          {status === IdentityDocumentStatus.PENDING && (
            <StatusBadge variant="secondary" label="Under review" />
          )}
          {status === IdentityDocumentStatus.APPROVED && (
            <StatusBadge variant="default" label="Verified" />
          )}
          {status === IdentityDocumentStatus.REJECTED && (
            <StatusBadge variant="destructive" label="Not accepted" />
          )}
          {status === null && (
            <Badge variant="warning" className="pl-2">
              <TriangleAlertIcon aria-hidden="true" />
              Not submitted
            </Badge>
          )}
        </div>

        <ol
          aria-label="Verification progress"
          className="grid gap-3 sm:grid-cols-3 sm:gap-4"
        >
          {steps.map((step, index) => (
            <li
              key={step.title}
              aria-current={step.state === "current" ? "step" : undefined}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-3 py-2.5",
                step.state === "current" && "border-brand/40 bg-brand-soft",
                step.state === "failed" &&
                  "border-destructive/30 bg-destructive/5"
              )}
            >
              <StepMark state={step.state} number={index + 1} />
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">
                  {step.title}
                  <span className="sr-only">
                    {`, ${STEP_STATE_LABEL[step.state]}`}
                  </span>
                </span>
                {step.detail && (
                  <span
                    className={cn(
                      "text-xs",
                      step.state === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {step.detail}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>

        {document && status !== IdentityDocumentStatus.REJECTED && (
          <dl className="grid gap-4 rounded-xl border p-4 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">CNIC number</dt>
              <dd className="font-mono tracking-wide">
                {maskCnic(document.cnicNumber)}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-muted-foreground text-xs">Submitted</dt>
              <dd>{formatDate(document.submittedAt)}</dd>
            </div>
          </dl>
        )}

        {status === IdentityDocumentStatus.PENDING && (
          <p className="text-muted-foreground flex items-start gap-2 text-sm leading-relaxed">
            <ClockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            You can rent and list items while we review it. We will notify you
            when it is done.
          </p>
        )}

        {status === IdentityDocumentStatus.APPROVED && (
          <p className="flex items-start gap-2 text-sm leading-relaxed">
            <BadgeCheckIcon
              className="text-success mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            A verified badge shows on your profile and beside your listings.
          </p>
        )}

        {status === IdentityDocumentStatus.REJECTED && (
          <FormAlert tone="error" title="Why it was not accepted">
            <span className="text-foreground">
              {document?.rejectionReason ??
                "No reason was recorded. Check that both photos are sharp, uncropped and show the whole card."}
            </span>
          </FormAlert>
        )}

        {(status === null || status === IdentityDocumentStatus.REJECTED) && (
          <div className="flex flex-col gap-6 border-t pt-6">
            <IdentityDocumentForm />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StepMark({ state, number }: { state: StepState; number: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        state === "done" && "bg-success text-success-foreground",
        state === "current" && "bg-primary text-primary-foreground",
        state === "failed" &&
          "border-destructive/30 bg-destructive/10 text-destructive border",
        state === "upcoming" && "text-muted-foreground border"
      )}
    >
      {state === "done" ? (
        <CheckIcon className="size-3.5" strokeWidth={3} />
      ) : state === "failed" ? (
        <XIcon className="size-3.5" strokeWidth={3} />
      ) : (
        number
      )}
    </span>
  );
}

export { IdentityDocumentSection };
