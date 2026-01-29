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
    // Memory optimization: limit concurrent workers (Vitest 4 top-level options)
    pool: 'threads',
    maxWorkers: 2,
    // Reduce output verbosity to minimize context accumulation
    reporters: ['default'],
    // Disable watch mode output noise
    outputFile: undefined,
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

        // TUI - blessed-based terminal UI, low unit test ROI
        // Depends on terminal rendering, verify with E2E or manual testing
        'src/tui/**',

        // Infrastructure code - config/constants without logic, or code that is primarily mocked
        'src/config/constants.ts',
        'src/config/constants/**',
        'src/utils/logger.ts',
        'src/utils/metrics.ts',

        // CLI glue code - only registers Commander.js commands
        'src/cli/program.ts',
      ],
      // Coverage thresholds - prevent regression
      // Excluded files: TUI screens (blessed), infrastructure (logger, metrics, constants), CLI glue code
      // Focus: Core orchestration logic should maintain high coverage
      // Phase 1 target: lines 70%, functions 70%, branches 55%, statements 70%
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
