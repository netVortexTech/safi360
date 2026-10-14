import { defineConfig } from 'vitest/config';

// Root options shared by every workspace project (see vitest.workspace.ts).
// Coverage is only meaningful for the pure engines; `pnpm test:pricing` runs them with
// `--coverage` and fails below 100% on every metric.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['supabase/functions/_shared/pricing/**', 'supabase/functions/_shared/availability/**'],
      exclude: ['**/*.test.ts', '**/fixtures.ts', '**/index.ts'],
      thresholds: { lines: 100, functions: 100, branches: 100, statements: 100 },
      reporter: ['text-summary', 'text'],
    },
  },
});
