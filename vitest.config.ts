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
      // Coverage thresholds - prevent regression
      // Current coverage (2026-01-27): Stmts 39.64%, Branch 33.73%, Funcs 43.4%, Lines 40.29%
      // Phase 1 target: lines 70%, functions 70%, branches 60%, statements 70%
      // Phase 2 target: 80% across all metrics
      // Phase 3 target: 90% across all metrics
      thresholds: {
        lines: 38,
        functions: 40,
        branches: 30,
        statements: 38,
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
