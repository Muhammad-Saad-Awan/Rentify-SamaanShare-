import { isEmailEnabled } from "@/config/env";
import { prisma } from "@/lib/prisma";

/**
 * The confirmed-address requirement for renting and listing.
 *
 * SERVER ONLY. `isEmailEnabled()` reads `RESEND_API_KEY`.
 *
 * ONLY WHERE MAIL CAN BE SENT. A requirement nobody can clear is an outage, not a safety measure: on a
 * deployment without Resend the confirmation link can never arrive, so gating on it would lock every
 * unconfirmed member out of the marketplace with no way back in. Production sends from a verified
 * domain, so there it always applies.
 */
export function isEmailConfirmationRequired(): boolean {
  return isEmailEnabled();
}

/** The message both actions return, so the refusal reads the same wherever it is met. */
export const EMAIL_CONFIRMATION_REQUIRED_ERROR =
  "Please confirm your email address first. You can send yourself a confirmation link from your profile.";

/**
 * Whether this user still has to confirm their address before renting or listing.
 *
 * READ FROM THE DATABASE, NEVER THE SESSION - see `getRenterAccessSignals`. A JWT minted before the
 * link was clicked carries `emailVerified: null` for up to 24 hours, and refusing someone who has just
 * done what we asked would read as the confirmation having failed.
 */
export async function needsEmailConfirmation(userId: string): Promise<boolean> {
  if (!isEmailConfirmationRequired()) {
    return false;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  });

  return !user?.emailVerified;
}
