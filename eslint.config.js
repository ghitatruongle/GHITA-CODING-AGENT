import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const reactHooksPlugin = {
  rules: {
    'exhaustive-deps': {
      meta: {
        type: 'suggestion',
        docs: { description: 'Stub for react-hooks/exhaustive-deps' },
        schema: [],
      },
      create() {
        return {};
      },
    },
  },
};

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
      'complexity': ['warn', { max: 15 }],
      'max-depth': ['warn', { max: 4 }],
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-params': ['warn', { max: 5 }],
      'max-nested-callbacks': ['warn', { max: 3 }],
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
    },
  },
);
