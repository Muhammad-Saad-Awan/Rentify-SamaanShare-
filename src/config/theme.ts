/**
 * Theme configuration.
 *
 * Dark mode is fully wired end to end — colour tokens in `globals.css`, the
 * `dark` Tailwind variant, and the `next-themes` provider — but it is switched
 * OFF for the MVP so every visitor gets the light theme. Turning it on is a
 * one-line change here; no component or token edits are required.
 */
export const THEME_CONFIG = {
  /**
   * How the active theme is written to the `<html>` element.
   *
   * Must stay `"class"` to match the `@custom-variant dark (&:is(.dark *))`
   * rule in `globals.css` — changing it silently breaks every `dark:` utility.
   */
  attribute: "class",

  /** Theme applied when the user has expressed no preference. */
  defaultTheme: "light",

  darkMode: {
    /**
     * Master switch. While `false` the theme is pinned to `defaultTheme` and
     * theme-switching is a no-op.
     */
    enabled: false,

    /** Follow the OS `prefers-color-scheme` setting. Requires `enabled`. */
    followSystem: false,
  },

  /**
   * Suppress CSS transitions during a theme swap so colours change in a single
   * frame instead of sweeping across the page.
   */
  disableTransitionOnChange: true,
} as const;

export type ThemeConfig = typeof THEME_CONFIG;

/** `true` when users are allowed to change theme at runtime. */
export const isThemeSwitchable =
  THEME_CONFIG.darkMode.enabled || THEME_CONFIG.darkMode.followSystem;
