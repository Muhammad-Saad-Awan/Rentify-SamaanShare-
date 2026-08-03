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
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#fff",
          color: "#111",
        }}
      >
        <main
          style={{
            maxWidth: "32rem",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", margin: "0 0 0.75rem" }}>
            SamaanShare could not load
          </h1>
          <p
            style={{
              margin: "0 0 1.5rem",
              lineHeight: 1.6,
              color: "#555",
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
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              borderRadius: "0.5rem",
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
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
