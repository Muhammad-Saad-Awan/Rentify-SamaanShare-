"use client";

import {
  CheckIcon,
  Loader2Icon,
  RotateCcwIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import {
  rejectPayment,
  reverseVerification,
  verifyPayment,
} from "@/actions/payment-verification";
import { recordRefund } from "@/actions/refund";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PaymentStatus } from "@/generated/prisma/enums";
import { paymentMethodLabel } from "@/lib/notifications/messages";
import { formatPKR } from "@/lib/utils/currency";
import { formatDateTime } from "@/lib/utils/date";
import {
  PAYMENT_REASON_MAX,
  TRANSACTION_REF_MAX,
} from "@/lib/validations/payment";

import type { ActionResult } from "@/types";
import type { AdminPaymentSummary } from "@/lib/queries/admin-payments";

interface PaymentCardProps {
  payment: AdminPaymentSummary;
}

/**
 * The three things that need a reason, and what each one says.
 *
 * A table rather than nested ternaries: with two outcomes the inline form read fine, with three
 * it would be six conditionals saying the same thing in different places, and the day a fourth
 * arrives one of them gets missed.
 */
const PANEL_COPY = {
  reject: {
    reasonLabel: "Why the payment could not be verified",
    placeholder: "No transfer matching this reference in the account.",
    hint: "The renter is shown this, so tell them what to check.",
    submitLabel: "Reject payment",
    success: "Payment rejected. The renter can record it again.",
  },
  reverse: {
    reasonLabel: "Why the verification is being reversed",
    placeholder: "Verified against the wrong booking.",
    hint: "Recorded in the audit trail and sent to the renter.",
    submitLabel: "Reverse",
    success: "Verification reversed. The payment is back in the queue.",
  },
  refund: {
    reasonLabel: "Why this booking is being refunded",
    placeholder: "Listing was removed after the payment cleared.",
    hint: "Everything collected goes back - the rental and the deposit. The booking can never be settled afterwards.",
    submitLabel: "Refund everything",
    success: "Refund recorded. The renter has been told.",
  },
} as const;

/**
 * One payment in the administrator's queue.
 *
 * THE REFERENCE IS THE HEADLINE, because the job is reconciliation: this screen sits next to a
 * bank or wallet statement, and the reference is what gets searched for there. The amount is
 * beside it for the same reason. The receipt is corroboration and sits underneath - a screenshot
 * cannot tell you which of three same-value transfers this was.
 *
 * THE SPLIT IS SHOWN BEFORE THE DECISION THAT FREEZES IT. Verifying fixes the commission rate for
 * this booking permanently; showing an administrator what they are fixing at the moment they fix
 * it is the difference between a decision and a surprise on the settlement screen weeks later.
 *
 * ONLY A REJECTION AND A REVERSAL DEMAND PROSE. Verifying is the expected outcome and its
 * justification is already in the data - the reference, the amount, the split - so a required
 * note there would collect "ok" and nothing else. The other two are neither expected nor
 * self-explanatory, and the schema requires a reason for exactly that reason.
 */
