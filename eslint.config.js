// eslint.config.js — Pure flat config (no compat), React + Hooks + Refresh + A11y
import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'build', 'node_modules', 'coverage']),
  js.configs.recommended,

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },

    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },

    settings: { react: { version: 'detect' } },

    rules: {
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',

      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      'jsx-a11y/alt-text': 'warn',
      'jsx-a11y/anchor-is-valid': 'warn',
      'jsx-a11y/no-autofocus': 'off',

      // ---- Project-specific ----
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',   // ignore consts like UPPER_CASE
        argsIgnorePattern: '^_',        // ignore unused fn args prefixed with _
        caughtErrors: 'all',            // check all catch params
        caughtErrorsIgnorePattern: '^_',// …but ignore ones prefixed with _
      }],
    },
  },

  {
    files: ['api/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
