import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Unit tests for the pure modules.
 *
 * SCOPE IS DELIBERATE. Only modules with no React, no Prisma and no request context are
 * tested here - the parsers, serializers, formatters and calculators. Those are where the
 * load-bearing invariants live: a filter that silently stops applying, a price that rounds
 * the wrong way, a calendar that shifts a day across a timezone. They are also the code that
 * throwaway scripts had been "verifying" up to now, which is not the same as verifying it.
 *
 * Anything touching the database or a Server Action stays out. Those need a live Postgres and
 * a request scope, so testing them properly means an integration harness with its own
 * database - worth doing, but a different exercise, and pretending a mock covers it would be
 * worse than the honest gap.
 *
 * `environment: "node"` because nothing here touches the DOM. The one browser-only module,
 * `utils/image.ts`, needs a canvas and is therefore not unit-testable without jsdom - noted
 * rather than faked.
 */
export default defineConfig({
  test: {
    environment: "node",
    // Co-located with the code, so a module and its tests move together.
    include: ["src/**/*.test.ts"],
    // Explicit imports from "vitest" instead of injected globals: it keeps the ESLint and
    // TypeScript setup unchanged, with no ambient types to configure.
    globals: false,
  },
  resolve: {
    alias: {
      // Mirrors the `@/*` path alias from tsconfig. Declared by hand rather than via a
      // plugin, to avoid adding a dependency for one line.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
