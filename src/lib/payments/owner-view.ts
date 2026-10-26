import { PaymentProvider, PaymentStatus } from "@/generated/prisma/enums";
import { formatPKR } from "@/lib/utils/currency";

/**
 * What the OWNER is told about a booking's payment, derived from the `Payment` row itself.
 *
 * WHY THIS EXISTS. The owner's card used to pick its wording from `booking.status` alone, so the
 * only payment states it could describe were "no booking payment yet" and "confirmed or not". A
 * card payment has states a bank transfer does not - processing at Stripe, failed at Stripe - and
 * an owner whose renter had paid by card could be shown "waiting for the renter to choose how they
 * will pay". The payment's own provider and status are the facts; this reads them.
 *
 * PURE, so the mapping is asserted without rendering anything. The card renders `note`; the
 * handover controls still depend on `eligibility.ownerCanStart`, which the server computes.
 */

export type OwnerPaymentView =
  /** No `Payment` row: the renter has not picked a method. */
  | { kind: "awaiting-method" }
  /** Bank transfer chosen or recorded, not yet verified - the existing manual flow, unchanged. */
  | { kind: "awaiting-transfer" }
  /** Card checkout started at Stripe; the webhook has not confirmed it. */
  | { kind: "card-processing" }
  /** The card attempt failed at Stripe. The renter may retry or switch to bank transfer. */
  | { kind: "card-failed" }
  /** The money has arrived. `byCard` only changes the wording. */
  | { kind: "confirmed"; byCard: boolean };

export function ownerPaymentView(
  payment: { provider: PaymentProvider; status: PaymentStatus } | null
): OwnerPaymentView {
  if (!payment) {
    return { kind: "awaiting-method" };
  }

  if (payment.status === PaymentStatus.COMPLETED) {
    return {
      kind: "confirmed",
      byCard: payment.provider === PaymentProvider.STRIPE,
    };
  }

  if (payment.provider === PaymentProvider.STRIPE) {
    return payment.status === PaymentStatus.FAILED
      ? { kind: "card-failed" }
      : { kind: "card-processing" };
  }

  return { kind: "awaiting-transfer" };
}

/**
 * The sentence the owner sees for each state.
 *
 * Every unconfirmed state ends the same way - keep the item - because that is the one instruction
 * that matters to an owner before the money is confirmed, whichever way it is coming.
 */
export function ownerPaymentNote(
  view: OwnerPaymentView,
  amounts: { totalPrice: number; securityDeposit: number }
): string {
  const owed = `${formatPKR(amounts.totalPrice)}${
    amounts.securityDeposit > 0
      ? ` plus a ${formatPKR(amounts.securityDeposit)} deposit`
      : ""
  }`;

  switch (view.kind) {
    case "awaiting-method":
      return "Waiting for the renter to choose a payment method. You will be notified when they do.";

    // The bank-transfer wording, as it was.
    case "awaiting-transfer":
      return `The renter pays SamaanShare ${owed}. We will tell you the moment it is confirmed, and you keep the item until then.`;

    case "card-processing":
      return `The renter is paying SamaanShare ${owed} by card. The payment is processing - we will tell you the moment it is confirmed, and you keep the item until then.`;

    case "card-failed":
      return "The renter's card payment did not go through. They can try again or pay by bank transfer - keep the item until the payment is confirmed.";

    case "confirmed":
      return view.byCard
        ? "Payment confirmed - the renter paid SamaanShare by card. Mark the item as collected when the renter has it in hand."
        : "Payment confirmed. Mark the item as collected when the renter has it in hand.";
  }
}