function PaymentCard({ payment }: PaymentCardProps) {
  const [isPending, setIsPending] = useState(false);
  const [panel, setPanel] = useState<"reject" | "reverse" | "refund" | null>(
    null
  );
  const [reason, setReason] = useState("");
  const [refundRef, setRefundRef] = useState("");

  const awaitingDecision =
    payment.status === PaymentStatus.PENDING_VERIFICATION;
  const verified = payment.status === PaymentStatus.COMPLETED;

  /**
   * Reversal is offered only while nothing has been built on the verification.
   *
   * The action refuses it once the booking has left `PAYMENT_PENDING` or once a settlement
   * exists, so hiding the control here is presentation rather than protection - but offering a
   * button whose only outcome is a refusal is its own kind of lie.
   */
  const reversible = verified && !payment.settled && !payment.refundedAt;

  /**
   * Refundable on exactly the same conditions, because it is the same question: is this money
   * still ours to move? `refundReadiness` decides for real - it refuses a settled booking and an
   * already-refunded payment - and this only decides whether to offer the control.
   */
  const refundable = reversible;

  async function run(
    action: () => Promise<ActionResult<unknown>>,
    successMessage: string
  ) {
    setIsPending(true);

    try {
      const result = await action();

      if (!result.success) {
        toast.error(result.error);

        return;
      }

      setPanel(null);
      setReason("");
      toast.success(successMessage);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 px-(--card-spacing) py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <Link
            href={`/admin/bookings/${payment.bookingId}`}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            {payment.listing.title}
          </Link>
          <span className="text-muted-foreground text-xs">
            {payment.renter.name ?? payment.renter.email} → {payment.owner.name}
          </span>
        </div>

        <StatusBadge status={payment.status} />
      </div>

      {/*
        The reconciliation line. Monospace on the reference because it is read character by
        character against another screen, and a proportional font makes that materially harder.
      */}
      <div className="bg-muted/40 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg px-3 py-2">
        <span className="text-sm font-medium">
          {formatPKR(payment.amount + payment.securityDeposit)}
        </span>
        <span className="text-muted-foreground text-xs">
          {formatPKR(payment.amount)} rental +{" "}
          {formatPKR(payment.securityDeposit)} deposit
        </span>
        <span className="text-muted-foreground text-xs">
          {paymentMethodLabel(payment.method)}
        </span>
        {payment.transactionRef && (
          <span className="font-mono text-xs break-all">
            {payment.transactionRef}
          </span>
        )}
      </div>

      <dl className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {payment.submittedAt && (
          <div>
            <dt className="inline font-medium">Recorded: </dt>
            <dd className="inline">{formatDateTime(payment.submittedAt)}</dd>
          </div>
        )}
        {payment.confirmedAt && (
          <div>
            <dt className="inline font-medium">Verified: </dt>
            <dd className="inline">
              {formatDateTime(payment.confirmedAt)}
              {payment.confirmedByName ? ` by ${payment.confirmedByName}` : ""}
            </dd>
          </div>
        )}
        {payment.rejectedAt && (
          <div>
            <dt className="inline font-medium">Rejected: </dt>
            <dd className="inline">{formatDateTime(payment.rejectedAt)}</dd>
          </div>
        )}
      </dl>

      {payment.rejectionReason && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {payment.rejectionReason}
        </p>
      )}

      {/*
        What verifying will freeze, or what it froze. Stated as three figures rather than one so
        the deposit's exclusion from the commission is visible rather than implied.
      */}
      {/*
        Built as ONE string rather than interpolated inline.
        React emits adjacent text nodes separately in server-rendered HTML, so `{rate}bps` ships
        as `0<!-- -->bps` - which a reader never notices and a ctrl-F, or a test asserting on the
        rendered page, does. A money figure split from its unit by a comment is worth avoiding
        even where nothing is currently looking.
      */}
      <p className="text-muted-foreground text-xs leading-relaxed">
        {`${verified ? "Frozen at" : "Will freeze at"} ${payment.rateBps}bps — commission ${formatPKR(payment.commissionAmount)}, owner ${formatPKR(payment.ownerRentalAmount)}. The deposit is not commissioned.`}
      </p>

      {payment.proofUrl && (
        <a
          href={payment.proofUrl}
          target="_blank"
          rel="noreferrer"
          className="focus-visible:ring-ring self-start rounded-lg outline-none focus-visible:ring-3"
        >
          {/*
            `unoptimized`: a receipt is looked at once by one administrator, and running it
            through the image optimizer would cache a member's bank screenshot on the CDN.
          */}
          <Image
            src={payment.proofUrl}
            alt="Payment receipt, opens full size in a new tab"
            width={120}
            height={120}
            unoptimized
            className="h-24 w-24 rounded-lg border object-cover"
          />
        </a>
      )}

      {payment.settled && (
        <p className="text-muted-foreground text-xs">
          This booking has been settled, so the verification can no longer be
          reversed.
        </p>
      )}

      {panel === null ? (
        <div className="flex flex-wrap items-center gap-2">
          {awaitingDecision && (
            <>
              <Button
                size="sm"
                disabled={isPending}
                aria-busy={isPending}
                onClick={() =>
                  void run(
                    () => verifyPayment({ bookingId: payment.bookingId }),
                    "Payment verified. Both parties have been told."
                  )
                }
              >
                {isPending ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <CheckIcon />
                )}
                The money arrived
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => setPanel("reject")}
              >
                <XIcon />I cannot find it
              </Button>
            </>
          )}

          {reversible && (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setPanel("reverse")}
            >
              <RotateCcwIcon />
              Reverse this verification
            </Button>
          )}

          {/*
            Refund lives HERE rather than on the settlement queue, because this is where the
            verified payments are and giving money back is a decision about a payment, not about
            a settlement - a booking that refunds never reaches a settlement at all.
          */}
          {refundable && (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => setPanel("refund")}
            >
              <Undo2Icon />
              Refund everything
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Textarea
            aria-label={PANEL_COPY[panel].reasonLabel}
            placeholder={PANEL_COPY[panel].placeholder}
            maxLength={PAYMENT_REASON_MAX}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={isPending}
          />

          {/*
            A refund also needs the reference for the transfer BACK. The rejection and the
            reversal move no money and so have nothing to reference.
          */}
          {panel === "refund" && (
            <Input
              aria-label="Refund transfer reference"
              placeholder="Reference for the transfer back"
              maxLength={TRANSACTION_REF_MAX}
              value={refundRef}
              disabled={isPending}
              onChange={(event) => setRefundRef(event.target.value)}
            />
          )}

          {/*
            The reason reaches the renter verbatim on a rejection, which is worth saying here -
            an administrator writing a note to themselves would word it differently.
          */}
          <p className="text-muted-foreground text-xs">
            {PANEL_COPY[panel].hint}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={panel === "reverse" ? "default" : "destructive"}
              disabled={
                isPending ||
                reason.trim().length === 0 ||
                (panel === "refund" && refundRef.trim().length === 0)
              }
              aria-busy={isPending}
              onClick={() =>
                void run(() => {
                  if (panel === "reject") {
                    return rejectPayment({
                      bookingId: payment.bookingId,
                      reason,
                    });
                  }

                  if (panel === "refund") {
                    return recordRefund({
                      bookingId: payment.bookingId,
                      refundRef,
                      reason,
                    });
                  }

                  return reverseVerification({
                    bookingId: payment.bookingId,
                    reason,
                  });
                }, PANEL_COPY[panel].success)
              }
            >
              {isPending ? <Loader2Icon className="animate-spin" /> : null}
              {PANEL_COPY[panel].submitLabel}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              disabled={isPending}
              onClick={() => {
                setPanel(null);
                setReason("");
                setRefundRef("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** The state, named the way an administrator would say it rather than as an enum value. */
function StatusBadge({ status }: { status: PaymentStatus }) {
  switch (status) {
    case PaymentStatus.PENDING_VERIFICATION:
      return <Badge variant="secondary">Awaiting check</Badge>;
    case PaymentStatus.COMPLETED:
      return <Badge>Verified</Badge>;
    case PaymentStatus.REJECTED:
      return <Badge variant="destructive">Not found</Badge>;
    case PaymentStatus.REFUNDED:
      return <Badge variant="outline">Refunded</Badge>;
    default:
      return <Badge variant="outline">Not yet recorded</Badge>;
  }
}

export { PaymentCard };
