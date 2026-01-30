/**
 * Kanban Data Provider
 *
 * Provides real-time kanban state with file watching, caching, debouncing,
 * and change detection. Used by both TUI and Web dashboard.
 */

import { EventEmitter } from 'events';
import { watch, FSWatcher } from 'chokidar';
import path from 'path';
import type { AsyncResult } from '../types/result.js';
import { ok, err, isOk, isErr } from '../types/result.js';
import type {
  KanbanState,
  KanbanUpdate,
  KanbanColumn,
  KanbanCard,
  MissionTaskStatus,
} from '../types/mission.js';
import type { MissionId, TaskId, PhaseId } from '../types/branded.js';
import { KanbanError, ErrorCodes } from '../types/errors.js';
import { KanbanStateManager } from './kanban-state-manager.js';

// ============================================================================
// Types
// ============================================================================

export interface KanbanDataProviderOptions {
  /** File watch interval in ms (default: 500) */
  watchInterval: number;
  /** Event debounce time in ms (default: 100) */
  debounceMs: number;
}

export type KanbanEventType =
  | 'state:updated'
  | 'task:updated'
  | 'phase:updated'
  | 'error';

export interface KanbanEvent {
  type: KanbanEventType;
  missionId: MissionId;
  data: KanbanState | KanbanUpdate | Error;
  timestamp: Date;
}

// ============================================================================
// KanbanDataProvider Class
// ============================================================================

export class KanbanDataProvider extends EventEmitter {
  private projectRoot: string;
  private missionId: MissionId;
  private options: KanbanDataProviderOptions;
  private stateManager: KanbanStateManager;
  private watcher: FSWatcher | null = null;
  private currentState: KanbanState | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private isWatching = false;

  constructor(
    projectRoot: string,
    missionId: MissionId,
    options?: Partial<KanbanDataProviderOptions>
  ) {
    super();
    this.projectRoot = projectRoot;
    this.missionId = missionId;
    this.options = {
      watchInterval: 500,
      debounceMs: 100,
      ...options,
    };
    this.stateManager = new KanbanStateManager(projectRoot, missionId);
  }

  // ==========================================================================
  // State Access
  // ==========================================================================

  /**
   * Get current kanban state (with caching)
   */
  async getState(): AsyncResult<KanbanState, KanbanError> {
    if (this.currentState) {
      return ok(this.currentState);
    }

    const result = await this.stateManager.load();
    if (isOk(result)) {
      this.currentState = result.data;
    }
    return result;
  }

  /**
   * Get a specific task by ID
   */
  getTask(taskId: TaskId): KanbanCard | undefined {
    if (!this.currentState) return undefined;

    for (const column of this.currentState.columns) {
      const card = column.cards.find(c => c.task_id === taskId);
      if (card) return card;
    }
    return undefined;
  }

  /**
   * Get a specific phase/column by number
   */
  getPhase(phaseNumber: number): KanbanColumn | undefined {
    if (!this.currentState) return undefined;
    return this.currentState.columns.find(c => c.number === phaseNumber);
  }

  /**
   * Get column by phase ID
   */
  getColumn(phaseId: PhaseId): KanbanColumn | undefined {
    if (!this.currentState) return undefined;
    return this.currentState.columns.find(c => c.phase_id === phaseId);
  }

  // ==========================================================================
  // File Watching
  // ==========================================================================

  /**
   * Start real-time file watching
   */
  async startWatching(): AsyncResult<void, KanbanError> {
    if (this.isWatching) {
      return ok(undefined);
    }

    // Load initial state
    const initialResult = await this.getState();
    if (isErr(initialResult)) {
      return initialResult;
    }

    // Set up file watcher
    const kanbanPath = path.join(
      this.projectRoot,
      '.dure',
      'missions',
      this.missionId,
      'kanban.json'
    );

    try {
      this.watcher = watch(kanbanPath, {
        persistent: true,
        usePolling: true,
        interval: this.options.watchInterval,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      });

      this.watcher.on('change', () => this.handleFileChange());
      this.watcher.on('error', (error) => {
        this.emitError(error);
      });

      this.isWatching = true;
      return ok(undefined);
    } catch (error) {
      return err(new KanbanError(
        'Failed to start file watcher',
        ErrorCodes.KANBAN_FAILED,
        { missionId: this.missionId, path: kanbanPath },
        error as Error
      ));
    }
  }

  /**
   * Stop watching for changes
   */
  async stopWatching(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.isWatching = false;
  }

