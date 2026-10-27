import { BadgeCheckIcon, ClockIcon, IdCardIcon } from "lucide-react";

import { IdentityDocumentForm } from "@/components/profile/identity-document-form";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { IdentityDocumentStatus } from "@/generated/prisma/enums";
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

/**
 * "Verify your identity" on the profile page.
 *
 * Four states, each saying what the member can do next: nothing on file (the form), under review
 * (they can already rent and list), verified, and rejected (the reason, and the form again).
 *
 * The number is shown masked even to its owner. The page can be on screen in a shop or a family
 * room, and the last digit is enough to tell which card is on file.
 */
function IdentityDocumentSection({ document }: IdentityDocumentSectionProps) {
  const status = document?.status ?? null;

  return (
    <Card id="identity">
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-lg"
              aria-hidden="true"
            >
              <IdCardIcon className="size-5" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="font-heading text-lg font-semibold tracking-tight">
                Verify your identity
              </h2>
              <p className="text-muted-foreground max-w-[60ch] text-sm leading-relaxed">
                {status === null
                  ? "Upload both sides of your CNIC to rent items or list your own. It keeps everyone on SamaanShare accountable."
                  : status === IdentityDocumentStatus.REJECTED
                    ? "We could not accept your last upload. Please upload your CNIC again."
                    : "Your CNIC is on file."}
              </p>
            </div>
          </div>

          {status === IdentityDocumentStatus.PENDING && (
            <StatusBadge variant="secondary" label="Under review" />
          )}
          {status === IdentityDocumentStatus.APPROVED && (
            <StatusBadge variant="default" label="Verified" />
          )}
          {status === IdentityDocumentStatus.REJECTED && (
            <StatusBadge variant="destructive" label="Needs a new upload" />
          )}
          {status === null && (
            <StatusBadge variant="secondary" label="Not submitted" />
          )}
        </div>

        {document && status !== IdentityDocumentStatus.REJECTED && (
          <dl className="grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
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
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            A verified badge shows on your profile and beside your listings.
          </p>
        )}

        {status === IdentityDocumentStatus.REJECTED &&
          document?.rejectionReason && (
            <div
              role="alert"
              className="border-destructive/30 bg-destructive/5 rounded-lg border px-4 py-3 text-sm"
            >
              <p className="text-destructive font-medium">Reason</p>
              <p className="text-foreground/80 mt-0.5 leading-relaxed">
                {document.rejectionReason}
              </p>
            </div>
          )}

        {(status === null || status === IdentityDocumentStatus.REJECTED) && (
          <IdentityDocumentForm />
        )}
      </CardContent>
    </Card>
  );
}

export { IdentityDocumentSection };
