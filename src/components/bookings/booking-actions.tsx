"use client";

import {
  BanknoteIcon,
  CheckIcon,
  HandCoinsIcon,
  LandmarkIcon,
  Loader2Icon,
  MapPinIcon,
  PackageCheckIcon,
  PackageOpenIcon,
  XIcon,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  cancelBooking,
  completeBooking,
  startBooking,
} from "@/actions/booking-lifecycle";
import {
  acceptBooking,
  declineBooking,
  updateBookingInstructions,
} from "@/actions/bookings";
import {
  confirmPaymentReceived,
  markDepositReturned,
  selectPaymentMethod,
} from "@/actions/payments";
import { PaymentInstructions } from "@/components/bookings/payment-instructions";
import { BookingReviewSection } from "@/components/reviews/booking-review-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BookingStatus, PaymentStatus } from "@/generated/prisma/enums";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";
import {
  CANCEL_REASON_MAX,
  PICKUP_INSTRUCTIONS_MAX,
} from "@/lib/validations/booking";

import type { BookingSummary } from "@/lib/queries/bookings";
import type { ActionResult } from "@/types";

interface BookingActionsProps {
  booking: BookingSummary;
  side: "renter" | "owner";
}

/** Which inline panel is open, if any. */
type OpenPanel = "approve" | "decline" | "cancel" | "instructions" | null;

/**
 * Everything either party can do to a booking, for the state it is in.
 *
 * ONE COMPONENT FOR BOTH SIDES, because the two halves interlock: the renter arranges payment,
 * the owner confirms it, the owner records the handover, the renter waits on the deposit. Split
 * across two components the sequence would have to be reconstructed by reading both.
 *
 * THE SERVER DECIDES, ALWAYS. Cancellation and pickup eligibility arrive pre-computed on the
 * summary from the pure lifecycle rules, and every action re-checks independently. What is
 * rendered here is an affordance - which button is worth showing - never the rule. A button
 * hidden by a bug is a nuisance; a button shown by a bug is refused by the action.
 *
 * NO OPTIMISTIC UPDATES. Every one of these changes what the row means, and several free or hold
 * a calendar that decides whether a third party can book. Flipping a badge before the server
 * agrees would be a guess about state other people depend on.
 */
