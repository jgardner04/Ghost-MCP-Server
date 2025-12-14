import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.js'],
    // Use forks pool for better module isolation between test files
    // Each test file runs in its own child process with independent module cache
    // This prevents race conditions when different test files mock the same module differently
    pool: 'forks',
    poolOptions: {
      forks: {
        // Ensure each test file is fully isolated
        isolate: true,
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
      include: ['src/**/*.js'],
      exclude: [
        'node_modules/**',
        'build/**',
        'scripts/**',
        '**/__tests__/**',
        '**/*.test.js',
        '**/*.spec.js',
        // Exclude experimental/variant files from coverage
        'src/mcp_server.js',
        'src/mcp_server_enhanced.js',
        'src/services/ghostServiceImproved.js',
      ],
    },
    include: ['src/**/*.test.js', 'src/**/*.spec.js', 'src/**/__tests__/**/*.js'],
    exclude: ['node_modules/**', 'build/**', 'src/__tests__/helpers/**'],
  },
});
