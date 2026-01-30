/**
 * Kanban State Manager
 * Manages kanban board state for mission tracking
 */

import { readFile, writeFile, rename, mkdir } from 'fs/promises';
import path from 'path';
import type { Result, AsyncResult } from '../types/result.js';
import { ok, err, isErr } from '../types/result.js';
import type {
  Mission,
  MissionPhase,
  MissionTask,
  KanbanState,
  KanbanColumn,
  KanbanCard,
  KanbanUpdate,
  KanbanStats,
  MissionTaskStatus,
} from '../types/mission.js';
import type { MissionId, TaskId, PhaseId } from '../types/branded.js';
import { KanbanError, ErrorCodes } from '../types/errors.js';

// ============================================================================
// Kanban State Manager
// ============================================================================

export class KanbanStateManager {
  private projectRoot: string;
  private missionId: MissionId;
  private missionDir: string;
  private kanbanPath: string;

  constructor(projectRoot: string, missionId: MissionId) {
    this.projectRoot = projectRoot;
    this.missionId = missionId;
    this.missionDir = path.join(projectRoot, '.dure', 'missions', missionId);
    this.kanbanPath = path.join(this.missionDir, 'kanban.json');
  }

  /**
   * Sync KanbanState from Mission (create or update)
   */
  async syncFromMission(mission: Mission): AsyncResult<KanbanState, KanbanError> {
    const kanban = this.missionToKanban(mission);
    const saveResult = await this.save(kanban);
    if (isErr(saveResult)) return saveResult;
    return ok(kanban);
  }

  /**
   * Load KanbanState from file
   */
  async load(): AsyncResult<KanbanState, KanbanError> {
    try {
      const content = await readFile(this.kanbanPath, 'utf-8');
      return ok(JSON.parse(content) as KanbanState);
    } catch (error) {
      return err(new KanbanError(
        'Failed to load kanban state',
        ErrorCodes.KANBAN_LOAD_FAILED,
        { missionId: this.missionId, path: this.kanbanPath },
        error as Error
      ));
    }
  }

  /**
   * Save KanbanState to file (atomic write)
   */
  async save(kanban: KanbanState): AsyncResult<void, KanbanError> {
    kanban.updated_at = new Date().toISOString();

    try {
      // Ensure directory exists
      await mkdir(path.dirname(this.kanbanPath), { recursive: true });

      // Atomic write: write to temp file, then rename
      const tempPath = `${this.kanbanPath}.tmp`;
      await writeFile(tempPath, JSON.stringify(kanban, null, 2));
      await rename(tempPath, this.kanbanPath);
      return ok(undefined);
    } catch (error) {
      return err(new KanbanError(
        'Failed to save kanban state',
        ErrorCodes.KANBAN_SAVE_FAILED,
        { missionId: this.missionId, path: this.kanbanPath },
        error as Error
      ));
    }
  }

  /**
   * Update a task's status
   */
  async updateTaskStatus(
    taskId: TaskId,
    newStatus: MissionTaskStatus,
    runId?: string,
    errorMessage?: string
  ): AsyncResult<KanbanUpdate, KanbanError> {
    const loadResult = await this.load();
    if (isErr(loadResult)) return loadResult;

    const kanban = loadResult.data;
    let oldStatus: MissionTaskStatus | undefined;
    let foundPhaseId: PhaseId | undefined;

    // Find and update the card
    for (const column of kanban.columns) {
      const card = column.cards.find(c => c.task_id === taskId);
      if (card) {
        oldStatus = card.status;
        card.status = newStatus;
        if (runId) card.run_id = runId;
        if (errorMessage) card.error = errorMessage;
        foundPhaseId = card.phase_id;
        break;
      }
    }

    if (!foundPhaseId) {
      return err(new KanbanError(
        `Task ${taskId} not found in kanban`,
        ErrorCodes.KANBAN_TASK_NOT_FOUND,
        { missionId: this.missionId, taskId }
      ));
    }

    // Recalculate blocked_by for all cards
    this.recalculateBlockedBy(kanban);

    // Recalculate statistics
    this.recalculateStats(kanban);

    // Update active_task
    if (newStatus === 'in_progress') {
      kanban.active_task = {
        task_id: taskId,
        phase_id: foundPhaseId,
        run_id: runId,
        started_at: new Date().toISOString(),
      };
    } else if (kanban.active_task?.task_id === taskId) {
      kanban.active_task = undefined;
    }

    // Save updated state
    const saveResult = await this.save(kanban);
    if (isErr(saveResult)) return saveResult;

    const update: KanbanUpdate = {
      type: 'task_status',
      task_id: taskId,
      phase_id: foundPhaseId,
      old_status: oldStatus,
      new_status: newStatus,
      timestamp: new Date().toISOString(),
    };

    return ok(update);
  }

