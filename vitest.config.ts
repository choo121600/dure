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
      '.dure/**',
      'node_modules/**',
      'tests/benchmarks/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/types/**',            // Type definitions only, no runtime code
        'src/server/public/**',
        'src/cli/index.ts',        // CLI entry point
        'src/cli/commands/**',
        'src/server/standalone.ts', // Server entry point (manual testing)
        'src/server/index.ts',     // Server bootstrap (covered by E2E)
      ],
      // Coverage thresholds - prevent regression
      // Current coverage (2026-01-27): Stmts 72.1%, Branch 60.48%, Funcs 77.97%, Lines 72.5%
      // Phase 1 target: lines 70%, functions 70%, branches 60%, statements 70% ✅ ACHIEVED
      // Phase 2 target: 80% across all metrics
      // Phase 3 target: 90% across all metrics
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 55,
        statements: 70,
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
