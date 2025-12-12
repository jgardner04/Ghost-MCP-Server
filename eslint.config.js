import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
      },
    },
    plugins: {
      prettier,
    },
    rules: {
      'prettier/prettier': 'error',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off',
      // Prevent inline dynamic imports of services - use lazy-loaded variables instead
      // See docs/SERVICE_PATTERNS.md for details
      // Note: This rule catches variable declarations that use dynamic imports of services
      // Pattern: const foo = await import('./services/...')
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'VariableDeclarator > AwaitExpression > ImportExpression[source.value*="ghostService"]',
          message:
            'Use lazy-loaded ghostService variable instead of inline dynamic imports. See docs/SERVICE_PATTERNS.md',
        },
        {
          selector:
            'VariableDeclarator > AwaitExpression > ImportExpression[source.value*="pageService"]',
          message:
            'Use lazy-loaded pageService variable instead of inline dynamic imports. See docs/SERVICE_PATTERNS.md',
        },
        {
          selector:
            'VariableDeclarator > AwaitExpression > ImportExpression[source.value*="newsletterService"]',
          message:
            'Use lazy-loaded newsletterService variable instead of inline dynamic imports. See docs/SERVICE_PATTERNS.md',
        },
      ],
    },
  },
  {
    ignores: ['node_modules/**', 'build/**', 'coverage/**', 'dist/**'],
  },
];
