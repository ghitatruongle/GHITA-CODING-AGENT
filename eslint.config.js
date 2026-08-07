import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/target/**',
      '**/coverage/**',
      '**/refer_project/**',
      '**/.gradle/**',
      '**/.cxx/**',
      '**/*.tsbuildinfo',
      'packages/*/src/**/*.js',
      'packages/*/src/**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'prefer-const': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'error',
      // v1.0.0 (final review sweep): these heuristic style rules produced
      // ~540 warnings across the monorepo without flagging any real defect
      // (typecheck + tests are green). They are structural style guidance,
      // not correctness checks — disabled per maintainer decision so lint is
      // warning-free and actionable. Correctness rules above remain 'error'.
      complexity: 'off',
      'max-depth': 'off',
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-params': 'off',
      'max-nested-callbacks': 'off',
      'no-implicit-coercion': 'error',
      'no-return-assign': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-useless-call': 'error',
      'no-useless-concat': 'error',
      'no-useless-return': 'error',
      'prefer-template': 'error',
      'no-var': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // Presentational fidelity blocks extracted from large desktop views.
  // Keep original JSX for product fidelity; structural max-lines noise is acceptable.
  {
    files: [
      'apps/desktop/src/views/devices/**/*.{ts,tsx}',
      'apps/desktop/src/views/ecosystem/**/*.{ts,tsx}',
      'apps/desktop/src/components/webview/**/*.{ts,tsx}',
      'apps/desktop/src/components/chat/AgentActivityTimeline.tsx',
      'apps/desktop/src/components/chat/ChatStatusBar.tsx',
      'apps/desktop/src/components/chat/ChatAdvancedPanel.tsx',
      'apps/desktop/src/components/chat/RalphProgressCard.tsx',
      'apps/desktop/src/components/chat/ChatAgentControls.tsx',
      'apps/desktop/src/views/DevicesView.tsx',
      'apps/desktop/src/views/EcosystemView.tsx',
      'apps/desktop/src/components/WebViewPanel.tsx',
    ],
    rules: {
      'max-lines-per-function': 'off',
      'max-lines': 'off',
      complexity: 'off',
    },
  },
);
