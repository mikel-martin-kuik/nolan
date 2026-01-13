import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Custom rule for Tauri invoke snake_case enforcement
import noCamelcaseInvoke from './eslint-rules/no-camelcase-invoke.js';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Base JavaScript recommended rules
  js.configs.recommended,

  // TypeScript support
  ...tseslint.configs.recommended,

  // Global configuration
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },

  // TypeScript and React files
  {
    files: ['src/**/*.{ts,tsx,js,jsx}'],
    plugins: {
      'tauri-ipc': {
        rules: {
          'no-camelcase-invoke': noCamelcaseInvoke,
        },
      },
    },
    rules: {
      // Enforce snake_case in invoke() calls
      'tauri-ipc/no-camelcase-invoke': 'error',

      // Relax some rules for existing codebase
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },

  // Ignore patterns
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'src-tauri/**',
      '*.config.js',
      '*.config.ts',
    ],
  },
];
