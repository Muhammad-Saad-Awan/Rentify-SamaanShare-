"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

import { THEME_CONFIG } from "@/config/theme";

import type { ReactNode } from "react";

interface ThemeProviderProps {
  children: ReactNode;
}

/**
 * Applies the active theme as a class on `<html>`, which is what the `dark`
 * custom variant in `globals.css` selects on.
 *
 * While dark mode is disabled we pass `forcedTheme`, so every visitor is
 * pinned to the default theme and `setTheme` becomes a no-op. The provider and
 * tokens stay in place, which keeps enabling dark mode a config-only change.
 */
function ThemeProvider({ children }: ThemeProviderProps) {
  const { attribute, defaultTheme, darkMode, disableTransitionOnChange } =
    THEME_CONFIG;

  return (
    <NextThemesProvider
      attribute={attribute}
      defaultTheme={defaultTheme}
      enableSystem={darkMode.enabled && darkMode.followSystem}
      forcedTheme={darkMode.enabled ? undefined : defaultTheme}
      disableTransitionOnChange={disableTransitionOnChange}
    >
      {children}
    </NextThemesProvider>
  );
}

export { ThemeProvider };
