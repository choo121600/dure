/**
 * Unit tests for mission-run CLI command
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { writeFile, mkdir } from 'fs/promises';
import { missionRunCommand } from '../../../src/cli/commands/mission-run.js';
import type { MissionId, TaskId } from '../../../src/types/branded.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockMission,
  createMockPhase,
  createMockTask,
} from '../../helpers/test-utils.js';

// Mock console methods
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`process.exit(${code})`);
});

// Mock ora spinner
vi.mock('ora', () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
  })),
}));

// Mock chalk for clean test output
vi.mock('chalk', () => ({
  default: {
    red: (text: string) => text,
    green: (text: string) => text,
    blue: (text: string) => text,
    cyan: (text: string) => text,
    yellow: (text: string) => text,
    gray: (text: string) => text,
  },
}));

// Mock MissionManager
const mockGetMission = vi.fn();
const mockRunPhase = vi.fn();
const mockRunTask = vi.fn();

vi.mock('../../../src/core/mission-manager.js', () => ({
  MissionManager: class MockMissionManager {
    getMission = mockGetMission;
    runPhase = mockRunPhase;
    runTask = mockRunTask;
  },
}));

describe('mission-run Command', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir('mission-run-test');
    vi.clearAllMocks();

    // Mock process.cwd to return our temp directory
    vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  // ============================================
  // Command Validation
  // ============================================

  describe('Command Validation', () => {
    it('should exit with error when mission not found', async () => {
      mockGetMission.mockResolvedValueOnce({
        success: false,
        error: { message: 'Mission not found', code: 'MISSION_NOT_FOUND' },
      });

      await expect(
        missionRunCommand('mission-99999999999999', {})
      ).rejects.toThrow('process.exit(1)');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Mission not found')
      );
    });

    it('should exit with error when plan not approved (planning status)', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'planning',
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });

      await expect(
        missionRunCommand(mission.mission_id, {})
      ).rejects.toThrow('process.exit(1)');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('plan not approved')
      );
    });

    it('should exit with error when plan not approved (plan_review status)', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'plan_review',
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });

      await expect(
        missionRunCommand(mission.mission_id, {})
      ).rejects.toThrow('process.exit(1)');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('plan not approved')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('dure mission approve')
      );
    });
  });

  // ============================================
  // Auto-run (Next Phase)
  // ============================================

  describe('Auto-run Next Phase', () => {
    it('should run next pending phase when no options specified', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
        phases: [
          createMockPhase(1, { status: 'pending' }),
          createMockPhase(2, { status: 'pending' }),
        ],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunPhase.mockResolvedValueOnce({
        success: true,
        data: {
          phaseId: 'phase-1',
          status: 'completed',
          tasksCompleted: 2,
          tasksFailed: 0,
        },
      });

      await missionRunCommand(mission.mission_id, {});

      expect(mockRunPhase).toHaveBeenCalledWith(mission.mission_id, 1, {
        continueOnFailure: undefined,
      });
    });

    it('should run next failed phase when present', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'in_progress',
        phases: [
          createMockPhase(1, { status: 'completed' }),
          createMockPhase(2, { status: 'failed' }),
          createMockPhase(3, { status: 'pending' }),
        ],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunPhase.mockResolvedValueOnce({
        success: true,
        data: {
          phaseId: 'phase-2',
          status: 'completed',
          tasksCompleted: 1,
          tasksFailed: 0,
        },
      });

      await missionRunCommand(mission.mission_id, {});

      expect(mockRunPhase).toHaveBeenCalledWith(mission.mission_id, 2, {
        continueOnFailure: undefined,
      });
    });

    it('should display success message when all phases completed', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'completed',
        phases: [
          createMockPhase(1, { status: 'completed' }),
          createMockPhase(2, { status: 'completed' }),
        ],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });

      await missionRunCommand(mission.mission_id, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('All phases completed')
      );
      expect(mockRunPhase).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // Run Specific Phase
  // ============================================

  describe('Run Specific Phase', () => {
    it('should run specific phase when --phase option provided', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
        phases: [
          createMockPhase(1),
          createMockPhase(2),
        ],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunPhase.mockResolvedValueOnce({
        success: true,
        data: {
          phaseId: 'phase-2',
          status: 'completed',
          tasksCompleted: 3,
          tasksFailed: 0,
        },
      });

      await missionRunCommand(mission.mission_id, { phase: 2 });

      expect(mockRunPhase).toHaveBeenCalledWith(mission.mission_id, 2, {
        continueOnFailure: undefined,
      });
    });

    it('should pass continueOnFailure option to runPhase', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
        phases: [createMockPhase(1)],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunPhase.mockResolvedValueOnce({
        success: true,
        data: {
          phaseId: 'phase-1',
          status: 'completed',
          tasksCompleted: 2,
          tasksFailed: 0,
        },
      });

      await missionRunCommand(mission.mission_id, {
        phase: 1,
        continueOnFailure: true,
      });

      expect(mockRunPhase).toHaveBeenCalledWith(mission.mission_id, 1, {
        continueOnFailure: true,
      });
    });

    it('should display success result for completed phase', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
        phases: [createMockPhase(1)],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunPhase.mockResolvedValueOnce({
        success: true,
        data: {
          phaseId: 'phase-1',
          status: 'completed',
          tasksCompleted: 5,
          tasksFailed: 0,
        },
      });

      await missionRunCommand(mission.mission_id, { phase: 1 });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Phase 1 completed')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('5 passed')
      );
    });

    it('should display failure result with failed task info', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
        phases: [createMockPhase(1)],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunPhase.mockResolvedValueOnce({
        success: true,
        data: {
          phaseId: 'phase-1',
          status: 'failed',
          tasksCompleted: 2,
          tasksFailed: 1,
          failedTask: 'task-1.3' as TaskId,
        },
      });

      await missionRunCommand(mission.mission_id, { phase: 1 });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Phase 1 failed')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('2 passed, 1 failed')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('task-1.3')
      );
    });

    it('should exit with error code on phase failure', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
        phases: [createMockPhase(1)],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunPhase.mockResolvedValueOnce({
        success: false,
        error: { message: 'Phase execution failed', code: 'MISSION_FAILED' },
      });

      await expect(
        missionRunCommand(mission.mission_id, { phase: 1 })
      ).rejects.toThrow('process.exit(1)');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Phase execution failed')
      );
    });
  });

  // ============================================
  // Run Specific Task
  // ============================================

  describe('Run Specific Task', () => {
    it('should run specific task when --task option provided', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
        phases: [
          createMockPhase(1, {
            tasks: [
              createMockTask(1, 1),
              createMockTask(1, 2),
            ],
          }),
        ],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunTask.mockResolvedValueOnce({
        success: true,
        data: {
          taskId: 'task-1.2',
          status: 'passed',
          runId: 'run-20260130000000',
        },
      });

      await missionRunCommand(mission.mission_id, { task: 'task-1.2' });

      expect(mockRunTask).toHaveBeenCalledWith(mission.mission_id, 'task-1.2');
    });

    it('should display success result for passed task', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunTask.mockResolvedValueOnce({
        success: true,
        data: {
          taskId: 'task-1.1',
          status: 'passed',
          runId: 'run-20260130000000',
        },
      });

      await missionRunCommand(mission.mission_id, { task: 'task-1.1' });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('task-1.1 passed')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('run-20260130000000')
      );
    });

    it('should display failure result for failed task', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunTask.mockResolvedValueOnce({
        success: true,
        data: {
          taskId: 'task-1.1',
          status: 'failed',
          error: 'Build failed: syntax error',
        },
      });

      await missionRunCommand(mission.mission_id, { task: 'task-1.1' });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('task-1.1 failed')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Build failed: syntax error')
      );
    });

    it('should exit with error code on task failure', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunTask.mockResolvedValueOnce({
        success: false,
        error: { message: 'Task not found', code: 'MISSION_TASK_NOT_FOUND' },
      });

      await expect(
        missionRunCommand(mission.mission_id, { task: 'task-99.99' })
      ).rejects.toThrow('process.exit(1)');

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Task not found')
      );
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('should handle phase with no failed tasks', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
        phases: [createMockPhase(1)],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunPhase.mockResolvedValueOnce({
        success: true,
        data: {
          phaseId: 'phase-1',
          status: 'failed',
          tasksCompleted: 0,
          tasksFailed: 1,
          // failedTask is undefined
        },
      });

      await missionRunCommand(mission.mission_id, { phase: 1 });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Phase 1 failed')
      );
      // Should not crash when failedTask is undefined
    });

    it('should handle task result without runId', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunTask.mockResolvedValueOnce({
        success: true,
        data: {
          taskId: 'task-1.1',
          status: 'passed',
          // runId is undefined
        },
      });

      await missionRunCommand(mission.mission_id, { task: 'task-1.1' });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('task-1.1 passed')
      );
      // Should not crash when runId is undefined
    });

    it('should handle task result without error message', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunTask.mockResolvedValueOnce({
        success: true,
        data: {
          taskId: 'task-1.1',
          status: 'failed',
          // error is undefined
        },
      });

      await missionRunCommand(mission.mission_id, { task: 'task-1.1' });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('task-1.1 failed')
      );
      // Should not crash when error is undefined
    });

    it('should not start spinner in watch mode', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
        phases: [createMockPhase(1)],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunPhase.mockResolvedValueOnce({
        success: true,
        data: {
          phaseId: 'phase-1',
          status: 'completed',
          tasksCompleted: 1,
          tasksFailed: 0,
        },
      });

      await missionRunCommand(mission.mission_id, { phase: 1, watch: true });

      // Should complete without errors even in watch mode
      expect(mockRunPhase).toHaveBeenCalled();
    });

    it('should handle mission with empty phases', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
        phases: [],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });

      await missionRunCommand(mission.mission_id, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('All phases completed')
      );
    });

    it('should handle mission with all in_progress phases', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'in_progress',
        phases: [
          createMockPhase(1, { status: 'in_progress' }),
        ],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });

      await missionRunCommand(mission.mission_id, {});

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('All phases completed')
      );
    });
  });

  // ============================================
  // Display Output
  // ============================================

  describe('Display Output', () => {
    it('should display mission title when running', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        title: 'Implement Authentication System',
        status: 'ready',
        phases: [createMockPhase(1)],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunPhase.mockResolvedValueOnce({
        success: true,
        data: {
          phaseId: 'phase-1',
          status: 'completed',
          tasksCompleted: 1,
          tasksFailed: 0,
        },
      });

      await missionRunCommand(mission.mission_id, { phase: 1 });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Implement Authentication System')
      );
    });

    it('should display retry command for failed task', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
        phases: [createMockPhase(1)],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunPhase.mockResolvedValueOnce({
        success: true,
        data: {
          phaseId: 'phase-1',
          status: 'failed',
          tasksCompleted: 1,
          tasksFailed: 1,
          failedTask: 'task-1.2' as TaskId,
        },
      });

      await missionRunCommand(mission.mission_id, { phase: 1 });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('dure mission run')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('--task task-1.2')
      );
    });

    it('should display phase number when running specific phase', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
        phases: [createMockPhase(3)],
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunPhase.mockResolvedValueOnce({
        success: true,
        data: {
          phaseId: 'phase-3',
          status: 'completed',
          tasksCompleted: 2,
          tasksFailed: 0,
        },
      });

      await missionRunCommand(mission.mission_id, { phase: 3 });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Running Phase 3')
      );
    });

    it('should display task ID when running specific task', async () => {
      const mission = createMockMission({
        mission_id: 'mission-20260130000000' as MissionId,
        status: 'ready',
      });

      mockGetMission.mockResolvedValueOnce({ success: true, data: mission });
      mockRunTask.mockResolvedValueOnce({
        success: true,
        data: {
          taskId: 'task-2.5',
          status: 'passed',
        },
      });

      await missionRunCommand(mission.mission_id, { task: 'task-2.5' });

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Running Task task-2.5')
      );
    });
  });
});
