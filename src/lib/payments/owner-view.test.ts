import { describe, expect, it } from "vitest";

import { PaymentProvider, PaymentStatus } from "@/generated/prisma/enums";
import { ownerPaymentNote, ownerPaymentView } from "@/lib/payments/owner-view";

/**
 * The owner's view of a booking's payment.
 *
 * The regression this guards: a renter completed a Stripe payment and the owner was still told
 * "Waiting for the renter to choose how they will pay you", because the card chose its wording from
 * the booking status and never looked at the payment. The first test is that report, verbatim.
 */

const AMOUNTS = { totalPrice: 6_000, securityDeposit: 10_800 };

const noteFor = (
  payment: { provider: PaymentProvider; status: PaymentStatus } | null
) => ownerPaymentNote(ownerPaymentView(payment), AMOUNTS);

describe("ownerPaymentView", () => {
  it("a completed Stripe payment is confirmed, never 'waiting to choose'", () => {
    const view = ownerPaymentView({
      provider: PaymentProvider.STRIPE,
      status: PaymentStatus.COMPLETED,
    });

    expect(view).toEqual({ kind: "confirmed", byCard: true });

    const note = ownerPaymentNote(view, AMOUNTS);

    expect(note).toMatch(/payment confirmed/i);
    expect(note).toMatch(/paid SamaanShare by card/i);
    expect(note).toMatch(/mark the item as collected/i);
    expect(note).not.toMatch(/choose/i);
  });

  it("no payment row means the renter has not chosen a method", () => {
    expect(ownerPaymentView(null)).toEqual({ kind: "awaiting-method" });
    expect(noteFor(null)).toMatch(/choose a payment method/i);
  });

  it("a Stripe payment in progress is processing, and the owner keeps the item", () => {
    expect(
      ownerPaymentView({
        provider: PaymentProvider.STRIPE,
        status: PaymentStatus.PROCESSING,
      })
    ).toEqual({ kind: "card-processing" });

    const note = noteFor({
      provider: PaymentProvider.STRIPE,
      status: PaymentStatus.PROCESSING,
    });

    expect(note).toMatch(/processing/i);
    expect(note).toMatch(/keep the item/i);
    expect(note).toContain("6,000");
    expect(note).toContain("10,800");
  });

  it("a failed Stripe attempt says so, and the owner keeps the item", () => {
    expect(
      ownerPaymentView({
        provider: PaymentProvider.STRIPE,
        status: PaymentStatus.FAILED,
      })
    ).toEqual({ kind: "card-failed" });
    expect(
      noteFor({
        provider: PaymentProvider.STRIPE,
        status: PaymentStatus.FAILED,
      })
    ).toMatch(/did not go through/i);
  });

  /** The manual flow keeps its exact wording - this change is about card payments. */
  it("leaves the bank-transfer wording unchanged", () => {
    for (const status of [
      PaymentStatus.AWAITING_CONFIRMATION,
      PaymentStatus.PENDING_VERIFICATION,
      PaymentStatus.REJECTED,
    ]) {
      expect(
        ownerPaymentView({ provider: PaymentProvider.OFFLINE, status })
      ).toEqual({ kind: "awaiting-transfer" });
    }

    expect(
      noteFor({
        provider: PaymentProvider.OFFLINE,
        status: PaymentStatus.PENDING_VERIFICATION,
      })
    ).toBe(
      "The renter pays SamaanShare Rs. 6,000 plus a Rs. 10,800 deposit. We will tell you the moment it is confirmed, and you keep the item until then."
    );

    expect(
      noteFor({
        provider: PaymentProvider.OFFLINE,
        status: PaymentStatus.COMPLETED,
      })
    ).toBe(
      "Payment confirmed. Mark the item as collected when the renter has it in hand."
    );
  });

  it("omits the deposit clause when there is no deposit", () => {
    expect(
      ownerPaymentNote(
        ownerPaymentView({
          provider: PaymentProvider.OFFLINE,
          status: PaymentStatus.AWAITING_CONFIRMATION,
        }),
        { totalPrice: 800, securityDeposit: 0 }
      )
    ).not.toMatch(/deposit/i);
  });
});
