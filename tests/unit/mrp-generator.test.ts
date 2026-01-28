/**
 * Unit tests for MRPGenerator
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { MRPGenerator } from '../../src/core/mrp-generator.js';
import {
  createTempDir,
  cleanupTempDir,
} from '../helpers/test-utils.js';

describe('MRPGenerator', () => {
  let tempDir: string;
  let runDir: string;
  let projectRoot: string;

  beforeEach(() => {
    tempDir = createTempDir('mrp-generator');
    projectRoot = tempDir;
    runDir = join(tempDir, '.dure', 'runs', 'run-20260127120000');

    // Create basic directory structure
    mkdirSync(join(runDir, 'builder', 'output'), { recursive: true });
    mkdirSync(join(runDir, 'verifier', 'tests'), { recursive: true });
    mkdirSync(join(runDir, 'gatekeeper'), { recursive: true });
    mkdirSync(join(runDir, 'briefing'), { recursive: true });
    mkdirSync(join(runDir, 'vcr'), { recursive: true });
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('generate()', () => {
    it('should create MRP directories', () => {
      // Create minimal state.json
      const state = {
        run_id: 'run-20260127120000',
        phase: 'complete',
        iteration: 1,
        max_iterations: 3,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        agents: {
          refiner: { status: 'completed', usage: null },
          builder: { status: 'completed', usage: null },
          verifier: { status: 'completed', usage: null },
          gatekeeper: { status: 'completed', usage: null },
        },
        pending_crp: null,
        errors: [],
        history: [],
      };
      writeFileSync(join(runDir, 'state.json'), JSON.stringify(state), 'utf-8');

      const generator = new MRPGenerator(runDir, projectRoot);
      generator.generate();

      expect(existsSync(join(runDir, 'mrp'))).toBe(true);
      expect(existsSync(join(runDir, 'mrp', 'code'))).toBe(true);
      expect(existsSync(join(runDir, 'mrp', 'tests'))).toBe(true);
    });

    it('should create evidence.json', () => {
      const state = {
        run_id: 'run-20260127120000',
        phase: 'complete',
        iteration: 2,
        max_iterations: 3,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        agents: {
          refiner: { status: 'completed', usage: { input_tokens: 100, output_tokens: 50, cache_creation_tokens: 0, cache_read_tokens: 0, cost_usd: 0.01 } },
          builder: { status: 'completed', usage: { input_tokens: 1000, output_tokens: 500, cache_creation_tokens: 0, cache_read_tokens: 0, cost_usd: 0.1 } },
          verifier: { status: 'completed', usage: null },
          gatekeeper: { status: 'completed', usage: null },
        },
        pending_crp: null,
        errors: [],
        history: [],
      };
      writeFileSync(join(runDir, 'state.json'), JSON.stringify(state), 'utf-8');

      // Create verifier results
      const verifierResults = {
        total: 10,
        passed: 9,
        failed: 1,
        coverage: 85,
      };
      writeFileSync(
        join(runDir, 'verifier', 'results.json'),
        JSON.stringify(verifierResults),
        'utf-8'
      );

      const generator = new MRPGenerator(runDir, projectRoot);
      generator.generate();

      const evidencePath = join(runDir, 'mrp', 'evidence.json');
      expect(existsSync(evidencePath)).toBe(true);

      const evidence = JSON.parse(readFileSync(evidencePath, 'utf-8'));
      expect(evidence.tests.total).toBe(10);
      expect(evidence.tests.passed).toBe(9);
      expect(evidence.tests.coverage).toBe(85);
      expect(evidence.iterations).toBe(2);
    });

    it('should create summary.md', () => {
      const state = {
        run_id: 'run-20260127120000',
        phase: 'complete',
        iteration: 1,
        max_iterations: 3,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        agents: {
          refiner: { status: 'completed', usage: null },
          builder: { status: 'completed', usage: null },
          verifier: { status: 'completed', usage: null },
          gatekeeper: { status: 'completed', usage: null },
        },
        pending_crp: null,
        errors: [],
        history: [],
      };
      writeFileSync(join(runDir, 'state.json'), JSON.stringify(state), 'utf-8');

      const generator = new MRPGenerator(runDir, projectRoot);
      generator.generate();

      const summaryPath = join(runDir, 'mrp', 'summary.md');
      expect(existsSync(summaryPath)).toBe(true);

      const summary = readFileSync(summaryPath, 'utf-8');
      expect(summary).toContain('# Merge-Readiness Pack');
      expect(summary).toContain('run-20260127120000');
    });

    it('should copy changed files from builder output', () => {
      const state = {
        run_id: 'run-20260127120000',
        phase: 'complete',
        iteration: 1,
        max_iterations: 3,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        agents: {
          refiner: { status: 'completed', usage: null },
          builder: { status: 'completed', usage: null },
          verifier: { status: 'completed', usage: null },
          gatekeeper: { status: 'completed', usage: null },
        },
        pending_crp: null,
        errors: [],
        history: [],
      };
      writeFileSync(join(runDir, 'state.json'), JSON.stringify(state), 'utf-8');

      // Create some output files
      const outputFile = join(runDir, 'builder', 'output', 'changed.ts');
      writeFileSync(outputFile, 'export const changed = true;', 'utf-8');

      const generator = new MRPGenerator(runDir, projectRoot);
      generator.generate();

      // File should be copied relative to project root
      // Since output file is within runDir, it should maintain relative structure
    });

    it('should copy test files from verifier', () => {
      const state = {
        run_id: 'run-20260127120000',
        phase: 'complete',
        iteration: 1,
        max_iterations: 3,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        agents: {
          refiner: { status: 'completed', usage: null },
          builder: { status: 'completed', usage: null },
          verifier: { status: 'completed', usage: null },
          gatekeeper: { status: 'completed', usage: null },
        },
        pending_crp: null,
        errors: [],
        history: [],
      };
      writeFileSync(join(runDir, 'state.json'), JSON.stringify(state), 'utf-8');

      // Create test files
      writeFileSync(
        join(runDir, 'verifier', 'tests', 'sample.test.ts'),
        'describe("test", () => { it("works", () => {}); });',
        'utf-8'
      );

      const generator = new MRPGenerator(runDir, projectRoot);
      generator.generate();

      expect(existsSync(join(runDir, 'mrp', 'tests', 'sample.test.ts'))).toBe(true);
    });

    it('should use manifest.json when available', () => {
      const state = {
        run_id: 'run-20260127120000',
        phase: 'complete',
        iteration: 1,
        max_iterations: 3,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        agents: {
          refiner: { status: 'completed', usage: null },
          builder: { status: 'completed', usage: null },
          verifier: { status: 'completed', usage: null },
          gatekeeper: { status: 'completed', usage: null },
        },
        pending_crp: null,
        errors: [],
        history: [],
      };
      writeFileSync(join(runDir, 'state.json'), JSON.stringify(state), 'utf-8');

      // Create manifest
      const manifest = {
        files_created: [],
        files_modified: [],
        files_deleted: [],
      };
      writeFileSync(
        join(runDir, 'builder', 'output', 'manifest.json'),
        JSON.stringify(manifest),
        'utf-8'
      );

      const generator = new MRPGenerator(runDir, projectRoot);
      generator.generate();

      // Should complete without error
      expect(existsSync(join(runDir, 'mrp', 'evidence.json'))).toBe(true);
    });

    it('should include VCR decisions in evidence', () => {
      const state = {
        run_id: 'run-20260127120000',
        phase: 'complete',
        iteration: 1,
        max_iterations: 3,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        agents: {
          refiner: { status: 'completed', usage: null },
          builder: { status: 'completed', usage: null },
          verifier: { status: 'completed', usage: null },
          gatekeeper: { status: 'completed', usage: null },
        },
        pending_crp: null,
        errors: [],
        history: [],
      };
      writeFileSync(join(runDir, 'state.json'), JSON.stringify(state), 'utf-8');

      // Create VCR
      const vcr = {
        vcr_id: 'vcr-001',
        crp_id: 'crp-001',
        created_at: new Date().toISOString(),
        decision: 'option_a',
        rationale: 'This is the best option',
        additional_notes: '',
        applies_to_future: false,
      };
      writeFileSync(
        join(runDir, 'vcr', 'vcr-001.json'),
        JSON.stringify(vcr),
        'utf-8'
      );

      const generator = new MRPGenerator(runDir, projectRoot);
      generator.generate();

      const evidence = JSON.parse(readFileSync(join(runDir, 'mrp', 'evidence.json'), 'utf-8'));
      expect(evidence.decisions).toBeDefined();
      expect(Array.isArray(evidence.decisions)).toBe(true);
    });

    it('should include usage info in evidence', () => {
      const state = {
        run_id: 'run-20260127120000',
        phase: 'complete',
        iteration: 1,
        max_iterations: 3,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        agents: {
          refiner: { status: 'completed', usage: { input_tokens: 100, output_tokens: 50, cache_creation_tokens: 0, cache_read_tokens: 0, cost_usd: 0.01 } },
          builder: { status: 'completed', usage: { input_tokens: 1000, output_tokens: 500, cache_creation_tokens: 0, cache_read_tokens: 0, cost_usd: 0.1 } },
          verifier: { status: 'completed', usage: null },
          gatekeeper: { status: 'completed', usage: null },
        },
        usage: {
          total_input_tokens: 1100,
          total_output_tokens: 550,
          total_cache_creation_tokens: 0,
          total_cache_read_tokens: 0,
          total_cost_usd: 0.11,
        },
        pending_crp: null,
        errors: [],
        history: [],
      };
      writeFileSync(join(runDir, 'state.json'), JSON.stringify(state), 'utf-8');

      const generator = new MRPGenerator(runDir, projectRoot);
      generator.generate();

      const evidence = JSON.parse(readFileSync(join(runDir, 'mrp', 'evidence.json'), 'utf-8'));
      expect(evidence.usage).toBeDefined();
      expect(evidence.usage.by_agent.refiner).toBeDefined();
      expect(evidence.usage.by_agent.builder).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing state.json gracefully', () => {
      const generator = new MRPGenerator(runDir, projectRoot);
      generator.generate();

      // Should create MRP structure even without state
      expect(existsSync(join(runDir, 'mrp'))).toBe(true);
    });

    it('should handle empty builder output', () => {
      const state = {
        run_id: 'run-20260127120000',
        phase: 'complete',
        iteration: 1,
        max_iterations: 3,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        agents: {
          refiner: { status: 'completed', usage: null },
          builder: { status: 'completed', usage: null },
          verifier: { status: 'completed', usage: null },
          gatekeeper: { status: 'completed', usage: null },
        },
        pending_crp: null,
        errors: [],
        history: [],
      };
      writeFileSync(join(runDir, 'state.json'), JSON.stringify(state), 'utf-8');

      const generator = new MRPGenerator(runDir, projectRoot);
      generator.generate();

      expect(existsSync(join(runDir, 'mrp', 'evidence.json'))).toBe(true);
    });

    it('should handle missing verifier tests directory', () => {
      const state = {
        run_id: 'run-20260127120000',
        phase: 'complete',
        iteration: 1,
        max_iterations: 3,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        agents: {
          refiner: { status: 'completed', usage: null },
          builder: { status: 'completed', usage: null },
          verifier: { status: 'completed', usage: null },
          gatekeeper: { status: 'completed', usage: null },
        },
        pending_crp: null,
        errors: [],
        history: [],
      };
      writeFileSync(join(runDir, 'state.json'), JSON.stringify(state), 'utf-8');

      // Remove verifier tests directory
      rmSync(join(runDir, 'verifier', 'tests'), { recursive: true, force: true });

      const generator = new MRPGenerator(runDir, projectRoot);
      generator.generate();

      // Should complete without error
      expect(existsSync(join(runDir, 'mrp', 'evidence.json'))).toBe(true);
    });

    it('should handle invalid manifest.json', () => {
      const state = {
        run_id: 'run-20260127120000',
        phase: 'complete',
        iteration: 1,
        max_iterations: 3,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        agents: {
          refiner: { status: 'completed', usage: null },
          builder: { status: 'completed', usage: null },
          verifier: { status: 'completed', usage: null },
          gatekeeper: { status: 'completed', usage: null },
        },
        pending_crp: null,
        errors: [],
        history: [],
      };
      writeFileSync(join(runDir, 'state.json'), JSON.stringify(state), 'utf-8');

      // Create invalid manifest
      writeFileSync(
        join(runDir, 'builder', 'output', 'manifest.json'),
        'not valid json',
        'utf-8'
      );

      const generator = new MRPGenerator(runDir, projectRoot);
      generator.generate();

      // Should fall back to directory listing
      expect(existsSync(join(runDir, 'mrp', 'evidence.json'))).toBe(true);
    });
  });
});
