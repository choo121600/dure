/**
 * Tests for KanbanDataProvider
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { KanbanDataProvider } from '../../../src/core/kanban-data-provider.js';
import { KanbanStateManager } from '../../../src/core/kanban-state-manager.js';
import { isOk, isErr } from '../../../src/types/result.js';
import type { KanbanState, Mission } from '../../../src/types/mission.js';
import type { MissionId, TaskId } from '../../../src/types/branded.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockMission,
  createMockPhase,
  createMockTask,
  wait,
} from '../../helpers/test-utils.js';

describe('KanbanDataProvider', () => {
  let tempDir: string;
  let missionId: MissionId;
  let provider: KanbanDataProvider;
  let stateManager: KanbanStateManager;

  beforeEach(async () => {
    tempDir = createTempDir('kanban-provider-test');
    missionId = 'mission-20260130000000' as MissionId;

    // Create mission directory
    const missionDir = join(tempDir, '.dure', 'missions', missionId);
    mkdirSync(missionDir, { recursive: true });

    // Initialize state manager and create initial state
    stateManager = new KanbanStateManager(tempDir, missionId);
    provider = new KanbanDataProvider(tempDir, missionId, {
      watchInterval: 100,
      debounceMs: 50,
    });

    // Create initial kanban state
    const task1 = createMockTask(1, 1, { status: 'pending' });
    const task2 = createMockTask(1, 2, {
      depends_on: ['task-1.1' as TaskId],
      status: 'pending',
    });
    const task3 = createMockTask(2, 1, { status: 'pending' });
    const phase1 = createMockPhase(1, { tasks: [task1, task2] });
    const phase2 = createMockPhase(2, { tasks: [task3] });
    const mission = createMockMission({
      mission_id: missionId,
      phases: [phase1, phase2],
    }) as Mission;

    await stateManager.syncFromMission(mission);
  });

  afterEach(async () => {
    await provider.stopWatching();
    cleanupTempDir(tempDir);
  });

  describe('getState', () => {
    it('should load kanban state', async () => {
      const result = await provider.getState();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.mission_id).toBe(missionId);
        expect(result.data.columns.length).toBe(2);
        expect(result.data.stats.total_tasks).toBe(3);
      }
    });

    it('should cache state on subsequent calls', async () => {
      // First call loads from disk
      const result1 = await provider.getState();
      expect(isOk(result1)).toBe(true);

      // Second call should return cached state
      const result2 = await provider.getState();
      expect(isOk(result2)).toBe(true);

      if (isOk(result1) && isOk(result2)) {
        expect(result1.data).toBe(result2.data); // Same reference
      }
    });

    it('should return error when kanban.json does not exist', async () => {
      const nonExistentProvider = new KanbanDataProvider(
        tempDir,
        'mission-nonexistent' as MissionId
      );

      const result = await nonExistentProvider.getState();

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('KANBAN_LOAD_FAILED');
      }
    });
  });

  describe('getTask', () => {
    beforeEach(async () => {
      await provider.getState();
    });

    it('should return task by ID', () => {
      const task = provider.getTask('task-1.1' as TaskId);

      expect(task).toBeDefined();
      expect(task?.task_id).toBe('task-1.1');
      expect(task?.title).toBe('Task 1.1');
    });

    it('should return undefined for non-existent task', () => {
      const task = provider.getTask('task-99.99' as TaskId);

      expect(task).toBeUndefined();
    });

    it('should return undefined when no state loaded', () => {
      const freshProvider = new KanbanDataProvider(tempDir, missionId);
      const task = freshProvider.getTask('task-1.1' as TaskId);

      expect(task).toBeUndefined();
    });
  });

  describe('getPhase', () => {
    beforeEach(async () => {
      await provider.getState();
    });

    it('should return phase by number', () => {
      const phase = provider.getPhase(1);

      expect(phase).toBeDefined();
      expect(phase?.number).toBe(1);
      expect(phase?.cards.length).toBe(2);
    });

    it('should return undefined for non-existent phase', () => {
      const phase = provider.getPhase(99);

      expect(phase).toBeUndefined();
    });
  });

  describe('getReadyTasks', () => {
    beforeEach(async () => {
      await provider.getState();
    });

    it('should return tasks with no blockers', () => {
      const ready = provider.getReadyTasks();

      // task-1.1 and task-2.1 are pending with no blockers
      // task-1.2 is blocked by task-1.1
      expect(ready.length).toBe(2);
      expect(ready.map(t => t.task_id)).toContain('task-1.1');
      expect(ready.map(t => t.task_id)).toContain('task-2.1');
      expect(ready.map(t => t.task_id)).not.toContain('task-1.2');
    });

    it('should return empty array when no state loaded', () => {
      const freshProvider = new KanbanDataProvider(tempDir, missionId);
      const ready = freshProvider.getReadyTasks();

      expect(ready).toHaveLength(0);
    });
  });

  describe('getProgressPercentage', () => {
    it('should calculate progress correctly', async () => {
      await provider.getState();

      // Initially no tasks passed
      expect(provider.getProgressPercentage()).toBe(0);
    });

    it('should return 0 when no state loaded', () => {
      const freshProvider = new KanbanDataProvider(tempDir, missionId);
      expect(freshProvider.getProgressPercentage()).toBe(0);
    });

    it('should calculate percentage based on passed tasks', async () => {
      // Update task to passed
      await stateManager.updateTaskStatus('task-1.1' as TaskId, 'passed');

      // Force reload
      await provider.refresh();

      // 1 of 3 tasks passed = 33%
      expect(provider.getProgressPercentage()).toBe(33);
    });
  });

  describe('getActiveTask', () => {
    it('should return undefined when no active task', async () => {
      await provider.getState();

      const active = provider.getActiveTask();
      expect(active).toBeUndefined();
    });

    it('should return active task when one is running', async () => {
      // Start a task
      await stateManager.updateTaskStatus(
        'task-1.1' as TaskId,
        'in_progress',
        'run-123'
      );
      await provider.refresh();

      const active = provider.getActiveTask();

      expect(active).toBeDefined();
      expect(active?.task_id).toBe('task-1.1');
    });
  });

  describe('getTasksByStatus', () => {
    beforeEach(async () => {
      // Set up mixed statuses
      await stateManager.updateTaskStatus('task-1.1' as TaskId, 'passed');
      await provider.refresh();
    });

    it('should return tasks with specified status', () => {
      const passed = provider.getTasksByStatus('passed');
      expect(passed.length).toBe(1);
      expect(passed[0].task_id).toBe('task-1.1');
    });

    it('should return empty array for unused status', () => {
      const failed = provider.getTasksByStatus('failed');
      expect(failed).toHaveLength(0);
    });
  });

  describe('getFailedTasks', () => {
    it('should return failed tasks', async () => {
      await stateManager.updateTaskStatus('task-1.1' as TaskId, 'failed');
      await provider.refresh();

      const failed = provider.getFailedTasks();

      expect(failed.length).toBe(1);
      expect(failed[0].task_id).toBe('task-1.1');
    });
  });

  describe('isComplete / hasFailed', () => {
    it('should return false when not all tasks passed', async () => {
      await provider.getState();

      expect(provider.isComplete()).toBe(false);
    });

    it('should return true when all tasks passed', async () => {
      await stateManager.updateTaskStatus('task-1.1' as TaskId, 'passed');
      await stateManager.updateTaskStatus('task-1.2' as TaskId, 'passed');
      await stateManager.updateTaskStatus('task-2.1' as TaskId, 'passed');
      await provider.refresh();

      expect(provider.isComplete()).toBe(true);
    });

    it('should detect failed state', async () => {
      await stateManager.updateTaskStatus('task-1.1' as TaskId, 'failed');
      await provider.refresh();

      expect(provider.hasFailed()).toBe(true);
    });
  });

  describe('startWatching / stopWatching', () => {
    it('should start and stop without error', async () => {
      const startResult = await provider.startWatching();
      expect(isOk(startResult)).toBe(true);
      expect(provider.isActive()).toBe(true);

      await provider.stopWatching();
      expect(provider.isActive()).toBe(false);
    });

    it('should handle multiple start calls gracefully', async () => {
      await provider.startWatching();
      const result = await provider.startWatching();

      expect(isOk(result)).toBe(true);
    });
  });

  describe('file watching events', () => {
    afterEach(async () => {
      // Clean up all listeners after each test
      provider.removeAllListeners();
      await provider.stopWatching();
    });

    it('should emit state:updated on file change', async () => {
      await provider.startWatching();

      const updatePromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for state:updated event'));
        }, 2000);

        provider.once('state:updated', (event) => {
          clearTimeout(timeout);
          expect(event.type).toBe('state:updated');
          expect(event.missionId).toBe(missionId);
          resolve();
        });
      });

      // Modify kanban.json
      await wait(100);
      await stateManager.updateTaskStatus('task-1.1' as TaskId, 'in_progress');

      await updatePromise;
    });

    it('should emit task:updated when task status changes', async () => {
      // First load state so we have baseline for change detection
      await provider.refresh();
      await provider.startWatching();

      const updatePromise = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout waiting for task:updated event'));
        }, 2000);

        provider.once('task:updated', (event) => {
          clearTimeout(timeout);
          expect(event.type).toBe('task:updated');
          expect(event.data.new_status).toBe('passed');
          resolve();
        });
      });

      await wait(100);
      await stateManager.updateTaskStatus('task-1.1' as TaskId, 'passed');

      await updatePromise;
    });
  });

  describe('refresh', () => {
    it('should force reload from disk', async () => {
      // Initial load
      const result1 = await provider.getState();
      expect(isOk(result1)).toBe(true);

      // Modify directly on disk
      await stateManager.updateTaskStatus('task-1.1' as TaskId, 'passed');

      // Cached state still shows pending
      const result2 = await provider.getState();
      if (isOk(result1) && isOk(result2)) {
        // Same cached reference
        expect(result1.data).toBe(result2.data);
      }

      // Force refresh
      const result3 = await provider.refresh();
      expect(isOk(result3)).toBe(true);
      if (isOk(result3)) {
        const task = result3.data.columns[0].cards[0];
        expect(task.status).toBe('passed');
      }
    });
  });

  describe('getMissionId', () => {
    it('should return mission ID', () => {
      expect(provider.getMissionId()).toBe(missionId);
    });
  });
});
