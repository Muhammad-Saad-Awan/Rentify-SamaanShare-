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
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
