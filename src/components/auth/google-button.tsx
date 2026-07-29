"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

interface GoogleButtonProps {
  /** Same-origin path to land on after a successful sign-in. */
  callbackUrl: string;
  disabled?: boolean;
}

/**
 * Starts the Google OAuth flow.
 *
 * Rendered only when the server has confirmed Google is configured - see
 * `isGoogleEnabled()`. The parent decides; this component never checks env
 * itself, because `AUTH_GOOGLE_ID` is not exposed to the browser.
 *
 * Unlike the credentials form this uses a full redirect rather than
 * `redirect: false`: the browser has to leave for Google's consent screen, so
 * there is no response to handle inline. Any failure comes back as
 * `?error=` on the login page, which is why the loading state is never cleared
 * on the success path - the page is being torn down.
 */
function GoogleButton({ callbackUrl, disabled }: GoogleButtonProps) {
  const [isRedirecting, setIsRedirecting] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={disabled || isRedirecting}
      onClick={() => {
        setIsRedirecting(true);
        void signIn("google", { redirectTo: callbackUrl });
      }}
    >
      <GoogleLogo />
      {isRedirecting ? "Redirecting…" : "Continue with Google"}
    </Button>
  );
}

/**
 * Inlined rather than pulled from `lucide-react`: Google's brand guidelines
 * require the four-colour mark, and Lucide ships monochrome outlines only.
 */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.9v3.1A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58v-3.1h-3.9a11.99 11.99 0 0 0 0 10.78l3.9-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.9 3.1c.95-2.85 3.6-4.42 5.92-4.42Z"
      />
    </svg>
  );
}

export { GoogleButton };
