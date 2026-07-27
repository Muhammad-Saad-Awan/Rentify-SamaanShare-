import { Inter } from "next/font/google";

/**
 * Application typography.
 *
 * Fonts are loaded through `next/font`, which downloads and self-hosts the
 * files at build time. That means no runtime request to Google Fonts (better
 * for users on slower Pakistani mobile networks), no render-blocking
 * stylesheet, and an automatically generated fallback with matching metrics
 * so swapping the webfont in does not shift the layout.
 *
 * Each font exposes a CSS variable that `src/app/globals.css` maps onto a
 * Tailwind theme token (`--font-sans`, `--font-heading`).
 */

/**
 * Inter — primary UI typeface for all Latin text.
 *
 * Only the `latin` subset is requested; Urdu support (Phase 3) will need a
 * separate Nastaliq face rather than an extra Inter subset.
 */
export const fontSans = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/**
 * Font CSS variables to apply to the root `<html>` element.
 *
 * Kept as a single joined string so additional families can be added here
 * without touching the root layout.
 */
export const fontVariables = [fontSans.variable].join(" ");
