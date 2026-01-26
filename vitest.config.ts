import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.test.ts',
    ],
    exclude: [
      '.orchestral/**',
      'node_modules/**',
      'tests/benchmarks/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/server/public/**',
        'src/cli/index.ts',
        'src/cli/commands/**',
      ],
      // Thresholds will be raised as more tests are added
      // Current focus: core modules (state-manager, run-manager, file-watcher, sanitize)
      thresholds: {
        lines: 30,
        functions: 30,
        branches: 25,
        statements: 30,
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    // Retry flaky tests once
    retry: 1,
    // Benchmark configuration
    benchmark: {
      include: ['tests/benchmarks/**/*.bench.ts'],
      exclude: ['node_modules/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
