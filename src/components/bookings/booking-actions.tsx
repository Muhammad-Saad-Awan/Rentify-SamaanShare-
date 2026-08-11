"use client";

import {
  BanknoteIcon,
  CheckIcon,
  HandCoinsIcon,
  Loader2Icon,
  LandmarkIcon,
  PackageCheckIcon,
  PackageOpenIcon,
  XIcon,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { acceptBooking, declineBooking } from "@/actions/bookings";
import {
  cancelBooking,
  completeBooking,
  startBooking,
} from "@/actions/booking-lifecycle";
import {
  confirmPaymentReceived,
  markDepositReturned,
  selectPaymentMethod,
} from "@/actions/payments";
import { PaymentInstructions } from "@/components/bookings/payment-instructions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookingStatus, PaymentStatus } from "@/generated/prisma/enums";
import { CANCEL_REASON_MAX } from "@/lib/validations/booking";
import { formatPKR } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/date";

import type { BookingSummary } from "@/lib/queries/bookings";
import type { ActionResult } from "@/types";

interface BookingActionsProps {
  booking: BookingSummary;
  side: "renter" | "owner";
}

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

  /** Which inline confirmation panel is open, if any. */
  const [panel, setPanel] = useState<"cancel" | "decline" | null>(null);
  const [reason, setReason] = useState("");

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

      setPanel(null);
      setReason("");
      toast.success(successMessage);
    });
  }

  const { payment, deposit, eligibility } = booking;
  const isPaymentConfirmed = payment?.status === PaymentStatus.COMPLETED;

  /** A short inline form for the optional reason on a cancel or a decline. */
  function ReasonPanel({
    label,
    confirmLabel,
    onConfirm,
  }: {
    label: string;
    confirmLabel: string;
    onConfirm: () => void;
  }) {
    return (
      <div className="bg-muted/50 flex flex-col gap-2 rounded-lg px-3 py-2.5">
        <label className="text-xs font-medium" htmlFor={`reason-${booking.id}`}>
          {label}
        </label>

        <Input
          id={`reason-${booking.id}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={CANCEL_REASON_MAX}
          placeholder="Optional — the other person sees this"
          disabled={isPending}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending && <Loader2Icon className="animate-spin" />}
            {confirmLabel}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPanel(null);
              setReason("");
            }}
            disabled={isPending}
          >
            Keep it
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- owner side

  if (side === "owner") {
    if (booking.status === BookingStatus.PENDING) {
      return (
        <div className="flex flex-col gap-2">
          {panel === "decline" ? (
            <ReasonPanel
              label="Why are you declining?"
              confirmLabel="Decline request"
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
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() =>
                  run(
                    () => acceptBooking({ bookingId: booking.id }),
                    "Request approved. The renter can now arrange payment."
                  )
                }
                disabled={isPending}
                aria-busy={isPending}
              >
                {isPending ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <CheckIcon />
                )}
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
          )}
        </div>
      );
    }

    if (booking.status === BookingStatus.APPROVED) {
      return (
        <Note>
          Waiting for the renter to choose how they will pay you. You will be
          notified when they do.
        </Note>
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
          </div>
        );
      }

      if (deposit.kind === "returned") {
        return (
          <Note>
            Deposit recorded as returned on {formatDate(deposit.returnedAt)}.
          </Note>
        );
      }

      return <Note>This rental is complete.</Note>;
    }

    return null;
  }

  // --------------------------------------------------------------- renter side

  if (booking.status === BookingStatus.PENDING) {
    return (
      <div className="flex flex-col gap-2">
        {panel === "cancel" ? (
          <ReasonPanel
            label="Why are you cancelling?"
            confirmLabel="Cancel request"
            onConfirm={() =>
              run(
                () =>
                  cancelBooking({
                    bookingId: booking.id,
                    ...(reason.trim() ? { reason: reason.trim() } : {}),
                  }),
                "Request cancelled."
              )
            }
          />
        ) : (
          <>
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
          </>
        )}
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
          <ReasonPanel
            label="Why are you cancelling?"
            confirmLabel="Cancel booking"
            onConfirm={() =>
              run(
                () =>
                  cancelBooking({
                    bookingId: booking.id,
                    ...(reason.trim() ? { reason: reason.trim() } : {}),
                  }),
                "Booking cancelled."
              )
            }
          />
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
            the pickup instructions above.
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

            {panel === "cancel" ? (
              <ReasonPanel
                label="Why are you cancelling?"
                confirmLabel="Cancel booking"
                onConfirm={() =>
                  run(
                    () =>
                      cancelBooking({
                        bookingId: booking.id,
                        ...(reason.trim() ? { reason: reason.trim() } : {}),
                      }),
                    "Booking cancelled."
                  )
                }
              />
            ) : (
              eligibility.renterCanCancel.allowed && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => setPanel("cancel")}
                  disabled={isPending}
                >
                  Cancel booking
                </Button>
              )
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
    if (deposit.kind === "returned") {
      return (
        <Note>
          The owner recorded your {formatPKR(booking.securityDeposit)} deposit
          as returned on {formatDate(deposit.returnedAt)}.
        </Note>
      );
    }

    if (deposit.kind === "due") {
      return (
        <Note>
          The owner should return your {formatPKR(booking.securityDeposit)}{" "}
          deposit within {deposit.hoursRemaining}h. SamaanShare does not hold
          it.
        </Note>
      );
    }

    if (deposit.kind === "overdue") {
      return (
        <Note tone="warning">
          Your {formatPKR(booking.securityDeposit)} deposit is{" "}
          {deposit.hoursLate}h overdue. Contact the owner — SamaanShare does not
          hold the deposit and cannot release it.
        </Note>
      );
    }

    return <Note>This rental is complete.</Note>;
  }

  return null;
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