function BookingActions({ booking, side }: BookingActionsProps) {
  const [isPending, startTransition] = useTransition();

  const [panel, setPanel] = useState<OpenPanel>(null);
  const [reason, setReason] = useState("");
  const [instructions, setInstructions] = useState("");

  /**
   * Runs an action and reports the outcome.
   *
   * Success messages are passed in rather than derived, because each transition means something
   * different to the person who triggered it - "those dates are free again" matters to an owner
   * declining, and is noise to one confirming a payment.
   */
  function run(
    action: () => Promise<ActionResult<unknown>>,
    successMessage: string
  ) {
    startTransition(async () => {
      const result = await action();

      if (!result.success) {
        toast.error(result.error);

        return;
      }

      close();
      toast.success(successMessage);
    });
  }

  function close() {
    setPanel(null);
    setReason("");
    setInstructions("");
  }

  /** Opens the pickup-details editor seeded with whatever is already there. */
  function openInstructions() {
    setInstructions(booking.pickupInstructions ?? "");
    setPanel("instructions");
  }

  const { payment, deposit, eligibility } = booking;
  const isPaymentConfirmed = payment?.status === PaymentStatus.COMPLETED;

  const cancelPanel = (confirmLabel: string, successMessage: string) => (
    <EditPanel
      id={`reason-${booking.id}`}
      label="Why are you cancelling?"
      value={reason}
      onChange={setReason}
      maxLength={CANCEL_REASON_MAX}
      placeholder="Optional — the other person sees this"
      confirmLabel={confirmLabel}
      confirmVariant="destructive"
      cancelLabel="Keep it"
      isPending={isPending}
      onCancel={close}
      onConfirm={() =>
        run(
          () =>
            cancelBooking({
              bookingId: booking.id,
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            }),
          successMessage
        )
      }
    />
  );

  // ---------------------------------------------------------------- owner side

  if (side === "owner") {
    if (booking.status === BookingStatus.PENDING) {
      if (panel === "decline") {
        return (
          <EditPanel
            id={`reason-${booking.id}`}
            label="Why are you declining?"
            value={reason}
            onChange={setReason}
            maxLength={CANCEL_REASON_MAX}
            placeholder="Optional — the renter sees this"
            confirmLabel="Decline request"
            confirmVariant="destructive"
            cancelLabel="Keep it"
            isPending={isPending}
            onCancel={close}
            onConfirm={() =>
              run(
                () =>
                  declineBooking({
                    bookingId: booking.id,
                    ...(reason.trim() ? { reason: reason.trim() } : {}),
                  }),
                "Request declined and those dates are free again."
              )
            }
          />
        );
      }

      /**
       * Approval collects the pickup details in the same step.
       *
       * Not a separate screen afterwards, because this is the moment the owner is thinking about
       * the handover - and because these details are the ONLY channel to the renter until profiles
       * carry a verified phone. An approval with no instructions leaves two people with each
       * other's first name and no way to meet.
       */
      if (panel === "approve") {
        return (
          <EditPanel
            id={`pickup-${booking.id}`}
            label="Where and when should the renter collect?"
            description="Include your phone number — this is the only message the renter gets from you."
            value={instructions}
            onChange={setInstructions}
            maxLength={PICKUP_INSTRUCTIONS_MAX}
            placeholder="e.g. Flat 4, Bahria Town Phase 5, after 6pm. Call 0300 1234567 when you arrive."
            multiline
            confirmLabel="Approve and send"
            cancelLabel="Back"
            isPending={isPending}
            onCancel={close}
            onConfirm={() =>
              run(
                () =>
                  acceptBooking({
                    bookingId: booking.id,
                    ...(instructions.trim()
                      ? { pickupInstructions: instructions.trim() }
                      : {}),
                  }),
                "Request approved. The renter can now arrange payment."
              )
            }
            secondary={{
              label: "Approve without details",
              onClick: () =>
                run(
                  () => acceptBooking({ bookingId: booking.id }),
                  "Request approved. Add pickup details from the booking when you can."
                ),
            }}
          />
        );
      }

      return (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setInstructions(booking.pickupInstructions ?? "");
              setPanel("approve");
            }}
            disabled={isPending}
          >
            <CheckIcon />
            Approve
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPanel("decline")}
            disabled={isPending}
          >
            <XIcon />
            Decline
          </Button>
        </div>
      );
    }

    /**
     * The pickup-details editor, available for the whole live part of a booking.
     *
     * An owner who typed the wrong address had no way to correct it before this existed, and the
     * renter has no other contact route. Editing notifies them, because they may already have
     * read - and travelled on - the old version.
     */
    const instructionsEditor = panel === "instructions" && (
      <EditPanel
        id={`pickup-${booking.id}`}
        label="Pickup and return details"
        description="The renter is notified when you change this."
        value={instructions}
        onChange={setInstructions}
        maxLength={PICKUP_INSTRUCTIONS_MAX}
        placeholder="e.g. Flat 4, Bahria Town Phase 5, after 6pm. Call 0300 1234567 when you arrive."
        multiline
        confirmLabel="Save details"
        cancelLabel="Cancel"
        isPending={isPending}
        onCancel={close}
        onConfirm={() =>
          run(
            () =>
              updateBookingInstructions({
                bookingId: booking.id,
                pickupInstructions: instructions.trim(),
              }),
            "Pickup details updated. The renter has been notified."
          )
        }
      />
    );

    const editInstructionsButton = panel !== "instructions" && (
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={openInstructions}
        disabled={isPending}
      >
        <MapPinIcon />
        {booking.pickupInstructions
          ? "Edit pickup details"
          : "Add pickup details"}
      </Button>
    );

    if (booking.status === BookingStatus.APPROVED) {
      return (
        <div className="flex flex-col gap-2">
          {!booking.pickupInstructions && (
            <Note tone="warning">
              The renter has no way to reach you yet. Add pickup details with
              your phone number so they can arrange collection.
            </Note>
          )}

          <Note>
            Waiting for the renter to choose how they will pay you. You will be
            notified when they do.
          </Note>

          {instructionsEditor}
          {editInstructionsButton}
        </div>
      );
    }

    if (booking.status === BookingStatus.PAYMENT_PENDING && payment) {
      // Money not yet acknowledged: the only thing to do is say whether it arrived.
      if (!isPaymentConfirmed) {
        return (
          <div className="flex flex-col gap-2">
            <Note>
              The renter will pay {formatPKR(booking.totalPrice)}
              {booking.securityDeposit > 0 &&
                ` plus a ${formatPKR(booking.securityDeposit)} deposit`}{" "}
              by {payment.method === "CASH" ? "cash" : "bank transfer"}. Confirm
              only once you actually have it.
            </Note>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() =>
                  run(
                    () => confirmPaymentReceived({ bookingId: booking.id }),
                    "Payment confirmed. You can mark the item as collected when the renter picks it up."
                  )
                }
                disabled={isPending}
                aria-busy={isPending}
              >
                {isPending ? (
                  <Loader2Icon className="animate-spin" />
                ) : payment.method === "CASH" ? (
                  <BanknoteIcon />
                ) : (
                  <LandmarkIcon />
                )}
                Confirm payment received
              </Button>
            </div>

            {instructionsEditor}
            {editInstructionsButton}
          </div>
        );
      }

      // Paid and acknowledged: the next physical event is the handover.
      return (
        <div className="flex flex-col gap-2">
          <Note>
            Payment confirmed. Mark the item as collected when the renter has it
            in hand.
          </Note>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() =>
                run(
                  () => startBooking({ bookingId: booking.id }),
                  "Marked as collected. The rental is now active."
                )
              }
              disabled={isPending || !eligibility.ownerCanStart.allowed}
              aria-busy={isPending}
            >
              {isPending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <PackageOpenIcon />
              )}
              Mark item as collected
            </Button>
          </div>

          {instructionsEditor}
          {editInstructionsButton}
        </div>
      );
    }

    if (booking.status === BookingStatus.ACTIVE) {
      return (
        <div className="flex flex-col gap-2">
          <Note>
            Rented out until {formatDate(booking.endDate)}. Mark it returned
            once you have the item back and have checked it.
          </Note>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() =>
                run(
                  () => completeBooking({ bookingId: booking.id }),
                  "Rental completed and those dates are free again."
                )
              }
              disabled={isPending}
              aria-busy={isPending}
            >
              {isPending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <PackageCheckIcon />
              )}
              Mark item as returned
            </Button>
          </div>

          {instructionsEditor}
          {editInstructionsButton}
        </div>
      );
    }

    // Finished, and possibly still holding the renter's deposit.
    if (
      booking.status === BookingStatus.COMPLETED ||
      booking.status === BookingStatus.REVIEWED
    ) {
      if (deposit.kind === "due" || deposit.kind === "overdue") {
        return (
          <div className="flex flex-col gap-2">
            <Note tone={deposit.kind === "overdue" ? "warning" : "default"}>
              {deposit.kind === "overdue"
                ? `You still owe the renter their ${formatPKR(booking.securityDeposit)} deposit — ${deposit.hoursLate}h past the 48-hour window.`
                : `Return the renter's ${formatPKR(booking.securityDeposit)} deposit within ${deposit.hoursRemaining}h.`}
            </Note>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={deposit.kind === "overdue" ? "default" : "outline"}
                onClick={() =>
                  run(
                    () => markDepositReturned({ bookingId: booking.id }),
                    "Deposit recorded as returned. The renter has been notified."
                  )
                }
                disabled={isPending}
                aria-busy={isPending}
              >
                {isPending ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <HandCoinsIcon />
                )}
                I have returned the deposit
              </Button>
            </div>

            <BookingReviewSection booking={booking} side="owner" />
          </div>
        );
      }

      /**
       * Deposit settled, or none was taken.
       *
       * The review block follows either way - it is the last thing left to do on a finished rental,
       * and it is offered on the deposit-owed branch above too so an owner who has not yet handed the
       * money back is not blocked from reviewing.
       */
      return (
        <div className="flex flex-col gap-2">
          <Note>
            {deposit.kind === "returned"
              ? `Deposit recorded as returned on ${formatDate(deposit.returnedAt)}.`
              : "This rental is complete."}
          </Note>

          <BookingReviewSection booking={booking} side="owner" />
        </div>
      );
    }

    return null;
  }

  // --------------------------------------------------------------- renter side

  if (booking.status === BookingStatus.PENDING) {
    if (panel === "cancel") {
      return cancelPanel("Cancel request", "Request cancelled.");
    }

    return (
      <div className="flex flex-col gap-2">
        <Note>
          Waiting for the owner to respond. Requests expire after 48 hours.
        </Note>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPanel("cancel")}
            disabled={isPending}
          >
            <XIcon />
            Cancel request
          </Button>
        </div>
      </div>
    );
  }

  if (booking.status === BookingStatus.APPROVED) {
    return (
      <div className="flex flex-col gap-2">
        <Note>
          Approved. Choose how you will pay the owner — payment is arranged
          directly between the two of you.
        </Note>

        {/* Said explicitly, because an approval with no instructions leaves the renter with
            nobody to contact and no indication that is unexpected. */}
        {!booking.pickupInstructions && (
          <Note tone="warning">
            The owner has not added collection details yet. They are notified to
            do so — check back before you travel.
          </Note>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={() =>
              run(
                () =>
                  selectPaymentMethod({
                    bookingId: booking.id,
                    method: "CASH",
                  }),
                "Cash selected. Pay the owner when you collect the item."
              )
            }
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <BanknoteIcon />
            )}
            Pay by cash
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              run(
                () =>
                  selectPaymentMethod({
                    bookingId: booking.id,
                    method: "BANK_TRANSFER",
                  }),
                "Bank transfer selected. Ask the owner for their account details."
              )
            }
            disabled={isPending}
          >
            <LandmarkIcon />
            Pay by bank transfer
          </Button>
        </div>

        {panel === "cancel" ? (
          cancelPanel("Cancel booking", "Booking cancelled.")
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => setPanel("cancel")}
            disabled={isPending}
          >
            Cancel booking
          </Button>
        )}
      </div>
    );
  }

  if (booking.status === BookingStatus.PAYMENT_PENDING && payment) {
    return (
      <div className="flex flex-col gap-2">
        <PaymentInstructions
          method={payment.method}
          amount={booking.totalPrice}
          securityDeposit={booking.securityDeposit}
          isConfirmed={isPaymentConfirmed}
        />

        {isPaymentConfirmed ? (
          <Note>
            The owner confirmed receiving your payment. Arrange collection using
            the pickup details above.
          </Note>
        ) : (
          <>
            {/* Switching method stays available until the owner confirms - a renter who picked
                cash and then decided to transfer should not be stuck with an unusable panel. */}
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() =>
                run(
                  () =>
                    selectPaymentMethod({
                      bookingId: booking.id,
                      method:
                        payment.method === "CASH" ? "BANK_TRANSFER" : "CASH",
                    }),
                  "Payment method changed."
                )
              }
              disabled={isPending}
            >
              Switch to {payment.method === "CASH" ? "bank transfer" : "cash"}
            </Button>

            {panel === "cancel"
              ? cancelPanel("Cancel booking", "Booking cancelled.")
              : eligibility.renterCanCancel.allowed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-start"
                    onClick={() => setPanel("cancel")}
                    disabled={isPending}
                  >
                    Cancel booking
                  </Button>
                )}
          </>
        )}

        {/* The refusal is explained rather than hidden: a missing Cancel button with no reason
            reads as a bug, and the reason here is one the renter has to act on. */}
        {!eligibility.renterCanCancel.allowed && isPaymentConfirmed && (
          <Note>{eligibility.renterCanCancel.reason}</Note>
        )}
      </div>
    );
  }

  if (booking.status === BookingStatus.ACTIVE) {
    return (
      <Note>
        You have the item. Return it to the owner by{" "}
        {formatDate(booking.endDate)} — they will mark it returned and then
        return your deposit.
      </Note>
    );
  }

  if (
    booking.status === BookingStatus.COMPLETED ||
    booking.status === BookingStatus.REVIEWED
  ) {
    /**
     * One note plus the review block, rather than four separate returns.
     *
     * The deposit state and the review state are independent: a renter waiting on their money should
     * still be able to review, and one whose deposit came back still needs to. Restructured so the
     * review block cannot be forgotten on one branch - which is exactly what happened when these
     * were four returns.
     */
    return (
      <div className="flex flex-col gap-2">
        {deposit.kind === "returned" && (
          <Note>
            The owner recorded your {formatPKR(booking.securityDeposit)} deposit
            as returned on {formatDate(deposit.returnedAt)}.
          </Note>
        )}

        {deposit.kind === "due" && (
          <Note>
            The owner should return your {formatPKR(booking.securityDeposit)}{" "}
            deposit within {deposit.hoursRemaining}h. SamaanShare does not hold
            it.
          </Note>
        )}

        {deposit.kind === "overdue" && (
          <Note tone="warning">
            Your {formatPKR(booking.securityDeposit)} deposit is{" "}
            {deposit.hoursLate}h overdue. Contact the owner — SamaanShare does
            not hold the deposit and cannot release it.
          </Note>
        )}

        {deposit.kind === "none" && <Note>This rental is complete.</Note>}

        <BookingReviewSection booking={booking} side="renter" />
      </div>
    );
  }

  return null;
}

