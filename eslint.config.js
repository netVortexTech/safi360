import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'node_modules',
      'coverage',
      'playwright-report',
      'test-results',
      '*.config.js',
      'eslint.config.js',
      'supabase/functions/**/*.ts', // Deno code is linted by `deno lint`, not ESLint
      '!supabase/functions/_shared/schemas.ts',
      '!supabase/functions/_shared/schemas.test.ts',
      '!supabase/functions/_shared/enums.ts',
      // Pure, runtime-agnostic modules shared with the client are linted like app code.
      '!supabase/functions/_shared/pricing/**',
      '!supabase/functions/_shared/availability/**',
      '!supabase/functions/_shared/handlers/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        project: ['./tsconfig.app.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          // Providers export their companion hook from the same file.
          allowExportNames: ['buttonVariants', 'badgeVariants', 'routes', 'useToast', 'useAuth'],
        },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      // Hex colours belong in tokens, not components (ui-spec rule).
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#[0-9a-fA-F]{3,8}\\b/]',
          message: 'No hex colours in components. Use a Tailwind token or CSS variable.',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{3,8}\\b/]',
          message: 'No hex colours in components. Use a Tailwind token or CSS variable.',
        },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**', 'supabase/tests/**', 'e2e/**'],
    rules: {
      'no-restricted-syntax': 'off', // tests may assert on literal hex values
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    files: ['*.config.{js,ts}', 'vitest.workspace.ts', 'tailwind.config.ts', 'src/styles/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
);
