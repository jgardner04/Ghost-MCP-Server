import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

// Extracted so the logger.js override can keep this ban active while dropping
// only the Console-transport ban it actually needs to disable. ESLint flat
// config rule overrides replace the rule entirely, so the selector has to be
// referenced in both places.
const SERVICE_INLINE_IMPORT_BAN = {
  selector:
    'VariableDeclarator > AwaitExpression > ImportExpression[source.value=/\\.\\/services\\/(ghost|post|page|newsletter|member|tier|image)Service|\\.\\/services\\/(posts|pages|tags|members|newsletters|tiers|images)/]',
  message:
    'Use lazy-loaded service variable from loadServices() instead of inline dynamic import. See docs/SERVICE_PATTERNS.md',
};

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
      // Default off; per-path overrides below tighten this for MCP-touching code.
      // Stdio MCP transport reserves stdout for JSON-RPC frames; console.log/info/debug
      // route to stdout and would corrupt the protocol channel.
      'no-console': 'off',
      // Forbid joi in new code — Zod schemas under src/schemas/ are the project
      // standard. The override block below allowlists the four legacy files
      // that currently still import joi.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'joi',
              message: 'Use Zod schemas under src/schemas/. joi is allowed only in legacy files.',
            },
          ],
        },
      ],
      // Forbid bare Console transport construction. The createSafeConsoleTransport
      // factory in src/utils/logger.js is the single sanctioned construction site;
      // bare `new winston.transports.Console(...)` would drop stderrLevels and
      // corrupt MCP stdio output. Override below permits the factory's own file.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "NewExpression[callee.object.object.name='winston'][callee.object.property.name='transports'][callee.property.name='Console']",
          message:
            'Use createSafeConsoleTransport() from src/utils/logger.js — bare Console transports drop stderrLevels and corrupt MCP stdio.',
        },
        SERVICE_INLINE_IMPORT_BAN,
      ],
    },
  },
  // Allowlist legacy joi importers. Migrating these to Zod is out of scope here.
  {
    files: [
      'src/utils/urlValidator.js',
      'src/controllers/imageController.js',
      'src/services/pageService.js',
      'src/services/newsletterService.js',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
  // logger.js owns the only Console transport construction. We drop only
  // that ban here; the service-inline-import ban stays active so a future
  // rogue dynamic import in this file would still be caught.
  {
    files: ['src/utils/logger.js'],
    rules: { 'no-restricted-syntax': ['error', SERVICE_INLINE_IMPORT_BAN] },
  },
  // Strict no-console for service/util/controller code and the Express
  // entrypoint: must use logger. src/index.js shares the process with the
  // MCP stdio transport, so a stray console.log there would corrupt the
  // JSON-RPC channel — same risk class as the service layer.
  {
    files: ['src/services/**/*.js', 'src/utils/**/*.js', 'src/controllers/**/*.js', 'src/index.js'],
    ignores: ['**/__tests__/**'],
    rules: { 'no-console': 'error' },
  },
  // MCP server entrypoints may emit startup/fatal banners on stderr only.
  // console.log/info/debug remain forbidden because they default to stdout
  // and would corrupt the stdio JSON-RPC channel.
  {
    files: ['src/mcp_server.js', 'src/mcp_server_enhanced.js'],
    rules: { 'no-console': ['error', { allow: ['error', 'warn'] }] },
  },
  {
    ignores: ['node_modules/**', 'build/**', 'coverage/**', 'dist/**'],
  },
];
