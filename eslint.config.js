import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist/**',
    '.wrangler/**',
    'node_modules/**',
    '.agents/**',
    '.codex/**',
    '.creator/**',
    'test_sync.js',
  ]),
  {
    files: ['src/**/*.{js,jsx}', 'worker/**/*.js'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Registered legacy React 19 migrations; Phase 3/5 removes these exceptions.
    files: [
      'src/pages/dev/DataTransformer.jsx',
      'src/pages/share/TextShare.jsx',
    ],
    rules: { 'react-hooks/immutability': 'warn' },
  },
  {
    files: ['src/pages/dev/Timestamp.jsx'],
    rules: { 'react-hooks/purity': 'warn' },
  },
  {
    files: [
      'src/pages/dev/StringProcessor.jsx',
      'src/pages/share/TextShare.jsx',
      'src/pages/text/Diff.jsx',
    ],
    rules: { 'react-hooks/set-state-in-effect': 'warn' },
  },
  {
    files: ['src/pages/dev/StringProcessor.jsx'],
    rules: { 'react-hooks/static-components': 'warn' },
  },
  {
    files: ['*.config.js', '*.config.cjs', 'add_seo.cjs', 'tests/**/*.mjs', 'scripts/**/*.mjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Context modules intentionally colocate their provider and consumer hook.
    files: ['src/contexts/*Context.jsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
