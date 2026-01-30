/**
 * Unit tests for PlanningPipeline
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PlanningPipeline, DEFAULT_PLANNING_CONFIG } from '../../../src/core/planning-pipeline.js';
import type { Critique, PlanDraft } from '../../../src/types/mission.js';
import { unsafeCreateMissionId } from '../../../src/types/branded.js';
import { isOk, isErr } from '../../../src/types/result.js';
import { PlanningError } from '../../../src/types/errors.js';

describe('PlanningPipeline', () => {
  let pipeline: PlanningPipeline;
  const missionId = unsafeCreateMissionId('mission-test-001');
  const projectRoot = '/test/project';
  const missionDir = '/test/project/.dure/missions/mission-test-001';

  beforeEach(() => {
    pipeline = new PlanningPipeline(missionId, projectRoot, missionDir);
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      expect(pipeline).toBeDefined();
    });

    it('should accept custom config', () => {
      const customPipeline = new PlanningPipeline(
        missionId,
        projectRoot,
        missionDir,
        { maxIterations: 3 }
      );
      expect(customPipeline).toBeDefined();
    });
  });

  describe('shouldAutoApprove', () => {
    it('should approve when within threshold', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test critique',
        items: [],
        stats: { critical: 0, major: 0, minor: 2, suggestion: 5 },
        rationale: 'Test rationale',
      };

      // Access private method through type assertion
      const shouldApprove = (pipeline as any).shouldAutoApprove(critique);
      expect(shouldApprove).toBe(true);
    });

    it('should not approve when exceeds threshold', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test critique',
        items: [],
        stats: { critical: 0, major: 1, minor: 0, suggestion: 0 },
        rationale: 'Test rationale',
      };

      const shouldApprove = (pipeline as any).shouldAutoApprove(critique);
      expect(shouldApprove).toBe(false);
    });

    it('should not approve with critical issues', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test critique',
        items: [],
        stats: { critical: 1, major: 0, minor: 0, suggestion: 0 },
        rationale: 'Test rationale',
      };

      const shouldApprove = (pipeline as any).shouldAutoApprove(critique);
      expect(shouldApprove).toBe(false);
    });
  });

  describe('calculateOverlap', () => {
    it('should calculate overlap correctly', () => {
      const prev: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test',
        items: [
          {
            id: 'critique-001',
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase', id: 'phase-1' },
            title: 'Missing task',
            description: 'Task is missing',
          },
          {
            id: 'critique-002',
            severity: 'minor',
            category: 'scope_issue',
            target: { type: 'task', id: 'task-1.1' },
            title: 'Scope issue',
            description: 'Task scope unclear',
          },
        ],
        stats: { critical: 0, major: 1, minor: 1, suggestion: 0 },
        rationale: 'Test',
      };

      const curr: Critique = {
        version: 2,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test',
        items: [
          {
            id: 'critique-003',
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase', id: 'phase-1' },
            title: 'Missing task',
            description: 'Task is still missing',
          },
        ],
        stats: { critical: 0, major: 1, minor: 0, suggestion: 0 },
        rationale: 'Test',
      };

      const overlap = (pipeline as any).calculateOverlap(prev, curr);
      expect(overlap).toBe(0.5); // 1 out of 2 items overlap
    });

    it('should return 0 when previous has no items', () => {
      const prev: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'approved',
        summary: 'Test',
        items: [],
        stats: { critical: 0, major: 0, minor: 0, suggestion: 0 },
        rationale: 'Test',
      };

      const curr: Critique = {
        version: 2,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test',
        items: [
          {
            id: 'critique-001',
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase', id: 'phase-1' },
            title: 'Missing task',
            description: 'Task is missing',
          },
        ],
        stats: { critical: 0, major: 1, minor: 0, suggestion: 0 },
        rationale: 'Test',
      };

      const overlap = (pipeline as any).calculateOverlap(prev, curr);
      expect(overlap).toBe(0);
    });
  });

  describe('isConvergenceFailed', () => {
    it('should detect convergence failure when overlap > threshold', () => {
      const critiques: Critique[] = [
        {
          version: 1,
          created_at: new Date().toISOString(),
          verdict: 'needs_revision',
          summary: 'Test',
          items: [
            {
              id: 'critique-001',
              severity: 'major',
              category: 'missing_task',
              target: { type: 'phase', id: 'phase-1' },
              title: 'Missing task',
              description: 'Task is missing',
            },
          ],
          stats: { critical: 0, major: 1, minor: 0, suggestion: 0 },
          rationale: 'Test',
        },
        {
          version: 2,
          created_at: new Date().toISOString(),
          verdict: 'needs_revision',
          summary: 'Test',
          items: [
            {
              id: 'critique-002',
              severity: 'major',
              category: 'missing_task',
              target: { type: 'phase', id: 'phase-1' },
              title: 'Missing task',
              description: 'Task is still missing',
            },
          ],
          stats: { critical: 0, major: 1, minor: 0, suggestion: 0 },
          rationale: 'Test',
        },
      ];

      const failed = (pipeline as any).isConvergenceFailed(critiques);
      expect(failed).toBe(true); // 100% overlap > 70% threshold
    });

    it('should not flag when issues are different', () => {
      const critiques: Critique[] = [
        {
          version: 1,
          created_at: new Date().toISOString(),
          verdict: 'needs_revision',
          summary: 'Test',
          items: [
            {
              id: 'critique-001',
              severity: 'major',
              category: 'missing_task',
              target: { type: 'phase', id: 'phase-1' },
              title: 'Missing task',
              description: 'Task is missing',
            },
          ],
          stats: { critical: 0, major: 1, minor: 0, suggestion: 0 },
          rationale: 'Test',
        },
        {
          version: 2,
          created_at: new Date().toISOString(),
          verdict: 'needs_revision',
          summary: 'Test',
          items: [
            {
              id: 'critique-002',
              severity: 'major',
              category: 'scope_issue',
              target: { type: 'task', id: 'task-1.1' },
              title: 'Scope issue',
              description: 'Task scope unclear',
            },
          ],
          stats: { critical: 0, major: 1, minor: 0, suggestion: 0 },
          rationale: 'Test',
        },
      ];

      const failed = (pipeline as any).isConvergenceFailed(critiques);
      expect(failed).toBe(false); // 0% overlap < 70% threshold
    });

    it('should return false with less than 2 critiques', () => {
      const critiques: Critique[] = [
        {
          version: 1,
          created_at: new Date().toISOString(),
          verdict: 'needs_revision',
          summary: 'Test',
          items: [],
          stats: { critical: 0, major: 0, minor: 0, suggestion: 0 },
          rationale: 'Test',
        },
      ];

      const failed = (pipeline as any).isConvergenceFailed(critiques);
      expect(failed).toBe(false);
    });
  });

  describe('formatRevisionInstructions', () => {
    it('should format critique items as instructions', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test',
        items: [
          {
            id: 'critique-001',
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase', id: 'phase-2' },
            title: 'Missing error handling',
            description: 'No error handling task',
            suggestion: 'Add error handling task',
          },
        ],
        stats: { critical: 0, major: 1, minor: 0, suggestion: 0 },
        rationale: 'Test',
      };

      const instructions = (pipeline as any).formatRevisionInstructions(critique);

      expect(instructions).toContain('critique-001');
      expect(instructions).toContain('Missing error handling');
      expect(instructions).toContain('Add error handling task');
    });

    it('should only include critical and major items', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test',
        items: [
          {
            id: 'critique-001',
            severity: 'critical',
            category: 'missing_task',
            target: { type: 'phase', id: 'phase-1' },
            title: 'Critical issue',
            description: 'Critical problem',
          },
          {
            id: 'critique-002',
            severity: 'minor',
            category: 'scope_issue',
            target: { type: 'task', id: 'task-1.1' },
            title: 'Minor issue',
            description: 'Minor problem',
          },
        ],
        stats: { critical: 1, major: 0, minor: 1, suggestion: 0 },
        rationale: 'Test',
      };

      const instructions = (pipeline as any).formatRevisionInstructions(critique);

      expect(instructions).toContain('critique-001');
      expect(instructions).not.toContain('critique-002');
      expect(instructions).toContain('1 minor/suggestion items omitted');
    });
  });

  describe('substituteVariables', () => {
    it('should replace template variables', () => {
      const template = 'Hello {name}, your age is {age}';
      const variables = { name: 'Alice', age: '30' };

      const result = (pipeline as any).substituteVariables(template, variables);
      expect(result).toBe('Hello Alice, your age is 30');
    });

    it('should handle multiple occurrences', () => {
      const template = '{key} appears {key} times';
      const variables = { key: 'test' };

      const result = (pipeline as any).substituteVariables(template, variables);
      expect(result).toBe('test appears test times');
    });

    it('should handle empty variables', () => {
      const template = 'No variables here';
      const variables = {};

      const result = (pipeline as any).substituteVariables(template, variables);
      expect(result).toBe('No variables here');
    });

    it('should handle undefined variable values', () => {
      const template = 'Value is {missing}';
      const variables = { other: 'value' };

      const result = (pipeline as any).substituteVariables(template, variables);
      expect(result).toBe('Value is {missing}');
    });

    it('should handle special regex characters in values', () => {
      const template = 'Pattern: {pattern}';
      const variables = { pattern: '.*+?[]{}()^$|\\' };

      const result = (pipeline as any).substituteVariables(template, variables);
      expect(result).toContain('.*+?[]{}()^$|\\');
    });

    it('should preserve escaped braces', () => {
      const template = 'Use \\{literal\\} braces';
      const variables = { literal: 'test' };

      const result = (pipeline as any).substituteVariables(template, variables);
      // Escaped braces remain as-is since substituteVariables only replaces {key} patterns
      expect(result).toContain('\\{literal\\}');
    });
  });

  describe('auto-approve threshold edge cases', () => {
    it('should approve at exact minor threshold', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test critique',
        items: [],
        stats: { critical: 0, major: 0, minor: 3, suggestion: 100 },
        rationale: 'Test rationale',
      };

      const shouldApprove = (pipeline as any).shouldAutoApprove(critique);
      expect(shouldApprove).toBe(true);
    });

    it('should not approve just above minor threshold', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test critique',
        items: [],
        stats: { critical: 0, major: 0, minor: 4, suggestion: 100 },
        rationale: 'Test rationale',
      };

      const shouldApprove = (pipeline as any).shouldAutoApprove(critique);
      expect(shouldApprove).toBe(false);
    });

    it('should approve with no issues at all', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'approved',
        summary: 'Test critique',
        items: [],
        stats: { critical: 0, major: 0, minor: 0, suggestion: 0 },
        rationale: 'Test rationale',
      };

      const shouldApprove = (pipeline as any).shouldAutoApprove(critique);
      expect(shouldApprove).toBe(true);
    });

    it('should use custom threshold config', () => {
      const customPipeline = new PlanningPipeline(
        missionId,
        projectRoot,
        missionDir,
        { autoApproveThreshold: { critical: 1, major: 2, minor: 5 } }
      );

      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test critique',
        items: [],
        stats: { critical: 1, major: 2, minor: 5, suggestion: 0 },
        rationale: 'Test rationale',
      };

      const shouldApprove = (customPipeline as any).shouldAutoApprove(critique);
      expect(shouldApprove).toBe(true);
    });
  });

  describe('overlap calculation edge cases', () => {
    it('should handle identical overlapping items', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test',
        items: [
          {
            id: 'critique-001',
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase', id: 'phase-1' },
            title: 'Missing task',
            description: 'Task is missing',
          },
          {
            id: 'critique-002',
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase', id: 'phase-2' },
            title: 'Missing task',
            description: 'Task is missing',
          },
        ],
        stats: { critical: 0, major: 2, minor: 0, suggestion: 0 },
        rationale: 'Test',
      };

      const overlap = (pipeline as any).calculateOverlap(critique, critique);
      expect(overlap).toBe(1); // 100% self-overlap
    });

    it('should handle partial overlap scenarios', () => {
      const prev: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test',
        items: [
          {
            id: 'critique-001',
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase', id: 'phase-1' },
            title: 'Missing task',
            description: 'Task is missing',
          },
          {
            id: 'critique-002',
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase', id: 'phase-2' },
            title: 'Missing task',
            description: 'Task is missing',
          },
          {
            id: 'critique-003',
            severity: 'major',
            category: 'scope_issue',
            target: { type: 'task', id: 'task-1.1' },
            title: 'Scope issue',
            description: 'Scope unclear',
          },
        ],
        stats: { critical: 0, major: 3, minor: 0, suggestion: 0 },
        rationale: 'Test',
      };

      const curr: Critique = {
        version: 2,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test',
        items: [
          {
            id: 'critique-001b',
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase', id: 'phase-1' },
            title: 'Missing task',
            description: 'Task is still missing',
          },
          {
            id: 'critique-004',
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase', id: 'phase-3' },
            title: 'Missing task',
            description: 'New missing task',
          },
        ],
        stats: { critical: 0, major: 2, minor: 0, suggestion: 0 },
        rationale: 'Test',
      };

      // 1 overlap out of 3 prev items = 33.3%
      const overlap = (pipeline as any).calculateOverlap(prev, curr);
      expect(overlap).toBeCloseTo(1 / 3, 2);
    });

    it('should use convergence threshold correctly', () => {
      const critiques: Critique[] = [
        {
          version: 1,
          created_at: new Date().toISOString(),
          verdict: 'needs_revision',
          summary: 'Test',
          items: Array.from({ length: 10 }, (_, i) => ({
            id: `critique-${i}`,
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase', id: `phase-${i}` },
            title: `Task ${i}`,
            description: `Missing task ${i}`,
          })),
          stats: { critical: 0, major: 10, minor: 0, suggestion: 0 },
          rationale: 'Test',
        },
        {
          version: 2,
          created_at: new Date().toISOString(),
          verdict: 'needs_revision',
          summary: 'Test',
          items: Array.from({ length: 8 }, (_, i) => ({
            id: `critique-${i}b`,
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase', id: `phase-${i}` },
            title: `Task ${i}`,
            description: `Still missing task ${i}`,
          })),
          stats: { critical: 0, major: 8, minor: 0, suggestion: 0 },
          rationale: 'Test',
        },
      ];

      // 8/10 = 80% overlap > 70% threshold = convergence failed
      const failed = (pipeline as any).isConvergenceFailed(critiques);
      expect(failed).toBe(true);
    });
  });

  describe('formatRevisionInstructions edge cases', () => {
    it('should handle empty critique items', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'approved',
        summary: 'Test',
        items: [],
        stats: { critical: 0, major: 0, minor: 0, suggestion: 0 },
        rationale: 'Test',
      };

      const instructions = (pipeline as any).formatRevisionInstructions(critique);
      expect(instructions).toContain('Revision Required');
      expect(instructions).toContain('0 feedback items');
    });

    it('should handle critique with only suggestions', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test',
        items: [
          {
            id: 'critique-001',
            severity: 'suggestion',
            category: 'scope_issue',
            target: { type: 'task', id: 'task-1.1' },
            title: 'Minor suggestion',
            description: 'Consider improving',
          },
        ],
        stats: { critical: 0, major: 0, minor: 0, suggestion: 1 },
        rationale: 'Test',
      };

      const instructions = (pipeline as any).formatRevisionInstructions(critique);
      expect(instructions).toContain('Revision Required');
      expect(instructions).toContain('1 minor/suggestion items omitted');
      expect(instructions).not.toContain('critique-001');
    });

    it('should handle critique with mixed severity levels', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test',
        items: [
          {
            id: 'critical-001',
            severity: 'critical',
            category: 'missing_task',
            target: { type: 'phase', id: 'phase-1' },
            title: 'Critical issue',
            description: 'Must fix',
            suggestion: 'Add critical task',
          },
          {
            id: 'major-001',
            severity: 'major',
            category: 'scope_issue',
            target: { type: 'task', id: 'task-1.1' },
            title: 'Major issue',
            description: 'Should fix',
            suggestion: 'Clarify scope',
          },
          {
            id: 'minor-001',
            severity: 'minor',
            category: 'sequence_issue',
            target: { type: 'task', id: 'task-1.2' },
            title: 'Minor issue',
            description: 'Could fix',
          },
        ],
        stats: { critical: 1, major: 1, minor: 1, suggestion: 0 },
        rationale: 'Test',
      };

      const instructions = (pipeline as any).formatRevisionInstructions(critique);
      expect(instructions).toContain('critical-001');
      expect(instructions).toContain('major-001');
      expect(instructions).not.toContain('minor-001');
      expect(instructions).toContain('1 minor/suggestion items omitted');
    });

    it('should handle critique items without suggestions', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test',
        items: [
          {
            id: 'critique-001',
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase', id: 'phase-1' },
            title: 'Missing task',
            description: 'No suggestion provided',
          },
        ],
        stats: { critical: 0, major: 1, minor: 0, suggestion: 0 },
        rationale: 'Test',
      };

      const instructions = (pipeline as any).formatRevisionInstructions(critique);
      expect(instructions).toContain('critique-001');
      expect(instructions).toContain('Missing task');
      expect(instructions).not.toContain('Suggestion:');
    });

    it('should handle critique items without target id', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test',
        items: [
          {
            id: 'critique-001',
            severity: 'major',
            category: 'structure_issue',
            target: { type: 'global' },
            title: 'Global issue',
            description: 'Affects entire plan',
          },
        ],
        stats: { critical: 0, major: 1, minor: 0, suggestion: 0 },
        rationale: 'Test',
      };

      const instructions = (pipeline as any).formatRevisionInstructions(critique);
      // formatRevisionInstructions outputs markdown format with bold labels
      expect(instructions).toContain('**Target**: global');
      expect(instructions).not.toContain('(undefined)');
    });
  });

  describe('loadState', () => {
    it('should return null when state file does not exist', async () => {
      const result = await pipeline.loadState();
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toBeNull();
      }
    });
  });

  describe('configuration and initialization', () => {
    it('should merge custom config with defaults', () => {
      const customConfig = {
        maxIterations: 5,
        convergenceThreshold: 0.5,
      };

      const customPipeline = new PlanningPipeline(
        missionId,
        projectRoot,
        missionDir,
        customConfig
      );

      // Verify config was merged (plannerModel should still be default)
      expect((customPipeline as any).config.maxIterations).toBe(5);
      expect((customPipeline as any).config.convergenceThreshold).toBe(0.5);
      expect((customPipeline as any).config.plannerModel).toBe('sonnet');
    });

    it('should set correct default config values', () => {
      expect(DEFAULT_PLANNING_CONFIG.maxIterations).toBe(2);
      expect(DEFAULT_PLANNING_CONFIG.plannerModel).toBe('sonnet');
      expect(DEFAULT_PLANNING_CONFIG.criticModel).toBe('sonnet');
      expect(DEFAULT_PLANNING_CONFIG.convergenceThreshold).toBe(0.7);
      expect(DEFAULT_PLANNING_CONFIG.autoApproveThreshold.critical).toBe(0);
      expect(DEFAULT_PLANNING_CONFIG.autoApproveThreshold.major).toBe(0);
      expect(DEFAULT_PLANNING_CONFIG.autoApproveThreshold.minor).toBe(3);
    });
  });

  describe('EventEmitter integration', () => {
    it('should be an EventEmitter instance', () => {
      expect(pipeline).toHaveProperty('on');
      expect(pipeline).toHaveProperty('emit');
      expect(typeof pipeline.on).toBe('function');
      expect(typeof pipeline.emit).toBe('function');
    });

    it('should register event listeners', () => {
      const listener = vi.fn();
      pipeline.on('test-event', listener);
      pipeline.emit('test-event', { data: 'test' });
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('adversarial test: boundary condition attacks', () => {
    it('should handle extremely long template strings', () => {
      const longString = 'x'.repeat(10000);
      const template = `Start {var} End`;
      const variables = { var: longString };

      const result = (pipeline as any).substituteVariables(template, variables);
      expect(result.length).toBeGreaterThan(10000);
    });

    it('should handle critique with many items', () => {
      const manyItems = Array.from({ length: 1000 }, (_, i) => ({
        id: `critique-${i}`,
        severity: i % 2 === 0 ? ('major' as const) : ('minor' as const),
        category: 'missing_task' as const,
        target: { type: 'phase' as const, id: `phase-${i}` },
        title: `Task ${i}`,
        description: `Missing task ${i}`,
      }));

      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Large critique',
        items: manyItems,
        stats: { critical: 0, major: 500, minor: 500, suggestion: 0 },
        rationale: 'Test',
      };

      const instructions = (pipeline as any).formatRevisionInstructions(critique);
      expect(instructions).toBeDefined();
      expect(instructions.length).toBeGreaterThan(0);
    });

    it('should handle null/undefined in critique items', () => {
      const critique: Critique = {
        version: 1,
        created_at: new Date().toISOString(),
        verdict: 'needs_revision',
        summary: 'Test',
        items: [
          {
            id: 'critique-001',
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase' },
            title: 'Missing task',
            description: 'No description provided',
            // suggestion is undefined
          },
        ],
        stats: { critical: 0, major: 1, minor: 0, suggestion: 0 },
        rationale: 'Test',
      };

      const instructions = (pipeline as any).formatRevisionInstructions(critique);
      expect(instructions).toContain('critique-001');
      // Should not crash when suggestion is undefined
    });

    it('should handle regex special characters in variables', () => {
      const variables = {
        pattern: '[a-z]+',
        replacement: '$1.$2',
        path: 'C:\\Users\\test\\file',
      };

      const template =
        'Pattern: {pattern}, Replacement: {replacement}, Path: {path}';
      const result = (pipeline as any).substituteVariables(template, variables);

      expect(result).toContain('[a-z]+');
      expect(result).toContain('$1.$2');
      expect(result).toContain('C:\\Users\\test\\file');
    });

    it('should detect convergence with floating point precision', () => {
      const critiques: Critique[] = [
        {
          version: 1,
          created_at: new Date().toISOString(),
          verdict: 'needs_revision',
          summary: 'Test',
          items: Array.from({ length: 100 }, (_, i) => ({
            id: `critique-${i}`,
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase', id: `phase-${i}` },
            title: `Task ${i}`,
            description: `Missing task ${i}`,
          })),
          stats: { critical: 0, major: 100, minor: 0, suggestion: 0 },
          rationale: 'Test',
        },
        {
          version: 2,
          created_at: new Date().toISOString(),
          verdict: 'needs_revision',
          summary: 'Test',
          items: Array.from({ length: 72 }, (_, i) => ({
            id: `critique-${i}b`,
            severity: 'major',
            category: 'missing_task',
            target: { type: 'phase', id: `phase-${i}` },
            title: `Task ${i}`,
            description: `Still missing task ${i}`,
          })),
          stats: { critical: 0, major: 72, minor: 0, suggestion: 0 },
          rationale: 'Test',
        },
      ];

      // 72/100 = 0.72 > 0.7 threshold
      const failed = (pipeline as any).isConvergenceFailed(critiques);
      expect(failed).toBe(true);
    });
  });

  describe('error handling for missing methods', () => {
    it('should have all required private methods accessible for testing', () => {
      expect(typeof (pipeline as any).shouldAutoApprove).toBe('function');
      expect(typeof (pipeline as any).calculateOverlap).toBe('function');
      expect(typeof (pipeline as any).isConvergenceFailed).toBe('function');
      expect(typeof (pipeline as any).formatRevisionInstructions).toBe(
        'function'
      );
      expect(typeof (pipeline as any).substituteVariables).toBe('function');
    });
  });
});
