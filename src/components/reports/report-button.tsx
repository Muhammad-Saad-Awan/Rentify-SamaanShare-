"use client";

import { FlagIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { reportListing, reportReview, reportUser } from "@/actions/reports";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReportType } from "@/generated/prisma/enums";
import {
  REPORT_DESCRIPTION_MAX,
  REPORT_REASONS_BY_TYPE,
  REPORT_REASON_LABELS,
} from "@/lib/reports/rules";
import { UNAUTHENTICATED_ERROR } from "@/types";

import type { ReportReason } from "@/generated/prisma/enums";

interface ReportButtonProps {
  targetType: ReportType;
  targetId: string;
  /** What is being reported, for the panel's heading. "this listing", "this review". */
  label: string;
  /**
   * Hidden entirely when the viewer is signed out or is the subject.
   *
   * The parent decides, because only it knows whose listing or review this is. A button that opens
   * a form and then refuses on submit wastes the reporter's typing on something knowable up front.
   */
  className?: string;
}

/**
 * Reporting a listing, a person or a review.
 *
 * ONE COMPONENT, THREE TARGETS. The reason list comes from `REPORT_REASONS_BY_TYPE`, which is the
 * same map the server validates against, so the form cannot offer a reason the action will reject.
 * The server check remains the boundary - this keeps the two from disagreeing in front of the user.
 *
 * QUIET BY DESIGN. It is a small ghost button, not a prominent call to action: reporting should be
 * findable by someone who needs it and not suggested to everyone else, or the queue fills with
 * complaints about ordinary disagreements.
 *
 * NO RATING OF THE OUTCOME IS PROMISED. The confirmation says the report was received, not that
 * anything will happen to it - and nothing here tells the reporter what was decided later, because
 * that is a decision about someone else's account.
 */
function ReportButton({
  targetType,
  targetId,
  label,
  className,
}: ReportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | "">("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reasons = REPORT_REASONS_BY_TYPE[targetType];

  async function submit() {
    if (!reason) {
      return;
    }

    setIsSubmitting(true);

    const payload = {
      targetId,
      reason,
      ...(description.trim() ? { description: description.trim() } : {}),
    };

    const action =
      targetType === ReportType.LISTING
        ? reportListing
        : targetType === ReportType.REVIEW
          ? reportReview
          : reportUser;

    const result = await action(payload);

    setIsSubmitting(false);

    if (!result.success) {
      toast.error(
        result.error === UNAUTHENTICATED_ERROR
          ? "Sign in to report this."
          : result.error
      );

      return;
    }

    /**
     * Deliberately vague about what happens next.
     *
     * Promising a review "within 24 hours" would be a commitment nobody here can keep, and telling
     * the reporter their report was the fifth on this listing would leak other people's reports.
     */
    toast.success("Thanks — this has been sent to our moderators.");
    setIsOpen(false);
    setReason("");
    setDescription("");
  }

  if (!isOpen) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={className}
        onClick={() => setIsOpen(true)}
      >
        <FlagIcon aria-hidden="true" />
        Report
      </Button>
    );
  }

  return (
    <div className="bg-muted/50 flex flex-col gap-3 rounded-lg px-3 py-3">
      <p className="text-xs font-medium">What is wrong with {label}?</p>

      <div
        role="radiogroup"
        aria-label="Reason for reporting"
        className="flex flex-col gap-1"
      >
        {reasons.map((value) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-2 text-sm"
          >
            <input
              type="radio"
              name={`report-reason-${targetId}`}
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
              disabled={isSubmitting}
              className="accent-primary size-3.5"
            />
            {REPORT_REASON_LABELS[value]}
          </label>
        ))}
      </div>

      <Textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        maxLength={REPORT_DESCRIPTION_MAX}
        rows={3}
        placeholder="Optional — anything that helps us understand"
        disabled={isSubmitting}
        aria-label="Report description"
      />

      <p className="text-muted-foreground text-xs leading-relaxed">
        Reports are private. The person you are reporting is not told who filed
        it.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={submit}
          disabled={isSubmitting || !reason}
          aria-busy={isSubmitting}
        >
          {isSubmitting && <Loader2Icon className="animate-spin" />}
          Send report
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(false)}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

export { ReportButton };
