import { BanknoteIcon, LandmarkIcon } from "lucide-react";

import { formatPKR } from "@/lib/utils/currency";

import type { PaymentMethod } from "@/generated/prisma/enums";

interface PaymentInstructionsProps {
  method: PaymentMethod;
  /** The rental amount, kept separate from the deposit throughout. */
  amount: number;
  securityDeposit: number;
  /** Whether the owner has already confirmed receiving the money. */
  isConfirmed: boolean;
}

/**
 * What the renter has to do to pay, for the method they chose.
 *
 * WHY THIS IS VAGUE ABOUT BANK DETAILS. SamaanShare does not store an owner's account number -
 * there is no such column, deliberately - so the transfer instruction cannot contain one. Saying
 * "ask the owner" is honest; inventing a field to hold sort codes would be a payments feature
 * wearing a Phase 4 costume, and would put a stranger's bank details on a screen with no
 * verification behind them.
 *
 * The two figures stay separate on purpose. One is the rent, which the owner keeps. The other is
 * the deposit, which is the renter's money in the owner's hands and owed back. A single total
 * would erase the distinction the whole return obligation rests on.
 */
function PaymentInstructions({
  method,
  amount,
  securityDeposit,
  isConfirmed,
}: PaymentInstructionsProps) {
  const Icon = method === "CASH" ? BanknoteIcon : LandmarkIcon;

  return (
    <div className="bg-muted/50 flex flex-col gap-2 rounded-lg px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {method === "CASH" ? "Paying by cash" : "Paying by bank transfer"}
      </p>

      <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt>Rent</dt>
        <dd className="text-foreground font-medium">{formatPKR(amount)}</dd>

        {securityDeposit > 0 && (
          <>
            <dt>Deposit</dt>
            <dd className="text-foreground font-medium">
              {formatPKR(securityDeposit)}{" "}
              <span className="text-muted-foreground font-normal">
                refundable
              </span>
            </dd>
          </>
        )}
      </dl>

      {!isConfirmed && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {method === "CASH"
            ? `Pay the owner in cash when you collect the item. Have ${formatPKR(amount + securityDeposit)} ready in total.`
            : `Transfer ${formatPKR(amount + securityDeposit)} to the owner and ask them for their account details first — SamaanShare does not store them.`}{" "}
          The owner confirms here once they have received it.
        </p>
      )}

      {isConfirmed && securityDeposit > 0 && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          The owner holds your {formatPKR(securityDeposit)} deposit and should
          return it within 48 hours of you returning the item. SamaanShare does
          not hold it.
        </p>
      )}
    </div>
  );
}

export { PaymentInstructions };
