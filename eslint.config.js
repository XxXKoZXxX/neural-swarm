import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Build output, scratch space, and the vendored Discord sample app are not
  // ours to lint - the sample ships with its own unused helpers and globals.
  globalIgnores(['dist', 'mobile/dist', 'scratch', 'discord-example-app', '.smoke']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
      }],
    },
  },
  {
    // The phone app under mobile/ is a separate package with its own build and
    // test suite (see mobile/README.md and the "App CI" workflow). Two rules are
    // relaxed for it, deliberately:
    //
    //   set-state-in-effect - the app loads IndexedDB-backed state on mount and
    //   syncs a seed prop into the editor. Both are the intended patterns; the
    //   newest react-hooks rule reports them as cascading renders.
    //
    //   only-export-components - components/ui.jsx is the app's small UI kit
    //   and also carries copy/clipboard/haptics helpers, the way shadcn does.
    //   Splitting it would churn every import for a dev-refresh nicety.
    files: ['mobile/**/*.{js,jsx}'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    files: ['mobile/src/components/ui.jsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
