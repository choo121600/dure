/**
 * Tests for ContextCompressor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextCompressor } from '../../../src/core/context-compressor.js';
import { isOk, isErr } from '../../../src/types/result.js';
import type { MissionPhase, MissionTask, CarryForward } from '../../../src/types/mission.js';
import type { PhaseId, TaskId, MissionId } from '../../../src/types/branded.js';
import { createMockPhase, createMockTask, createMockCarryForward } from '../../helpers/test-utils.js';

describe('ContextCompressor', () => {
  let compressor: ContextCompressor;

  beforeEach(() => {
    compressor = new ContextCompressor();
  });

  describe('compressPhase', () => {
    it('should merge carry forwards from all tasks', () => {
      const cf1: CarryForward = {
        task_id: 'task-1.1' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: ['Decision A'],
        created_artifacts: ['src/file1.ts'],
        warnings: [],
      };

      const cf2: CarryForward = {
        task_id: 'task-1.2' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: ['Decision B'],
        created_artifacts: ['src/file2.ts'],
        api_contracts: ['POST /api/test'],
        warnings: ['Warning 1'],
      };

      const task1 = createMockTask(1, 1, { status: 'passed', carry_forward: cf1 });
      const task2 = createMockTask(1, 2, { status: 'passed', carry_forward: cf2 });
      const phase = createMockPhase(1, { tasks: [task1, task2] }) as MissionPhase;

      const result = compressor.compressPhase(phase);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.all_decisions).toContain('Decision A');
        expect(result.data.all_decisions).toContain('Decision B');
        expect(result.data.all_artifacts).toHaveLength(2);
        expect(result.data.all_api_contracts).toHaveLength(1);
        expect(result.data.all_warnings).toHaveLength(1);
      }
    });

    it('should deduplicate identical decisions', () => {
      const cf1: CarryForward = {
        task_id: 'task-1.1' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: ['Same decision'],
        created_artifacts: ['src/file1.ts'],
        warnings: [],
      };

      const cf2: CarryForward = {
        task_id: 'task-1.2' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: ['Same decision'],
        created_artifacts: ['src/file2.ts'],
        warnings: [],
      };

      const task1 = createMockTask(1, 1, { status: 'passed', carry_forward: cf1 });
      const task2 = createMockTask(1, 2, { status: 'passed', carry_forward: cf2 });
      const phase = createMockPhase(1, { tasks: [task1, task2] }) as MissionPhase;

      const result = compressor.compressPhase(phase);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.all_decisions).toHaveLength(1);
        expect(result.data.all_decisions[0]).toBe('Same decision');
      }
    });

    it('should deduplicate identical artifacts', () => {
      const cf1: CarryForward = {
        task_id: 'task-1.1' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: [],
        created_artifacts: ['src/shared.ts', 'src/file1.ts'],
        warnings: [],
      };

      const cf2: CarryForward = {
        task_id: 'task-1.2' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: [],
        created_artifacts: ['src/shared.ts', 'src/file2.ts'],
        warnings: [],
      };

      const task1 = createMockTask(1, 1, { status: 'passed', carry_forward: cf1 });
      const task2 = createMockTask(1, 2, { status: 'passed', carry_forward: cf2 });
      const phase = createMockPhase(1, { tasks: [task1, task2] }) as MissionPhase;

      const result = compressor.compressPhase(phase);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.all_artifacts).toHaveLength(3);
        expect(result.data.all_artifacts).toContain('src/shared.ts');
      }
    });

    it('should sort artifacts alphabetically', () => {
      const cf: CarryForward = {
        task_id: 'task-1.1' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: [],
        created_artifacts: ['src/z.ts', 'src/a.ts', 'src/m.ts'],
        warnings: [],
      };

      const task = createMockTask(1, 1, { status: 'passed', carry_forward: cf });
      const phase = createMockPhase(1, { tasks: [task] }) as MissionPhase;

      const result = compressor.compressPhase(phase);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.all_artifacts).toEqual(['src/a.ts', 'src/m.ts', 'src/z.ts']);
      }
    });

    it('should only include tasks with passed status', () => {
      const cf1: CarryForward = {
        task_id: 'task-1.1' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: ['Should include'],
        created_artifacts: [],
        warnings: [],
      };

      const cf2: CarryForward = {
        task_id: 'task-1.2' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: ['Should not include'],
        created_artifacts: [],
        warnings: [],
      };

      const task1 = createMockTask(1, 1, { status: 'passed', carry_forward: cf1 });
      const task2 = createMockTask(1, 2, { status: 'failed', carry_forward: cf2 });
      const phase = createMockPhase(1, { tasks: [task1, task2] }) as MissionPhase;

      const result = compressor.compressPhase(phase);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.all_decisions).toHaveLength(1);
        expect(result.data.all_decisions[0]).toBe('Should include');
      }
    });

    it('should return empty context for phases with no carry-forward data', () => {
      const task1 = createMockTask(1, 1, { status: 'passed' });
      const task2 = createMockTask(1, 2, { status: 'passed' });
      const phase = createMockPhase(1, { tasks: [task1, task2] }) as MissionPhase;

      const result = compressor.compressPhase(phase);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.all_decisions).toHaveLength(0);
        expect(result.data.all_artifacts).toHaveLength(0);
        expect(result.data.next_phase_context).toBe('No context from previous phase.');
      }
    });

    it('should truncate long context', () => {
      const shortCompressor = new ContextCompressor({ maxContextLength: 200 });

      // Create many unique decisions to ensure they don't get deduplicated
      const decisions = Array(50).fill(0).map((_, i) =>
        `Very long decision text number ${i} that repeats many times`
      );

      const cf: CarryForward = {
        task_id: 'task-1.1' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: decisions,
        created_artifacts: [],
        warnings: [],
      };

      const task = createMockTask(1, 1, { status: 'passed', carry_forward: cf });
      const phase = createMockPhase(1, { tasks: [task] }) as MissionPhase;

      const result = shortCompressor.compressPhase(phase);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.next_phase_context.length).toBeLessThanOrEqual(200);
        expect(result.data.next_phase_context).toContain('truncated');
      }
    });

    it('should generate proper summary', () => {
      const cf: CarryForward = {
        task_id: 'task-1.1' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: ['Decision'],
        created_artifacts: [],
        warnings: [],
      };

      const task1 = createMockTask(1, 1, { status: 'passed', carry_forward: cf });
      const task2 = createMockTask(1, 2, { status: 'failed' });
      const phase = createMockPhase(1, {
        title: 'Test Phase',
        tasks: [task1, task2],
      }) as MissionPhase;

      const result = compressor.compressPhase(phase);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.summary).toContain('Phase 1');
        expect(result.data.summary).toContain('Test Phase');
        expect(result.data.summary).toContain('1/2');
      }
    });
  });

  describe('groupArtifactsByDirectory', () => {
    it('should group files by directory', () => {
      const artifacts = [
        'src/auth/jwt.ts',
        'src/auth/middleware.ts',
        'src/models/user.ts',
        'index.ts',
      ];

      const grouped = compressor.groupArtifactsByDirectory(artifacts);

      expect(grouped['src/auth']).toHaveLength(2);
      expect(grouped['src/models']).toHaveLength(1);
      expect(grouped['.']).toHaveLength(1);
    });

    it('should handle nested directories', () => {
      const artifacts = [
        'src/core/auth/handlers/login.ts',
        'src/core/auth/handlers/logout.ts',
        'src/core/auth/middleware.ts',
      ];

      const grouped = compressor.groupArtifactsByDirectory(artifacts);

      expect(grouped['src/core/auth/handlers']).toHaveLength(2);
      expect(grouped['src/core/auth']).toHaveLength(1);
    });
  });

  describe('long list summarization', () => {
    it('should group artifacts when list is long', () => {
      const cf: CarryForward = {
        task_id: 'task-1.1' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: [],
        created_artifacts: [
          'src/auth/file1.ts',
          'src/auth/file2.ts',
          'src/auth/file3.ts',
          'src/auth/file4.ts',
          'src/auth/file5.ts',
          'src/models/file1.ts',
          'src/models/file2.ts',
          'src/models/file3.ts',
          'src/models/file4.ts',
          'src/models/file5.ts',
          'src/utils/file1.ts',
        ],
        warnings: [],
      };

      const task = createMockTask(1, 1, { status: 'passed', carry_forward: cf });
      const phase = createMockPhase(1, { tasks: [task] }) as MissionPhase;

      const result = compressor.compressPhase(phase);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Should contain grouped summary like "src/auth/ (5 files)"
        expect(result.data.next_phase_context).toContain('src/auth/ (5 files)');
        expect(result.data.next_phase_context).toContain('src/models/ (5 files)');
      }
    });

    it('should not group when disabled', () => {
      const compressorNoGroup = new ContextCompressor({ summarizeLongLists: false });

      const cf: CarryForward = {
        task_id: 'task-1.1' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: [],
        created_artifacts: Array(15).fill(0).map((_, i) => `src/file${i}.ts`),
        warnings: [],
      };

      const task = createMockTask(1, 1, { status: 'passed', carry_forward: cf });
      const phase = createMockPhase(1, { tasks: [task] }) as MissionPhase;

      const result = compressorNoGroup.compressPhase(phase);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Should list individual files
        expect(result.data.next_phase_context).toContain('src/file0.ts');
        expect(result.data.next_phase_context).toContain('src/file14.ts');
        expect(result.data.next_phase_context).not.toContain('files)');
      }
    });
  });

  describe('context structure', () => {
    it('should include all sections in next_phase_context', () => {
      const cf: CarryForward = {
        task_id: 'task-1.1' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: ['Use JWT'],
        created_artifacts: ['src/auth.ts'],
        api_contracts: ['POST /auth/login'],
        warnings: ['Rate limiting needed'],
      };

      const task = createMockTask(1, 1, { status: 'passed', carry_forward: cf });
      const phase = createMockPhase(1, { tasks: [task] }) as MissionPhase;

      const result = compressor.compressPhase(phase);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const ctx = result.data.next_phase_context;
        expect(ctx).toContain('## Key Decisions Made');
        expect(ctx).toContain('Use JWT');
        expect(ctx).toContain('## Created Artifacts');
        expect(ctx).toContain('src/auth.ts');
        expect(ctx).toContain('## API Contracts Defined');
        expect(ctx).toContain('POST /auth/login');
        expect(ctx).toContain('## Warnings for Next Phase');
        expect(ctx).toContain('Rate limiting needed');
      }
    });

    it('should omit empty sections', () => {
      const cf: CarryForward = {
        task_id: 'task-1.1' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: ['Use JWT'],
        created_artifacts: [],
        warnings: [],
      };

      const task = createMockTask(1, 1, { status: 'passed', carry_forward: cf });
      const phase = createMockPhase(1, { tasks: [task] }) as MissionPhase;

      const result = compressor.compressPhase(phase);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const ctx = result.data.next_phase_context;
        expect(ctx).toContain('## Key Decisions Made');
        expect(ctx).not.toContain('## Created Artifacts');
        expect(ctx).not.toContain('## API Contracts Defined');
        expect(ctx).not.toContain('## Warnings for Next Phase');
      }
    });
  });
});
