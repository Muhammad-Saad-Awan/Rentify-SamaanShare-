/**
 * Where renters send money.
 *
 * Under the custodial flow SamaanShare receives the rental and the deposit and holds them until
 * the rental finishes. That only works if the renter can be told an account to pay into, and
 * this is that list.
 *
 * NOT ENVIRONMENT VARIABLES, deliberately. An account title and an IBAN are not deployment
 * configuration - they are the same on every environment that is really taking money, they want
 * to be reviewed in a pull request like any other user-facing content, and getting one wrong
 * sends a member's money somewhere it cannot be recovered from. A hosting dashboard is the wrong
 * place for a value with that consequence: nobody reviews it, and nobody can tell afterwards
 * when it changed or who changed it.
 *
 * EMPTY IS A SUPPORTED STATE, and the reason it ships empty. The same rule the Cloudinary and
 * Resend integrations follow: an unconfigured feature is not offered rather than half-offered.
 * With no accounts here the payment step says plainly that payment is not available yet, which
 * is a visible and correct failure - the alternative is a renter transferring money into a void
 * because a screen had an empty field where a number should be.
 *
 * SO THIS MUST BE FILLED IN BEFORE ANYBODY PAYS. It is the one thing standing between the
 * custodial flow and a working product, and it cannot be filled in from here - it needs real
 * accounts in SamaanShare's name.
 */

export interface PlatformPaymentAccount {
  /** Bank or wallet name, as a person would say it: "Meezan Bank", "JazzCash". */
  provider: string;
  /**
   * The account title, which matters more than it looks.
   *
   * Pakistani banking apps show the recipient's title before the transfer completes, and a
   * renter who sees a name they were not expecting will - correctly - stop. It has to match
   * what is printed here exactly.
   */
  accountTitle: string;
  /** IBAN, account number or wallet number. Shown verbatim, so it is stored verbatim. */
  accountNumber: string;
  /** Anything the number alone does not convey - a branch, a sort code, an instruction. */
  note?: string;
}

/**
 * The accounts, in the order a renter should see them.
 *
 * Put the one most people will use first. An empty array switches the custodial payment step
 * off - see the note at the top of this file.
 */
export const PLATFORM_PAYMENT_ACCOUNTS: readonly PlatformPaymentAccount[] = [];

/**
 * Whether renters can be told where to pay.
 *
 * Mirrors `isEmailEnabled()` and `isCloudinaryEnabled()`: the question is not whether the code
 * exists but whether the feature can honestly be offered.
 */
export function isPaymentCollectionConfigured(): boolean {
  return PLATFORM_PAYMENT_ACCOUNTS.length > 0;
}
