"use client";

/**
 * Last-resort boundary, for errors thrown by the root layout itself.
 *
 * This is the only error file that must render its own `<html>` and `<body>`: it
 * REPLACES the root layout rather than rendering inside it, because the root layout
 * is what failed. That also means none of the app's providers, fonts or theme class
 * are available here - so the markup below deliberately uses inline styles and system
 * fonts rather than Tailwind utilities that may never have been applied.
 *
 * The colours are the brand's, written out as hex for the same reason: deep navy
 * `#142B3B` ink on the `#F8FAFC` page, a white bordered card, `#536273` for the
 * secondary line (5.97:1 on the page colour, 6.25:1 on white) and a navy button
 * with white text (14.6:1). They mirror `--foreground`, `--background`, `--card`,
 * `--border` and `--muted-foreground` in `globals.css`, which cannot be read here.
 *
 * Kept deliberately plain. Anything clever here can throw a second time, and a
 * boundary that fails has nowhere left to fall back to.
 */
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          boxSizing: "border-box",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#F8FAFC",
          color: "#142B3B",
        }}
      >
        <main
          style={{
            width: "100%",
            maxWidth: "28rem",
            padding: "2rem",
            boxSizing: "border-box",
            background: "#FFFFFF",
            border: "1px solid #E2E8F0",
            borderRadius: "0.75rem",
          }}
        >
          <p
            style={{
              margin: "0 0 1.25rem",
              fontSize: "1rem",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            SamaanShare
          </p>
          <h1
            style={{
              fontSize: "1.375rem",
              lineHeight: 1.25,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              margin: "0 0 0.5rem",
            }}
          >
            SamaanShare could not load
          </h1>
          <p
            style={{
              margin: "0 0 1.5rem",
              lineHeight: 1.6,
              color: "#536273",
              fontSize: "0.9375rem",
            }}
          >
            Something failed while starting the page. This is on our side, not
            yours.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: "2.5rem",
              padding: "0.5rem 1.25rem",
              fontSize: "0.9375rem",
              fontWeight: 500,
              fontFamily: "inherit",
              borderRadius: "0.5rem",
              border: "1px solid #142B3B",
              background: "#142B3B",
              color: "#FFFFFF",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
