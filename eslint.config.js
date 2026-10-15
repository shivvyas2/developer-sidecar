import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', 'release-tree/**', '.mod-test/**', 'docs/**', '**/node_modules/**', 'playwright-report/**', 'test-results/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Sanitizer tests spell out the exact characters they strip.
      'no-irregular-whitespace': ['error', { skipRegExps: true, skipStrings: true }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui-kit/src/react.tsx'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: { 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
  },
  {
    files: ['plugin/src/mod/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: ['fs', 'path', 'os', 'child_process', { name: '@sidecar/shared/home', message: 'The mod runs with no Node: it cannot read the home folder.' }],
        patterns: [{ group: ['node:*'], message: 'The mod runs with no Node.' }],
      }],
    },
  },
)
