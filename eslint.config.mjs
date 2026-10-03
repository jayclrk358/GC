import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const webFiles = ['apps/web/**/*.{ts,tsx}'];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      'packages/db/drizzle/**',
      'apps/web/next-env.d.ts',
      'apps/web/playwright-report/**',
      'apps/web/test-results/**',
      'storage/**',
      'apps/desktop/release/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...nextVitals.map((c) => ({ ...c, files: webFiles })),
  ...nextTs.map((c) => ({ ...c, files: webFiles })),
  {
    settings: { next: { rootDir: 'apps/web' } },
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/components/ui/link.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next/link',
              message:
                "Use '@/components/ui/link': it fetches pages ahead only when someone's about to open them.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'packages/db/src/**/*.ts',
      'packages/auth/src/seed-demo.ts',
      'apps/worker/src/**/*.ts',
      'apps/loadtest/src/**/*.ts',
      'apps/web/cluster.mjs',
      'scripts/**',
    ],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
