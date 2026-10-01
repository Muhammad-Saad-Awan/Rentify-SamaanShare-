import { LandmarkIcon, ShieldCheckIcon } from "lucide-react";

import {
  isPaymentCollectionConfigured,
  PLATFORM_PAYMENT_ACCOUNTS,
} from "@/config/payment-accounts";
import { formatPKR } from "@/lib/utils/currency";

interface PaymentInstructionsProps {
  /** The rental amount, kept separate from the deposit throughout. */
  amount: number;
  securityDeposit: number;
  /** Whether an administrator has confirmed the money arrived. */
  isConfirmed: boolean;
}

/**
 * Where the renter sends the money, and what happens to it.
 *
 * THIS PAGE USED TO SAY THE OPPOSITE. Under the offline flow the renter paid the owner directly
 * and the copy said so - "ask them for their account details", "SamaanShare does not hold it".
 * That was true then and is false now: the platform receives both the rental and the deposit and
 * holds them until the rental finishes. Every sentence here was rewritten in the same change
 * that made it so, because a payment screen that describes the wrong arrangement is not a stale
 * string, it is a false statement about somebody's money.
 *
 * THE TWO FIGURES STAY SEPARATE, which survives the change of model unaltered. One is the rent,
 * which the owner earns. The other is the deposit, which is the renter's money and comes back
 * unless a claim takes part of it. A single total would erase the distinction the whole return
 * obligation rests on.
 *
 * WITH NO ACCOUNTS CONFIGURED IT SAYS SO. `PLATFORM_PAYMENT_ACCOUNTS` ships empty, and a screen
 * that rendered an empty field where an account number belongs would have somebody transferring
 * money into a void. See the note on that file.
 */
function PaymentInstructions({
  amount,
  securityDeposit,
  isConfirmed,
}: PaymentInstructionsProps) {
  const total = amount + securityDeposit;

  return (
    <div className="bg-muted/50 flex flex-col gap-2 rounded-lg px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium">
        <ShieldCheckIcon className="size-3.5 shrink-0" aria-hidden="true" />
        Paying SamaanShare
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

        <dt>Total to send</dt>
        <dd className="text-foreground font-medium">{formatPKR(total)}</dd>
      </dl>

      {!isConfirmed && isPaymentCollectionConfigured() && (
        <>
          <ul className="flex flex-col gap-2">
            {PLATFORM_PAYMENT_ACCOUNTS.map((account) => (
              <li
                key={`${account.provider}-${account.accountNumber}`}
                className="bg-background/60 flex flex-col gap-0.5 rounded-lg border px-2.5 py-2"
              >
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <LandmarkIcon
                    className="size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  {account.provider}
                </span>
                <span className="text-muted-foreground text-xs">
                  {account.accountTitle}
                </span>
                {/*
                  Monospace and breakable: an account number is copied digit by digit into
                  another app, and a proportional font makes that materially harder to get right.
                */}
                <span className="font-mono text-xs break-all">
                  {account.accountNumber}
                </span>
                {account.note && (
                  <span className="text-muted-foreground text-xs">
                    {account.note}
                  </span>
                )}
              </li>
            ))}
          </ul>

          <p className="text-muted-foreground text-xs leading-relaxed">
            {`Send ${formatPKR(total)} and then record the transaction reference below. We check it against our account, usually the same day, and tell you either way. The owner hands the item over once we have confirmed it.`}
          </p>
        </>
      )}

      {!isConfirmed && !isPaymentCollectionConfigured() && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          Payment is not available yet — SamaanShare has no receiving account
          set up. Nothing is owed until it is, and this booking will wait.
        </p>
      )}

      {isConfirmed && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          {securityDeposit > 0
            ? `We have your payment. SamaanShare holds your ${formatPKR(securityDeposit)} deposit until the item is back, and returns it less anything an upheld damage claim awards the owner.`
            : "We have your payment, and will pay the owner once the item is back."}
        </p>
      )}
    </div>
  );
}

export { PaymentInstructions };
