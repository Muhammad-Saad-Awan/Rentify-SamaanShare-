/** The id this link targets. The shell must put it on its `<main>`. */
const MAIN_CONTENT_ID = "main-content";

/**
 * Keyboard shortcut past the header into page content.
 *
 * Visually hidden until focused, which is the point: it is the first tab stop on
 * the page and only appears for someone actually tabbing. Without it a keyboard
 * or screen reader user walks the entire header - and, in the dashboard shell,
 * every sidebar link - before reaching the content, on every single navigation.
 *
 * A plain `<a href="#...">` rather than `<Link>`: this is an in-page fragment
 * jump, and routing it through the client router would push a history entry for
 * a move that never left the page.
 */
function SkipToContent() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="bg-background text-foreground focus-visible:ring-ring sr-only rounded-lg border px-3 py-2 text-sm font-medium shadow-md outline-none focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus-visible:ring-2"
    >
      Skip to content
    </a>
  );
}

export { MAIN_CONTENT_ID, SkipToContent };
