/**
 * Tests for KanbanStateManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { KanbanStateManager } from '../../../src/core/kanban-state-manager.js';
import { isOk, isErr } from '../../../src/types/result.js';
import type { Mission, MissionPhase, MissionTask, KanbanState } from '../../../src/types/mission.js';
import type { MissionId, PhaseId, TaskId } from '../../../src/types/branded.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockMission,
  createMockPhase,
  createMockTask,
} from '../../helpers/test-utils.js';

describe('KanbanStateManager', () => {
  let tempDir: string;
  let missionId: MissionId;
  let manager: KanbanStateManager;

  beforeEach(() => {
    tempDir = createTempDir('kanban-test');
    missionId = 'mission-20260130000000' as MissionId;

    // Create mission directory
    const missionDir = join(tempDir, '.dure', 'missions', missionId);
    mkdirSync(missionDir, { recursive: true });

    manager = new KanbanStateManager(tempDir, missionId);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('syncFromMission', () => {
    it('should create kanban state from mission', async () => {
      const task1 = createMockTask(1, 1);
      const task2 = createMockTask(1, 2, { depends_on: ['task-1.1' as TaskId] });
      const phase1 = createMockPhase(1, { tasks: [task1, task2] });

      const mission = createMockMission({
        mission_id: missionId,
        phases: [phase1],
      }) as Mission;

      const result = await manager.syncFromMission(mission);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.mission_id).toBe(missionId);
        expect(result.data.columns.length).toBe(1);
        expect(result.data.columns[0].cards.length).toBe(2);
        expect(result.data.stats.total_tasks).toBe(2);
      }
    });

    it('should calculate blocked_by correctly', async () => {
      const task1 = createMockTask(1, 1, { status: 'pending' });
      const task2 = createMockTask(1, 2, {
        depends_on: ['task-1.1' as TaskId],
        status: 'pending',
      });
      const phase1 = createMockPhase(1, { tasks: [task1, task2] });

      const mission = createMockMission({
        mission_id: missionId,
        phases: [phase1],
      }) as Mission;

      const result = await manager.syncFromMission(mission);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const card2 = result.data.columns[0].cards[1];
        expect(card2.blocked_by).toContain('task-1.1');
        expect(card2.status).toBe('blocked');
      }
    });

    it('should not block tasks when dependencies are passed', async () => {
      const task1 = createMockTask(1, 1, { status: 'passed' });
      const task2 = createMockTask(1, 2, {
        depends_on: ['task-1.1' as TaskId],
        status: 'pending',
      });
      const phase1 = createMockPhase(1, { tasks: [task1, task2] });

      const mission = createMockMission({
        mission_id: missionId,
        phases: [phase1],
      }) as Mission;

      const result = await manager.syncFromMission(mission);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const card2 = result.data.columns[0].cards[1];
        expect(card2.blocked_by).toHaveLength(0);
        expect(card2.status).toBe('pending');
      }
    });

    it('should calculate stats correctly', async () => {
      const task1 = createMockTask(1, 1, { status: 'passed' });
      const task2 = createMockTask(1, 2, { status: 'in_progress' });
      const task3 = createMockTask(1, 3, { status: 'failed' });
      const task4 = createMockTask(1, 4, { status: 'pending' });
      const phase1 = createMockPhase(1, { tasks: [task1, task2, task3, task4] });

      const mission = createMockMission({
        mission_id: missionId,
        phases: [phase1],
      }) as Mission;

      const result = await manager.syncFromMission(mission);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.stats.total_tasks).toBe(4);
        expect(result.data.stats.passed).toBe(1);
        expect(result.data.stats.in_progress).toBe(1);
        expect(result.data.stats.failed).toBe(1);
        expect(result.data.stats.pending).toBe(1);
      }
    });

    it('should save kanban.json file', async () => {
      const task1 = createMockTask(1, 1);
      const phase1 = createMockPhase(1, { tasks: [task1] });
      const mission = createMockMission({
        mission_id: missionId,
        phases: [phase1],
      }) as Mission;

      await manager.syncFromMission(mission);

      const kanbanPath = join(tempDir, '.dure', 'missions', missionId, 'kanban.json');
      expect(existsSync(kanbanPath)).toBe(true);

      const content = readFileSync(kanbanPath, 'utf-8');
      const kanban = JSON.parse(content) as KanbanState;
      expect(kanban.mission_id).toBe(missionId);
    });
  });

  describe('updateTaskStatus', () => {
    beforeEach(async () => {
      // Setup initial kanban state
      const task1 = createMockTask(1, 1, { status: 'pending' });
      const task2 = createMockTask(1, 2, {
        depends_on: ['task-1.1' as TaskId],
        status: 'pending',
      });
      const phase1 = createMockPhase(1, { tasks: [task1, task2] });
      const mission = createMockMission({
        mission_id: missionId,
        phases: [phase1],
      }) as Mission;

      await manager.syncFromMission(mission);
    });

    it('should update task status', async () => {
      const result = await manager.updateTaskStatus(
        'task-1.1' as TaskId,
        'in_progress'
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.type).toBe('task_status');
        expect(result.data.old_status).toBe('pending');
        expect(result.data.new_status).toBe('in_progress');
      }

      // Verify state was saved
      const stateResult = await manager.getState();
      expect(isOk(stateResult)).toBe(true);
      if (isOk(stateResult)) {
        const card = stateResult.data.columns[0].cards[0];
        expect(card.status).toBe('in_progress');
      }
    });

    it('should update run_id when provided', async () => {
      const result = await manager.updateTaskStatus(
        'task-1.1' as TaskId,
        'in_progress',
        'run-20260130120000'
      );

      expect(isOk(result)).toBe(true);

      const stateResult = await manager.getState();
      if (isOk(stateResult)) {
        const card = stateResult.data.columns[0].cards[0];
        expect(card.run_id).toBe('run-20260130120000');
      }
    });

    it('should set active_task when task starts', async () => {
      await manager.updateTaskStatus(
        'task-1.1' as TaskId,
        'in_progress',
        'run-20260130120000'
      );

      const stateResult = await manager.getState();
      if (isOk(stateResult)) {
        expect(stateResult.data.active_task).toBeDefined();
        expect(stateResult.data.active_task?.task_id).toBe('task-1.1');
        expect(stateResult.data.active_task?.run_id).toBe('run-20260130120000');
      }
    });

    it('should clear active_task when task completes', async () => {
      // First start the task
      await manager.updateTaskStatus(
        'task-1.1' as TaskId,
        'in_progress',
        'run-20260130120000'
      );

      // Then complete it
      await manager.updateTaskStatus(
        'task-1.1' as TaskId,
        'passed',
        'run-20260130120000'
      );

      const stateResult = await manager.getState();
      if (isOk(stateResult)) {
        expect(stateResult.data.active_task).toBeUndefined();
      }
    });

    it('should unblock dependent tasks when dependency completes', async () => {
      // Complete task 1.1
      await manager.updateTaskStatus('task-1.1' as TaskId, 'passed');

      const stateResult = await manager.getState();
      if (isOk(stateResult)) {
        const card2 = stateResult.data.columns[0].cards[1];
        expect(card2.blocked_by).toHaveLength(0);
        expect(card2.status).toBe('pending');
      }
    });

    it('should recalculate stats after update', async () => {
      await manager.updateTaskStatus('task-1.1' as TaskId, 'passed');

      const stateResult = await manager.getState();
      if (isOk(stateResult)) {
        expect(stateResult.data.stats.passed).toBe(1);
        expect(stateResult.data.stats.pending).toBe(1);
        expect(stateResult.data.stats.blocked).toBe(0);
      }
    });

    it('should return error for non-existent task', async () => {
      const result = await manager.updateTaskStatus(
        'task-99.99' as TaskId,
        'passed'
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('KANBAN_TASK_NOT_FOUND');
      }
    });
  });

  describe('updatePhaseStatus', () => {
    beforeEach(async () => {
      const task1 = createMockTask(1, 1);
      const phase1 = createMockPhase(1, { tasks: [task1] });
      const mission = createMockMission({
        mission_id: missionId,
        phases: [phase1],
      }) as Mission;

      await manager.syncFromMission(mission);
    });

    it('should update phase status', async () => {
      const result = await manager.updatePhaseStatus(
        'phase-1' as PhaseId,
        'in_progress'
      );

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.type).toBe('phase_status');
        expect(result.data.old_status).toBe('pending');
        expect(result.data.new_status).toBe('in_progress');
      }
    });

    it('should return error for non-existent phase', async () => {
      const result = await manager.updatePhaseStatus(
        'phase-99' as PhaseId,
        'completed'
      );

      expect(isErr(result)).toBe(true);
    });
  });

  describe('load', () => {
    it('should return error when kanban.json does not exist', async () => {
      const result = await manager.load();

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('KANBAN_LOAD_FAILED');
      }
    });

    it('should load existing kanban state', async () => {
      // First create a kanban state
      const task1 = createMockTask(1, 1);
      const phase1 = createMockPhase(1, { tasks: [task1] });
      const mission = createMockMission({
        mission_id: missionId,
        phases: [phase1],
      }) as Mission;

      await manager.syncFromMission(mission);

      // Now load it
      const result = await manager.load();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.mission_id).toBe(missionId);
      }
    });
  });

  describe('multiple phases', () => {
    it('should handle multiple phases correctly', async () => {
      const task11 = createMockTask(1, 1, { status: 'passed' });
      const task12 = createMockTask(1, 2, {
        depends_on: ['task-1.1' as TaskId],
        status: 'pending',
      });
      const task21 = createMockTask(2, 1, { status: 'pending' });
      const task22 = createMockTask(2, 2, {
        depends_on: ['task-2.1' as TaskId],
        status: 'pending',
      });

      const phase1 = createMockPhase(1, { tasks: [task11, task12] });
      const phase2 = createMockPhase(2, { tasks: [task21, task22] });

      const mission = createMockMission({
        mission_id: missionId,
        phases: [phase1, phase2],
      }) as Mission;

      const result = await manager.syncFromMission(mission);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.columns.length).toBe(2);
        expect(result.data.stats.total_tasks).toBe(4);
        expect(result.data.stats.passed).toBe(1);
        // task-1.2 is unblocked (1.1 passed), task-2.2 is blocked (2.1 pending)
        expect(result.data.stats.pending).toBe(2); // task-1.2 and task-2.1
        expect(result.data.stats.blocked).toBe(1); // task-2.2
      }
    });
  });
});
