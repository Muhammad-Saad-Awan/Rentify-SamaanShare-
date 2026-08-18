import { publicEnv } from "@/config/env.public";
import {
  createVerificationToken,
  verificationTokenExpiry,
  verifyEmailUrl,
} from "@/lib/auth/email-verification";
import { sendEmail } from "@/lib/email/send";
import { emailVerificationEmail } from "@/lib/email/templates";
import { prisma } from "@/lib/prisma";

import type { SendEmailResult } from "@/lib/email/send";

/**
 * Minting a confirmation token and sending it.
 *
 * A module of its own rather than a helper inside an action file, because two callers need it -
 * `registerUser` sends the first one, `sendEmailVerification` sends every later one - and a
 * `"use server"` file may only export async functions, so it could not be shared from either.
 *
 * SERVER ONLY. It reaches `sendEmail`, which reads `RESEND_API_KEY`.
 */

interface VerificationRecipient {
  id: string;
  name: string | null;
  email: string;
}

/**
 * Spends any outstanding link, mints a new one, and emails it.
 *
 * Returns the send result rather than throwing, so each caller decides what a failure means: for a
 * registration it is logged and ignored, because the account is already usable; for an explicit
 * "resend" it is reported, because the user asked for something and is waiting for it.
 */
export async function sendVerificationEmailTo(
  user: VerificationRecipient
): Promise<SendEmailResult> {
  const { token, tokenHash } = createVerificationToken();

  await prisma.$transaction(async (tx) => {
    /**
     * Any earlier outstanding link is spent first.
     *
     * So requesting a new one invalidates the old rather than leaving several live links to one
     * account. Marked used rather than deleted, so clicking an older link reports "no longer valid"
     * instead of "never existed", and so a replay stays visible in the data.
     */
    await tx.emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await tx.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        // Bound to the address as it is right now - see the column note on why the token carries it.
        email: user.email,
        expiresAt: verificationTokenExpiry(),
      },
    });
  });

  return sendEmail({
    to: user.email,
    content: emailVerificationEmail({
      // From the configured origin, never the request's Host header - see `verifyEmailUrl`.
      verifyUrl: verifyEmailUrl(publicEnv.NEXT_PUBLIC_APP_URL, token),
      name: user.name,
    }),
  });
}
