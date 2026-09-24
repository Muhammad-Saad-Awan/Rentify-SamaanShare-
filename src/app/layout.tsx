import { AuthSessionProvider } from "@/components/providers/session-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { fontVariables } from "@/config/fonts";
import { siteConfig } from "@/config/site";
import { THEME_CONFIG } from "@/config/theme";

import "./globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  // Spread required: siteConfig is `as const`, Metadata expects a mutable array
  keywords: [...siteConfig.keywords],

  /**
   * The site-wide Twitter card, set here because Next does NOT derive one from `openGraph`.
   *
   * Without it a shared link renders as a bare URL on X and on the several other clients that
   * read these tags - WhatsApp among them, which matters more than X for this audience and is
   * the sharing route the listing page is built around.
   *
   * `summary_large_image` rather than `summary`: the pages worth sharing are listings, and a
   * listing is a photograph of an object. Pages that set their own `openGraph` override the
   * title, description and image below with their own - see the listing and category pages.
   */
  twitter: {
    card: "summary_large_image",
    title: {
      default: siteConfig.name,
      template: `%s | ${siteConfig.name}`,
    },
    description: siteConfig.description,
  },
};

export const viewport: Viewport = {
  // Tells the browser which schemes to render native UI (scrollbars, form
  // controls) for. Widens to "light dark" automatically if dark mode is enabled.
  colorScheme: THEME_CONFIG.darkMode.enabled ? "light dark" : "light",
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    // suppressHydrationWarning is required by next-themes: it sets the theme
    // class on <html> before React hydrates, which would otherwise mismatch.
    <html
      lang="en"
      className={`${fontVariables} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <AuthSessionProvider>
            {children}
            <Toaster />
          </AuthSessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
