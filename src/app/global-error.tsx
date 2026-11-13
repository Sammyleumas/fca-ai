"use client";

/** Last-resort error page (the root layout itself failed), so it brings its own minimal styling. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100dvh", display: "grid", placeItems: "center", background: "#03031A", color: "#fff", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <p style={{ color: "#FFEB3B", fontWeight: 700, margin: "0 0 12px" }}>FCA-AI</p>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#b4b4c6", margin: "0 0 20px" }}>Please try again in a moment.</p>
          {error.digest && <p style={{ color: "#8a8aa3", fontSize: 12, fontFamily: "monospace" }}>Reference: {error.digest}</p>}
          <button onClick={reset} style={{ background: "#FFEB3B", color: "#000", border: 0, borderRadius: 999, padding: "12px 24px", fontWeight: 700, cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
