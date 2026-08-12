import { env, isEmailEnabled } from "@/config/env";

import type { EmailContent } from "@/lib/email/templates";

/**
 * Sending transactional email through Resend.
 *
 * WHY NOT THE `resend` SDK. Sending is one authenticated POST with a JSON body, and this codebase
 * has already made this call once: `src/lib/cloudinary.ts` computes an upload signature by hand
 * rather than pulling the Cloudinary SDK for twenty lines. Same trade here, same reasoning - a
 * dependency earns its place by doing something hard, and this is a `fetch`.
 *
 * SERVER ONLY. It reads `RESEND_API_KEY`, which must never reach a browser. Importing this from a
 * Client Component would fail on `@/config/env`'s guard, which is the intended outcome.
 *
 * NOTHING HERE LOGS THE KEY, THE BODY, OR THE RECIPIENT. A reset email's body contains a live
 * account-takeover credential, so logging it "for debugging" would move the secret into whatever
 * has read access to logs. Failures log the provider's status and message only.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * How long to wait on the provider before giving up.
 *
 * Bounded because the caller is a Server Action holding a user's request open. Ten seconds is far
 * beyond a normal send and still short enough that a provider outage fails the request rather than
 * hanging it until the platform's own timeout.
 */
const SEND_TIMEOUT_MS = 10_000;

export type SendEmailResult =
  | { sent: true; id: string }
  /** `reason` is for logs and must never be shown to the user - see the note in the action. */
  | { sent: false; reason: string };

interface SendEmailOptions {
  to: string;
  content: EmailContent;
}

/**
 * Sends one email.
 *
 * Returns a result rather than throwing, because every caller has to carry on regardless: a password
 * reset must report the same thing to the user whether the mail went out or not, and only the server
 * log should know the difference.
 */
export async function sendEmail({
  to,
  content,
}: SendEmailOptions): Promise<SendEmailResult> {
  if (!isEmailEnabled()) {
    // Not an exception: an unconfigured integration is a feature that is not offered. The UI gates
    // on `isEmailEnabled()` so this should be unreachable from a rendered form.
    return { sent: false, reason: "RESEND_API_KEY is not configured" };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [to],
        subject: content.subject,
        html: content.html,
        text: content.text,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      /**
       * The provider's own message, which is the one thing worth capturing.
       *
       * Read as text rather than JSON because an error page from a proxy in front of the API is not
       * JSON, and a parse failure here would mask the actual status. Truncated so a long HTML error
       * body cannot flood the log.
       */
      const detail = (await response.text().catch(() => "")).slice(0, 300);

      return {
        sent: false,
        reason: `Resend responded ${response.status}: ${detail}`,
      };
    }

    const body = (await response.json()) as { id?: string };

    return { sent: true, id: body.id ?? "unknown" };
  } catch (error) {
    // Covers the timeout above and any network failure. The message only - not the error object,
    // whose `cause` chain can include the request headers on some runtimes.
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "unknown send failure",
    };
  }
}
