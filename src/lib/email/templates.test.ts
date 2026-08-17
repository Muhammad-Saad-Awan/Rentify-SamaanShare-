import { describe, expect, it } from "vitest";

import {
  emailVerificationEmail,
  passwordResetEmail,
} from "@/lib/email/templates";

/**
 * Outbound email copy.
 *
 * A reset email is the one message that must render in every client and must not read like a breach
 * notification to someone who did not request it. Both of those are wording properties, which is
 * exactly the kind of thing a later copy edit erodes silently.
 */

const resetUrl = "https://samaanshare.pk/reset-password?token=abc123";

describe("passwordResetEmail", () => {
  it("always includes a plain-text part", () => {
    // Not a courtesy: an HTML-only message scores worse with spam filters, and a reset that lands in
    // spam is a locked-out user.
    const email = passwordResetEmail({ resetUrl });

    expect(email.text.length).toBeGreaterThan(50);
    expect(email.html.length).toBeGreaterThan(50);
  });

  it("puts the link in both parts", () => {
    const email = passwordResetEmail({ resetUrl });

    expect(email.text).toContain(resetUrl);
    expect(email.html).toContain(resetUrl);
  });

  /**
   * Visible as text, not only as an anchor. A client that strips anchors still leaves something
   * copyable, and a cautious reader can see the destination before clicking - which is the habit
   * anti-phishing advice asks for.
   */
  it("shows the URL as readable text as well as a link", () => {
    const email = passwordResetEmail({ resetUrl });

    expect(email.html).toContain(`href="${resetUrl}"`);
    expect(email.html).toContain(
      `<span style="word-break:break-all;">${resetUrl}</span>`
    );
  });

  it("states the expiry and that the link is single use", () => {
    const email = passwordResetEmail({ resetUrl });

    expect(email.text).toContain("works once");
    expect(email.text).toContain("1 hour");
  });

  /**
   * Someone who did not request this must be told that ignoring it is enough and that nothing has
   * changed yet. Without that line, a legitimate reset email reads as a compromise notice.
   */
  it("reassures a recipient who did not request it", () => {
    const email = passwordResetEmail({ resetUrl });

    expect(email.text).toContain("did not ask for this");
    expect(email.text).toContain("has not changed");
  });

  it("greets by name when there is one, and neutrally when not", () => {
    expect(passwordResetEmail({ resetUrl, name: "Ayesha" }).text).toContain(
      "Hi Ayesha,"
    );
    expect(passwordResetEmail({ resetUrl, name: null }).text).toContain("Hi,");
    // A name of only whitespace must not produce "Hi   ,".
    expect(passwordResetEmail({ resetUrl, name: "   " }).text).toContain("Hi,");
  });

  /**
   * A display name is user-controlled and lands in an HTML document. Unescaped, it is stored XSS in
   * whatever webmail renders the message.
   */
  it("escapes HTML in the recipient's name", () => {
    const email = passwordResetEmail({
      resetUrl,
      name: "<script>alert(1)</script>",
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("escapes HTML in the URL", () => {
    const email = passwordResetEmail({
      resetUrl: 'https://a.pk/reset?token="><script>x</script>',
    });

    expect(email.html).not.toContain("<script>");
  });

  it("references no external assets", () => {
    // Images and external stylesheets are stripped or rewritten by mail clients, and a remote image
    // is a read receipt the recipient did not agree to.
    const { html } = passwordResetEmail({ resetUrl });

    expect(html).not.toMatch(/<img\b/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/url\(/i);
  });

  it("names the product in the subject", () => {
    expect(passwordResetEmail({ resetUrl }).subject).toContain("SamaanShare");
  });
});

const verifyUrl = "https://samaanshare.pk/verify-email?token=abc123";

describe("emailVerificationEmail", () => {
  it("always includes a plain-text part", () => {
    const email = emailVerificationEmail({ verifyUrl });

    expect(email.text.length).toBeGreaterThan(50);
    expect(email.html.length).toBeGreaterThan(50);
  });

  it("puts the link in both parts, and visibly in the HTML", () => {
    const email = emailVerificationEmail({ verifyUrl });

    expect(email.text).toContain(verifyUrl);
    expect(email.html).toContain(`href="${verifyUrl}"`);
    // Copyable even in a client that strips anchors.
    expect(email.html).toContain(`>${verifyUrl}<`);
  });

  /**
   * THE ONE THAT MATTERS.
   *
   * Confirming an inbox is not identity verification. `User.isVerified` is granted by a person after
   * checking a document and is what earns the public badge; the trust score weights the two 0.4
   * against 1.0. Copy that blurred them would leave people believing they were verified when they
   * had only clicked a link - a belief they would act on when deciding who to trust.
   */
  it("never claims the reader's identity has been verified", () => {
    const email = emailVerificationEmail({ verifyUrl, name: "Ali" });
    const copy = `${email.subject} ${email.text} ${email.html}`.toLowerCase();

    for (const claim of [
      "identity",
      "verified",
      "verify your identity",
      "badge",
    ]) {
      expect(copy).not.toContain(claim);
    }
  });

  /**
   * An unexpected confirmation email usually means someone mistyped an address, not that an account
   * is under attack - so it must not carry the reset email's alarm.
   */
  it("tells an unintended recipient that ignoring it is enough", () => {
    const email = emailVerificationEmail({ verifyUrl });

    expect(email.text.toLowerCase()).toContain("ignore this email");
  });

  it("greets by name when there is one, and neutrally when there is not", () => {
    expect(emailVerificationEmail({ verifyUrl, name: "Ali" }).text).toContain(
      "Hi Ali,"
    );
    expect(emailVerificationEmail({ verifyUrl, name: null }).text).toContain(
      "Hi,"
    );
    expect(emailVerificationEmail({ verifyUrl, name: "   " }).text).toContain(
      "Hi,"
    );
  });

  it("escapes a URL that would otherwise break out of the attribute", () => {
    const hostile = 'https://x.test/?a="onload="alert(1)';
    const email = emailVerificationEmail({ verifyUrl: hostile });

    expect(email.html).not.toContain('onload="alert(1)"');
    expect(email.html).toContain("&quot;");
  });
});