  /**
   * Handle file change with debouncing
   */
  private handleFileChange(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      await this.reloadAndEmit();
    }, this.options.debounceMs);
  }

  /**
   * Reload state and emit change events
   */
  private async reloadAndEmit(): Promise<void> {
    const oldState = this.currentState;

    // Force reload from disk
    const newResult = await this.stateManager.load();

    if (isErr(newResult)) {
      this.emitError(newResult.error);
      return;
    }

    this.currentState = newResult.data;

    // Detect what changed
    const changes = this.detectChanges(oldState, this.currentState);

    // Emit full state update
    this.emit('state:updated', {
      type: 'state:updated',
      missionId: this.missionId,
      data: this.currentState,
      timestamp: new Date(),
    } as KanbanEvent);

    // Emit individual change events
    for (const change of changes) {
      this.emit(change.type, {
        type: change.type,
        missionId: this.missionId,
        data: change.update,
        timestamp: new Date(),
      } as KanbanEvent);
    }
  }

  /**
   * Emit error event
   */
  private emitError(error: Error): void {
    this.emit('error', {
      type: 'error',
      missionId: this.missionId,
      data: error,
      timestamp: new Date(),
    } as KanbanEvent);
  }

  // ==========================================================================
  // Change Detection
  // ==========================================================================

  /**
   * Detect changes between old and new state
   */
  private detectChanges(
    oldState: KanbanState | null,
    newState: KanbanState
  ): Array<{ type: KanbanEventType; update: KanbanUpdate }> {
    const changes: Array<{ type: KanbanEventType; update: KanbanUpdate }> = [];

    if (!oldState) return changes;

    // Detect task status changes
    const oldTasks = this.flattenTasks(oldState);
    const newTasks = this.flattenTasks(newState);

    for (const [taskId, newTask] of newTasks) {
      const oldTask = oldTasks.get(taskId);
      if (oldTask && oldTask.status !== newTask.status) {
        changes.push({
          type: 'task:updated',
          update: {
            type: 'task_status',
            task_id: taskId as TaskId,
            phase_id: newTask.phase_id,
            old_status: oldTask.status,
            new_status: newTask.status,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    // Detect phase status changes
    for (const newColumn of newState.columns) {
      const oldColumn = oldState.columns.find(
        c => c.phase_id === newColumn.phase_id
      );
      if (oldColumn && oldColumn.status !== newColumn.status) {
        changes.push({
          type: 'phase:updated',
          update: {
            type: 'phase_status',
            phase_id: newColumn.phase_id,
            old_status: oldColumn.status,
            new_status: newColumn.status,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    return changes;
  }

  /**
   * Flatten tasks from all columns into a Map
   */
  private flattenTasks(state: KanbanState): Map<string, KanbanCard> {
    const tasks = new Map<string, KanbanCard>();
    for (const column of state.columns) {
      for (const card of column.cards) {
        tasks.set(card.task_id, card);
      }
    }
    return tasks;
  }

  // ==========================================================================
  // Statistics & Queries
  // ==========================================================================

  /**
   * Calculate progress percentage
   */
  getProgressPercentage(): number {
    if (!this.currentState) return 0;
    const { passed, total_tasks } = this.currentState.stats;
    return total_tasks > 0 ? Math.round((passed / total_tasks) * 100) : 0;
  }

  /**
   * Get currently active/running task
   */
  getActiveTask(): KanbanCard | undefined {
    if (!this.currentState?.active_task) return undefined;
    return this.getTask(this.currentState.active_task.task_id);
  }

  /**
   * Get tasks that are ready to run (pending with no blockers)
   */
  getReadyTasks(): KanbanCard[] {
    if (!this.currentState) return [];

    const ready: KanbanCard[] = [];
    for (const column of this.currentState.columns) {
      for (const card of column.cards) {
        // A task is ready if it's pending and has no blockers
        if (card.status === 'pending' && card.blocked_by.length === 0) {
          ready.push(card);
        }
      }
    }
    return ready;
  }

  /**
   * Get tasks by status
   */
  getTasksByStatus(status: MissionTaskStatus): KanbanCard[] {
    if (!this.currentState) return [];

    const tasks: KanbanCard[] = [];
    for (const column of this.currentState.columns) {
      for (const card of column.cards) {
        if (card.status === status) {
          tasks.push(card);
        }
      }
    }
    return tasks;
  }

  /**
   * Get failed tasks
   */
  getFailedTasks(): KanbanCard[] {
    return this.getTasksByStatus('failed');
  }

  /**
   * Get tasks needing human intervention
   */
  getHumanRequiredTasks(): KanbanCard[] {
    return this.getTasksByStatus('needs_human');
  }

  /**
   * Check if mission is complete
   */
  isComplete(): boolean {
    if (!this.currentState) return false;
    const { total_tasks, passed } = this.currentState.stats;
    return total_tasks > 0 && passed === total_tasks;
  }

  /**
   * Check if any task has failed
   */
  hasFailed(): boolean {
    if (!this.currentState) return false;
    return this.currentState.stats.failed > 0;
  }

  /**
   * Check if watching is active
   */
  isActive(): boolean {
    return this.isWatching;
  }

  /**
   * Get mission ID
   */
  getMissionId(): MissionId {
    return this.missionId;
  }

  /**
   * Force refresh from disk (bypasses cache)
   */
  async refresh(): AsyncResult<KanbanState, KanbanError> {
    this.currentState = null;
    return this.getState();
  }
}
