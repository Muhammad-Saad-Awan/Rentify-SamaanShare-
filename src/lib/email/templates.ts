import { VERIFICATION_TOKEN_TTL_HOURS } from "@/lib/auth/email-verification";
import { RESET_TOKEN_TTL_MINUTES } from "@/lib/auth/password-reset";
import { siteConfig } from "@/config/site";

/**
 * Outbound email bodies, as pure functions.
 *
 * Separated from the transport for the same reason the notification copy is separated from the
 * insert: this is the wording a user will act on, it is the kind of thing that quietly drifts, and
 * in a pure module it can be asserted without an API key.
 *
 * PLAIN TEXT ALONGSIDE HTML, always. A text part is not a courtesy - a message with only an HTML
 * part scores worse with spam filters, and a password reset that lands in spam is a support ticket
 * at best and a locked-out user at worst.
 *
 * NO IMAGES, NO EXTERNAL CSS, NO TRACKING. Inline styles only, because every mail client strips
 * or rewrites the alternatives, and a reset email is the one message that has to render everywhere.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Escapes a value for interpolation into HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface PasswordResetEmailOptions {
  /** The absolute reset URL, token included. */
  resetUrl: string;
  /** The recipient's display name, when known. */
  name?: string | null;
}

/**
 * The password reset email.
 *
 * THE URL APPEARS AS VISIBLE TEXT as well as a link. Two reasons: a client that strips anchors
 * still leaves something the user can copy, and a visible destination lets a cautious reader see
 * where the link goes before clicking - which is exactly the habit anti-phishing advice asks for,
 * so the message should not fight it.
 *
 * The closing line matters as much as the button. Someone who did not request this needs to know
 * that ignoring the message is sufficient and that no change has happened yet - otherwise a
 * legitimate reset email reads like a breach notification.
 */
export function passwordResetEmail({
  resetUrl,
  name,
}: PasswordResetEmailOptions): EmailContent {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : "Hi,";
  const hours = RESET_TOKEN_TTL_MINUTES / 60;
  const validFor =
    RESET_TOKEN_TTL_MINUTES % 60 === 0
      ? `${hours} hour${hours === 1 ? "" : "s"}`
      : `${RESET_TOKEN_TTL_MINUTES} minutes`;

  const subject = `Reset your ${siteConfig.name} password`;

  const text = [
    greeting,
    "",
    `Someone asked to reset the password for your ${siteConfig.name} account.`,
    "",
    "Open this link to choose a new one:",
    resetUrl,
    "",
    `The link works once and expires in ${validFor}.`,
    "",
    "If you did not ask for this, you can ignore this email - your password has not changed and nobody can use this link without your inbox.",
    "",
    `- ${siteConfig.name}`,
  ].join("\n");

  const safeUrl = escapeHtml(resetUrl);

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <tr>
        <td>
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">Reset your password</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escapeHtml(greeting)}</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">Someone asked to reset the password for your ${escapeHtml(siteConfig.name)} account.</p>
          <p style="margin:0 0 24px;">
            <a href="${safeUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:500;">Choose a new password</a>
          </p>
          <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#52525b;">
            Or copy this link into your browser:<br />
            <span style="word-break:break-all;">${safeUrl}</span>
          </p>
          <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#52525b;">The link works once and expires in ${validFor}.</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#52525b;">
            If you did not ask for this, you can ignore this email — your password has not changed,
            and nobody can use this link without access to your inbox.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

interface EmailVerificationEmailOptions {
  /** The absolute confirmation URL, token included. */
  verifyUrl: string;
  /** The recipient's display name, when known. */
  name?: string | null;
}

/**
 * The email confirmation message.
 *
 * PROMISES ONLY WHAT CONFIRMING AN INBOX ACTUALLY DOES. It does not say "verify your identity" or
 * imply a badge: `User.isVerified` is a separate and much stronger claim, granted after a human
 * checks a document, and copy that blurred the two would have people believing they were verified
 * when they had only clicked a link. The trust score treats them as 0.4 against 1.0 for that reason.
 *
 * The closing line matters. Unlike a password reset, an unexpected confirmation email usually means
 * someone typed the wrong address rather than that an account is under attack - so it tells the
 * reader that ignoring it is enough, without the alarm the reset email's wording carries.
 */
export function emailVerificationEmail({
  verifyUrl,
  name,
}: EmailVerificationEmailOptions): EmailContent {
  const greeting = name?.trim() ? `Hi ${name.trim()},` : "Hi,";
  const validFor = `${VERIFICATION_TOKEN_TTL_HOURS} hours`;

  const subject = `Confirm your email for ${siteConfig.name}`;

  const text = [
    greeting,
    "",
    `Confirm this address so we know we can reach you about your ${siteConfig.name} rentals.`,
    "",
    "Open this link to confirm:",
    verifyUrl,
    "",
    `The link works once and expires in ${validFor}.`,
    "",
    "If you did not create an account, you can ignore this email - nothing has been set up in your name that this link would complete.",
    "",
    `- ${siteConfig.name}`,
  ].join("\n");

  const safeUrl = escapeHtml(verifyUrl);

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <tr>
        <td>
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">Confirm your email</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${escapeHtml(greeting)}</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">Confirm this address so we know we can reach you about your ${escapeHtml(siteConfig.name)} rentals.</p>
          <p style="margin:0 0 24px;">
            <a href="${safeUrl}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:500;">Confirm my email</a>
          </p>
          <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#52525b;">
            Or copy this link into your browser:<br />
            <span style="word-break:break-all;">${safeUrl}</span>
          </p>
          <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#52525b;">The link works once and expires in ${validFor}.</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#52525b;">
            If you did not create an account, you can ignore this email — nothing has been set up in
            your name that this link would complete.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
