/**
 * Unit tests for MissionManager execution methods (runPhase, runTask)
 *
 * Note: These tests focus on error handling and state management.
 * The actual task execution logic requires real Orchestrator integration
 * which is covered in integration tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { MissionManager } from '../../../src/core/mission-manager.js';
import { MissionError, ErrorCodes } from '../../../src/types/errors.js';
import { isOk, isErr } from '../../../src/types/result.js';
import type { MissionId, TaskId } from '../../../src/types/branded.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockMission,
  createMockPhase,
  createMockTask,
} from '../../helpers/test-utils.js';

// Mock PlanningPipeline to avoid actual agent execution
vi.mock('../../../src/core/planning-pipeline.js', () => ({
  PlanningPipeline: class MockPlanningPipeline {
    execute = vi.fn();
  },
}));

// Mock Orchestrator to avoid actual run execution
vi.mock('../../../src/core/orchestrator.js', () => ({
  Orchestrator: class MockOrchestrator {
    startRun = vi.fn().mockResolvedValue('run-mock-123');
  },
}));

// Mock ConfigManager to avoid file system access
vi.mock('../../../src/config/config-manager.js', () => ({
  ConfigManager: class MockConfigManager {
    loadConfig = vi.fn().mockReturnValue({});
  },
}));

describe('MissionManager - Execution Methods', () => {
  let tempDir: string;
  let manager: MissionManager;
  let waitForRunCompletionSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = createTempDir('mission-manager-run-test');
    manager = new MissionManager(tempDir);

    // Mock the private waitForRunCompletion method to return immediately
    // This prevents tests from timing out waiting for run completion
    waitForRunCompletionSpy = vi.spyOn(
      manager as any,
      'waitForRunCompletion'
    ).mockResolvedValue({
      verdict: 'PASS',
      carry_forward: {
        task_id: 'task-1.1' as TaskId,
        created_at: new Date().toISOString(),
        key_decisions: ['Test decision'],
        created_artifacts: ['test-artifact.ts'],
        warnings: [],
      },
    });
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    waitForRunCompletionSpy?.mockRestore();
  });

  // ============================================
  // runPhase Tests - Error Handling
  // ============================================

  describe('runPhase - Error Handling', () => {
    it('should return error when mission not found', async () => {
      const result = await manager.runPhase('mission-99999999999999' as MissionId, 1);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(MissionError);
        expect(result.error.code).toBe(ErrorCodes.MISSION_NOT_FOUND);
        expect(result.error.message).toContain('Mission not found');
      }
    });

    it('should return error when phase not found', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [createMockPhase(1)],
      });

      await setupMission(tempDir, mission);

      const result = await manager.runPhase(mission.mission_id, 99);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCodes.MISSION_PHASE_NOT_FOUND);
        expect(result.error.message).toContain('Phase 99 not found');
      }
    });

    it('should return error when previous phase not completed', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [
          createMockPhase(1, { status: 'pending' }),
          createMockPhase(2, { status: 'pending' }),
        ],
      });

      await setupMission(tempDir, mission);

      const result = await manager.runPhase(mission.mission_id, 2);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCodes.MISSION_PHASE_NOT_READY);
        expect(result.error.message).toContain('Previous phase (1) not completed');
      }
    });

    it('should allow running phase 1 without previous phase check', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [
          createMockPhase(1, {
            tasks: [createMockTask(1, 1)],
          }),
        ],
      });

      await setupMission(tempDir, mission);
      await setupTaskBriefings(tempDir, mission);

      // This will fail at execution level (no orchestrator), but should pass dependency check
      const result = await manager.runPhase(mission.mission_id, 1);

      // Either success (if mocked properly) or execution failure (not dependency error)
      if (isErr(result)) {
        expect(result.error.code).not.toBe(ErrorCodes.MISSION_PHASE_NOT_READY);
      }
    });

    it('should update phase status to in_progress when starting', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [
          createMockPhase(1, {
            status: 'pending',
            tasks: [createMockTask(1, 1)],
          }),
        ],
      });

      await setupMission(tempDir, mission);
      await setupTaskBriefings(tempDir, mission);

      // Start the phase (will fail at execution, but status should update)
      await manager.runPhase(mission.mission_id, 1);

      // Check that phase status was updated to in_progress
      const updatedMission = await manager.getMission(mission.mission_id);
      if (isOk(updatedMission)) {
        const phase = updatedMission.data.phases[0];
        // Status should have changed from pending (either in_progress or failed)
        expect(phase.status).not.toBe('pending');
        expect(phase.started_at).toBeDefined();
      }
    });

    it('should update mission status to in_progress when phase starts', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
        phases: [
          createMockPhase(1, {
            tasks: [createMockTask(1, 1)],
          }),
        ],
      });

      await setupMission(tempDir, mission);
      await setupTaskBriefings(tempDir, mission);

      await manager.runPhase(mission.mission_id, 1);

      const updatedMission = await manager.getMission(mission.mission_id);
      if (isOk(updatedMission)) {
        // Mission status should change from ready (could be in_progress, failed, or completed with mock)
        expect(['in_progress', 'failed', 'completed']).toContain(updatedMission.data.status);
      }
    });
  });

  // ============================================
  // runTask Tests - Error Handling
  // ============================================

  describe('runTask - Error Handling', () => {
    it('should return error when mission not found', async () => {
      const result = await manager.runTask(
        'mission-99999999999999' as MissionId,
        'task-1.1' as TaskId
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(MissionError);
        expect(result.error.code).toBe(ErrorCodes.MISSION_NOT_FOUND);
      }
    });

    it('should return error when task not found in mission', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [
          createMockPhase(1, {
            tasks: [createMockTask(1, 1)],
          }),
        ],
      });

      await setupMission(tempDir, mission);

      const result = await manager.runTask(mission.mission_id, 'task-99.99' as TaskId);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCodes.MISSION_TASK_NOT_FOUND);
        expect(result.error.message).toContain('task-99.99');
      }
    });

    it('should return error when task dependencies not met', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [
          createMockPhase(1, {
            tasks: [
              createMockTask(1, 1, { status: 'pending' }),
              createMockTask(1, 2, {
                depends_on: ['task-1.1' as TaskId],
              }),
            ],
          }),
        ],
      });

      await setupMission(tempDir, mission);

      const result = await manager.runTask(mission.mission_id, 'task-1.2' as TaskId);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCodes.MISSION_TASK_BLOCKED);
        expect(result.error.message).toContain('unmet dependencies');
      }
    });

    it('should allow running task when dependencies are met', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [
          createMockPhase(1, {
            tasks: [
              createMockTask(1, 1, { status: 'passed' }),
              createMockTask(1, 2, {
                depends_on: ['task-1.1' as TaskId],
              }),
            ],
          }),
        ],
      });

      await setupMission(tempDir, mission);
      await setupTaskBriefings(tempDir, mission);

      const result = await manager.runTask(mission.mission_id, 'task-1.2' as TaskId);

      // Should pass dependency check (may fail at execution level)
      if (isErr(result)) {
        expect(result.error.code).not.toBe(ErrorCodes.MISSION_TASK_BLOCKED);
      }
    });

    it('should allow task with no dependencies to run immediately', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [
          createMockPhase(1, {
            tasks: [createMockTask(1, 1, { depends_on: [] })],
          }),
        ],
      });

      await setupMission(tempDir, mission);
      await setupTaskBriefings(tempDir, mission);

      const result = await manager.runTask(mission.mission_id, 'task-1.1' as TaskId);

      // Should pass dependency check
      if (isErr(result)) {
        expect(result.error.code).not.toBe(ErrorCodes.MISSION_TASK_BLOCKED);
      }
    });
  });

  // ============================================
  // Dependency Logic Tests
  // ============================================

  describe('Dependency Logic', () => {
    it('should check multiple dependencies correctly', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [
          createMockPhase(1, {
            tasks: [
              createMockTask(1, 1, { status: 'passed' }),
              createMockTask(1, 2, { status: 'pending' }),
              createMockTask(1, 3, {
                depends_on: ['task-1.1' as TaskId, 'task-1.2' as TaskId],
              }),
            ],
          }),
        ],
      });

      await setupMission(tempDir, mission);

      const result = await manager.runTask(mission.mission_id, 'task-1.3' as TaskId);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCodes.MISSION_TASK_BLOCKED);
      }
    });

    it('should allow task when all multiple dependencies are met', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [
          createMockPhase(1, {
            tasks: [
              createMockTask(1, 1, { status: 'passed' }),
              createMockTask(1, 2, { status: 'passed' }),
              createMockTask(1, 3, {
                depends_on: ['task-1.1' as TaskId, 'task-1.2' as TaskId],
              }),
            ],
          }),
        ],
      });

      await setupMission(tempDir, mission);
      await setupTaskBriefings(tempDir, mission);

      const result = await manager.runTask(mission.mission_id, 'task-1.3' as TaskId);

      // Should pass dependency check
      if (isErr(result)) {
        expect(result.error.code).not.toBe(ErrorCodes.MISSION_TASK_BLOCKED);
      }
    });
  });

  // ============================================
  // State Management Tests
  // ============================================

  describe('State Management', () => {
    it('should update task status when starting execution', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [
          createMockPhase(1, {
            tasks: [createMockTask(1, 1, { status: 'pending' })],
          }),
        ],
      });

      await setupMission(tempDir, mission);
      await setupTaskBriefings(tempDir, mission);

      await manager.runTask(mission.mission_id, 'task-1.1' as TaskId);

      const updatedMission = await manager.getMission(mission.mission_id);
      if (isOk(updatedMission)) {
        const task = updatedMission.data.phases[0].tasks[0];
        // Task status should have changed from pending
        expect(task.status).not.toBe('pending');
        expect(task.started_at).toBeDefined();
      }
    });

    it('should preserve mission structure after failed execution', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        title: 'Test Mission',
        description: 'Test description',
        phases: [
          createMockPhase(1, {
            tasks: [createMockTask(1, 1)],
          }),
        ],
      });

      await setupMission(tempDir, mission);
      await setupTaskBriefings(tempDir, mission);

      await manager.runTask(mission.mission_id, 'task-1.1' as TaskId);

      const updatedMission = await manager.getMission(mission.mission_id);
      if (isOk(updatedMission)) {
        expect(updatedMission.data.mission_id).toBe(mission.mission_id);
        expect(updatedMission.data.title).toBe('Test Mission');
        expect(updatedMission.data.description).toBe('Test description');
        expect(updatedMission.data.phases).toHaveLength(1);
      }
    });
  });

  // ============================================
  // Context Loading Tests
  // ============================================

  describe('Context Loading', () => {
    it('should return null context for phase 0 or negative', async () => {
      // Test the loadPhaseContext method indirectly
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [
          createMockPhase(1, {
            tasks: [createMockTask(1, 1)],
          }),
        ],
      });

      await setupMission(tempDir, mission);
      await setupTaskBriefings(tempDir, mission);

      // Running phase 1 should try to load context from phase 0 (returns null)
      const result = await manager.runPhase(mission.mission_id, 1);

      // Should not fail due to missing context
      if (isErr(result)) {
        expect(result.error.code).not.toBe(ErrorCodes.FS_READ_FAILED);
      }
    });

    it('should handle missing context file gracefully', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [
          createMockPhase(1, { status: 'completed' }),
          createMockPhase(2, {
            tasks: [createMockTask(2, 1)],
          }),
        ],
      });

      await setupMission(tempDir, mission);
      await setupTaskBriefings(tempDir, mission);
      // Don't create phase-1.md context file

      const result = await manager.runTask(mission.mission_id, 'task-2.1' as TaskId);

      // Should not fail due to missing context file
      if (isErr(result)) {
        expect(result.error.code).not.toBe(ErrorCodes.FS_READ_FAILED);
      }
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('should handle phase with no tasks', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [
          createMockPhase(1, {
            tasks: [], // No tasks
          }),
        ],
      });

      await setupMission(tempDir, mission);

      const result = await manager.runPhase(mission.mission_id, 1);

      // Should complete successfully with 0 tasks
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.tasksCompleted).toBe(0);
        expect(result.data.tasksFailed).toBe(0);
      }
    });

    it('should handle re-running completed phase', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [
          createMockPhase(1, {
            status: 'completed',
            tasks: [createMockTask(1, 1, { status: 'passed' })],
          }),
        ],
      });

      await setupMission(tempDir, mission);
      await setupTaskBriefings(tempDir, mission);

      // Should allow re-running completed phase
      const result = await manager.runPhase(mission.mission_id, 1);

      // Should not error out (may execute or skip)
      if (isErr(result)) {
        // If it errors, should not be a "not found" or "blocked" error
        expect([
          ErrorCodes.MISSION_NOT_FOUND,
          ErrorCodes.MISSION_PHASE_NOT_FOUND,
          ErrorCodes.MISSION_PHASE_NOT_READY,
        ]).not.toContain(result.error.code);
      }
    });

    it('should handle re-running failed task', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        phases: [
          createMockPhase(1, {
            tasks: [
              createMockTask(1, 1, {
                status: 'failed',
                error: 'Previous error',
              }),
            ],
          }),
        ],
      });

      await setupMission(tempDir, mission);
      await setupTaskBriefings(tempDir, mission);

      const result = await manager.runTask(mission.mission_id, 'task-1.1' as TaskId);

      // Should allow retry (may fail again, but not be blocked)
      if (isErr(result)) {
        expect(result.error.code).not.toBe(ErrorCodes.MISSION_TASK_BLOCKED);
      }
    });
  });
});

// ============================================
// Test Helper Functions
// ============================================

/**
 * Setup a mission in the temp directory
 */
async function setupMission(tempDir: string, mission: any): Promise<void> {
  const missionDir = join(tempDir, '.dure', 'missions', mission.mission_id);
  await mkdir(missionDir, { recursive: true });
  await mkdir(join(missionDir, 'planning'), { recursive: true });
  await mkdir(join(missionDir, 'phases'), { recursive: true });
  await mkdir(join(missionDir, 'context'), { recursive: true });

  await writeFile(
    join(missionDir, 'mission.json'),
    JSON.stringify(mission, null, 2)
  );
  await writeFile(join(missionDir, 'input.md'), mission.description);
}

/**
 * Setup task briefing files
 */
async function setupTaskBriefings(tempDir: string, mission: any): Promise<void> {
  for (const phase of mission.phases) {
    for (const task of phase.tasks) {
      const briefingPath = join(tempDir, task.briefing_path);
      await mkdir(join(briefingPath, '..'), { recursive: true });
      await writeFile(briefingPath, `# Task: ${task.title}\n\n${task.description}`);
    }
  }
}
