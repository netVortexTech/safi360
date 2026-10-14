import { fileURLToPath, URL } from 'node:url';
import { defineWorkspace } from 'vitest/config';

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
  // vite-plugin-pwa is not loaded under vitest; stub its virtual module.
  'virtual:pwa-register': fileURLToPath(new URL('./src/test/stubs/pwa-register.ts', import.meta.url)),
};

// Two projects:
//  - unit: components, hooks and lib helpers under jsdom (esbuild handles the JSX runtime)
//  - db:   SQL migrations, RLS policies and database functions run against an
//          embedded Postgres (PGlite). The same SQL files run under `supabase test db`
//          when a Docker-backed local stack is available.
export default defineWorkspace([
  {
    resolve: { alias },
    esbuild: { jsx: 'automatic' },
    test: {
      name: 'unit',
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/_shared/**/*.test.ts'],
      css: false,
    },
  },
  {
    resolve: { alias },
    test: {
      name: 'db',
      environment: 'node',
      globals: true,
      include: ['supabase/tests/**/*.test.ts'],
      testTimeout: 60_000,
      hookTimeout: 120_000,
      pool: 'forks',
    },
  },
]);
