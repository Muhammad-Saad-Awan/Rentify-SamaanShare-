import localFont from "next/font/local";

/**
 * Application typography.
 *
 * SELF-HOSTED FROM THE REPOSITORY, NOT FETCHED AT BUILD TIME. `next/font/google` downloads
 * the files from Google during `next build`, and Google sometimes answers a build server with
 * font URLs that carry no file extension. Next's loader assumes one, so the build died with
 * "Cannot read properties of null (reading '1')" on Vercel while building fine locally.
 * Committing the files removes the network from the build entirely.
 *
 * The visitor-facing result is the same as before: the files are served from this site (no
 * request to Google, better on slower Pakistani mobile networks), with no render-blocking
 * stylesheet, and `next/font` still generates a metric-matched fallback so the swap does not
 * shift the layout.
 *
 * Each is a single Latin-subset VARIABLE font (one file covers every weight), taken from
 * Google Fonts. Both are licensed under the SIL Open Font License 1.1, which permits bundling.
 * Urdu support (Phase 3) will need a separate Nastaliq face.
 *
 * Each font exposes a CSS variable that `src/app/globals.css` maps onto a Tailwind theme
 * token (`--font-sans`, `--font-heading`).
 */

/** Inter - primary UI typeface for all Latin text (variable, 100-900). */
export const fontSans = localFont({
  src: "../app/fonts/inter-latin-var.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
});

/**
 * Plus Jakarta Sans - headings, prices and stat values (variable, 200-800).
 *
 * A geometric sans with open, rounded bowls: the face of the reference design. It
 * stays friendly at heavy display weights without turning playful, and its figures
 * keep a column of prices aligned. Inter keeps body text and form controls quiet
 * beside it.
 */
export const fontHeading = localFont({
  src: "../app/fonts/plus-jakarta-sans-latin-var.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  variable: "--font-jakarta",
});

/**
 * Font CSS variables to apply to the root `<html>` element.
 *
 * Kept as a single joined string so additional families can be added here
 * without touching the root layout.
 */
export const fontVariables = [fontSans.variable, fontHeading.variable].join(
  " "
);