interface EditPanelProps {
  id: string;
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder: string;
  /** Renders a textarea instead of a single-line input. */
  multiline?: boolean;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  cancelLabel: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** An alternative that skips the text entirely, e.g. approving with no details. */
  secondary?: { label: string; onClick: () => void };
}

/**
 * The inline text panel behind every confirm-with-text action.
 *
 * DECLARED AT MODULE SCOPE, WHICH IS THE WHOLE POINT. It was originally nested inside
 * `BookingActions`, which made it a new component *type* on every render - React compares element
 * types by reference, so each keystroke unmounted and remounted the field and the caret jumped
 * out. Server-rendered HTML looks identical either way, which is exactly why the render checks
 * did not catch it.
 *
 * The value lives in the parent because several call sites share one piece of state; only the
 * presentation is here.
 */
function EditPanel({
  id,
  label,
  description,
  value,
  onChange,
  maxLength,
  placeholder,
  multiline = false,
  confirmLabel,
  confirmVariant = "default",
  cancelLabel,
  isPending,
  onConfirm,
  onCancel,
  secondary,
}: EditPanelProps) {
  const Field = multiline ? Textarea : Input;

  return (
    <div className="bg-muted/50 flex flex-col gap-2 rounded-lg px-3 py-2.5">
      <label className="text-xs font-medium" htmlFor={id}>
        {label}
      </label>

      {description && (
        <p className="text-muted-foreground text-xs">{description}</p>
      )}

      <Field
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={isPending}
        {...(multiline ? { rows: 3 } : {})}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={confirmVariant}
          size="sm"
          onClick={onConfirm}
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending && <Loader2Icon className="animate-spin" />}
          {confirmLabel}
        </Button>

        {secondary && (
          <Button
            variant="outline"
            size="sm"
            onClick={secondary.onClick}
            disabled={isPending}
          >
            {secondary.label}
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isPending}
        >
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}

interface NoteProps {
  children: React.ReactNode;
  tone?: "default" | "warning";
}

/** A short explanatory line under a booking, in place of an action. */
function Note({ children, tone = "default" }: NoteProps) {
  return (
    <p
      className={
        tone === "warning"
          ? "text-destructive text-xs leading-relaxed"
          : "text-muted-foreground text-xs leading-relaxed"
      }
    >
      {children}
    </p>
  );
}

export { BookingActions };