  /**
   * Update a phase's status
   */
  async updatePhaseStatus(
    phaseId: PhaseId,
    newStatus: 'pending' | 'in_progress' | 'completed' | 'failed' | 'needs_human'
  ): AsyncResult<KanbanUpdate, KanbanError> {
    const loadResult = await this.load();
    if (isErr(loadResult)) return loadResult;

    const kanban = loadResult.data;
    const column = kanban.columns.find(c => c.phase_id === phaseId);

    if (!column) {
      return err(new KanbanError(
        `Phase ${phaseId} not found in kanban`,
        ErrorCodes.KANBAN_TASK_NOT_FOUND,
        { missionId: this.missionId, phaseId }
      ));
    }

    const oldStatus = column.status;
    column.status = newStatus;

    const saveResult = await this.save(kanban);
    if (isErr(saveResult)) return saveResult;

    return ok({
      type: 'phase_status',
      phase_id: phaseId,
      old_status: oldStatus,
      new_status: newStatus,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get current kanban state (load from file)
   */
  async getState(): AsyncResult<KanbanState, KanbanError> {
    return this.load();
  }

  /**
   * Convert Mission to KanbanState
   */
  private missionToKanban(mission: Mission): KanbanState {
    const columns: KanbanColumn[] = mission.phases.map(phase => ({
      phase_id: phase.phase_id,
      number: phase.number,
      title: phase.title,
      status: phase.status,
      cards: phase.tasks.map(task => ({
        task_id: task.task_id,
        phase_id: phase.phase_id,
        title: task.title,
        status: task.status,
        run_id: task.run_id,
        error: task.error,
        depends_on: task.depends_on,
        blocked_by: [], // Calculated below
      })),
    }));

    const kanban: KanbanState = {
      mission_id: mission.mission_id,
      mission_title: mission.title,
      planning_stage: mission.planning.stage,
      columns,
      stats: {
        total_tasks: 0,
        pending: 0,
        blocked: 0,
        in_progress: 0,
        passed: 0,
        failed: 0,
        needs_human: 0,
      },
      updated_at: new Date().toISOString(),
    };

    this.recalculateBlockedBy(kanban);
    this.recalculateStats(kanban);

    return kanban;
  }

  /**
   * Recalculate blocked_by field for all cards
   * A task is blocked if any of its dependencies are not passed or skipped
   */
  private recalculateBlockedBy(kanban: KanbanState): void {
    // Build task status map
    const taskStatusMap = new Map<TaskId, MissionTaskStatus>();
    for (const column of kanban.columns) {
      for (const card of column.cards) {
        taskStatusMap.set(card.task_id, card.status);
      }
    }

    // Calculate blocked_by for each card
    for (const column of kanban.columns) {
      for (const card of column.cards) {
        card.blocked_by = card.depends_on.filter(depId => {
          const depStatus = taskStatusMap.get(depId);
          // Blocked if dependency exists and is not completed
          return depStatus && depStatus !== 'passed' && depStatus !== 'skipped';
        });

        // Update status based on blocked_by
        if (card.blocked_by.length > 0 && card.status === 'pending') {
          card.status = 'blocked';
        } else if (card.blocked_by.length === 0 && card.status === 'blocked') {
          card.status = 'pending';
        }
      }
    }
  }

  /**
   * Recalculate statistics
   */
  private recalculateStats(kanban: KanbanState): void {
    const stats: KanbanStats = {
      total_tasks: 0,
      pending: 0,
      blocked: 0,
      in_progress: 0,
      passed: 0,
      failed: 0,
      needs_human: 0,
    };

    for (const column of kanban.columns) {
      for (const card of column.cards) {
        stats.total_tasks++;
        switch (card.status) {
          case 'pending':
            stats.pending++;
            break;
          case 'blocked':
            stats.blocked++;
            break;
          case 'in_progress':
            stats.in_progress++;
            break;
          case 'passed':
            stats.passed++;
            break;
          case 'failed':
            stats.failed++;
            break;
          case 'needs_human':
            stats.needs_human++;
            break;
          case 'skipped':
            // Skipped tasks count as passed for progress tracking
            stats.passed++;
            break;
        }
      }
    }

    kanban.stats = stats;
  }

  /**
   * Find a card by task ID
   */
  private findCard(kanban: KanbanState, taskId: TaskId): KanbanCard | undefined {
    for (const column of kanban.columns) {
      const card = column.cards.find(c => c.task_id === taskId);
      if (card) return card;
    }
    return undefined;
  }
}
