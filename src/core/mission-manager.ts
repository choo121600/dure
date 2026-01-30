/**
 * Mission Manager
 * Manages mission lifecycle (creation, retrieval, execution, completion)
 */

import { readFile, writeFile, readdir, mkdir } from 'fs/promises';
import path from 'path';
import type { Result, AsyncResult } from '../types/result.js';
import { ok, err, isOk, isErr } from '../types/result.js';
import type {
  Mission,
  MissionPhase,
  MissionTask,
  PlanDraft,
  MissionTaskStatus,
  AgentConfigOverride,
  KanbanUpdate,
} from '../types/mission.js';
import type { MissionId, PhaseId, TaskId } from '../types/branded.js';
import { generateMissionId, createPhaseId, createTaskId } from '../types/branded.js';
import type { PlanningConfig } from './planning-pipeline.js';
import { PlanningPipeline, type PlanningResult } from './planning-pipeline.js';
import { MissionError, ErrorCodes } from '../types/errors.js';
import { createMissionCreatedEvent, createMissionTaskUpdateEvent } from '../types/events.js';
import { KanbanStateManager } from './kanban-state-manager.js';
import { ContextCompressor } from './context-compressor.js';

// ============================================================================
// Configuration
// ============================================================================

export interface MissionManagerConfig {
  missionsDir: string;           // .dure/missions
  runsDir: string;               // .dure/runs
  planningConfig?: Partial<PlanningConfig>;
}

/**
 * Result of running a phase
 */
export interface PhaseRunResult {
  phaseId: PhaseId;
  status: 'completed' | 'failed';
  tasksCompleted: number;
  tasksFailed: number;
  failedTask?: TaskId;
}

/**
 * Result of running a single task
 */
export interface TaskRunResult {
  taskId: TaskId;
  status: MissionTaskStatus;
  runId?: string;
  error?: string;
}

/**
 * Options for running phases/tasks
 */
export interface RunOptions {
  continueOnFailure?: boolean;
}

/**
 * Run result from Orchestrator
 */
interface RunResult {
  verdict: 'PASS' | 'FAIL' | 'NEEDS_HUMAN';
  reason?: string;
  carry_forward?: any;
}

// ============================================================================
// Mission Manager
// ============================================================================

export class MissionManager {
  private projectRoot: string;
  private config: MissionManagerConfig;
  private kanbanManagers: Map<MissionId, KanbanStateManager> = new Map();
  private contextCompressor: ContextCompressor;

  constructor(projectRoot: string, config?: Partial<MissionManagerConfig>) {
    this.projectRoot = projectRoot;
    this.config = {
      missionsDir: path.join(projectRoot, '.dure', 'missions'),
      runsDir: path.join(projectRoot, '.dure', 'runs'),
      ...config,
    };
    this.contextCompressor = new ContextCompressor();
  }

  // ============================================
  // Kanban Management
  // ============================================

  /**
   * Get or create KanbanStateManager for a mission
   */
  private getKanbanManager(missionId: MissionId): KanbanStateManager {
    if (!this.kanbanManagers.has(missionId)) {
      this.kanbanManagers.set(
        missionId,
        new KanbanStateManager(this.projectRoot, missionId)
      );
    }
    return this.kanbanManagers.get(missionId)!;
  }

  /**
   * Update kanban state for a task
   * Note: Kanban update failures are logged but don't stop execution
   */
  private async updateKanbanForTask(
    missionId: MissionId,
    taskId: TaskId,
    status: MissionTaskStatus,
    runId?: string,
    errorMessage?: string
  ): Promise<void> {
    const kanbanManager = this.getKanbanManager(missionId);

    const updateResult = await kanbanManager.updateTaskStatus(
      taskId,
      status,
      runId,
      errorMessage
    );

    if (isErr(updateResult)) {
      // Log warning but don't stop execution
      console.warn(`Failed to update kanban for task ${taskId}: ${updateResult.error.message}`);
    }
  }

  /**
   * Sync kanban state from mission (initial creation or full refresh)
   */
  private async syncKanban(mission: Mission): Promise<void> {
    const kanbanManager = this.getKanbanManager(mission.mission_id);
    const result = await kanbanManager.syncFromMission(mission);

    if (isErr(result)) {
      console.warn(`Failed to sync kanban: ${result.error.message}`);
    }
  }

  // ============================================
  // Mission Creation
  // ============================================

  /**
   * Create new mission and start planning
   */
  async createMission(description: string): AsyncResult<Mission, MissionError> {
    const missionId = generateMissionId();
    const missionDir = this.getMissionDir(missionId);

    // 1. Create directory structure
    const dirResult = await this.createMissionDirectories(missionDir);
    if (isErr(dirResult)) return dirResult;

    // 2. Save input
    const saveInputResult = await this.saveInput(missionDir, description);
    if (isErr(saveInputResult)) return saveInputResult;

    // 3. Create initial mission object
    const mission: Mission = {
      mission_id: missionId,
      title: '',  // Set after planning
      description,
      planning: {
        stage: 'planner_v1',
        iterations: 0,
        drafts: [],
        critiques: [],
      },
      phases: [],
      status: 'planning',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stats: {
        total_phases: 0,
        total_tasks: 0,
        completed_tasks: 0,
        failed_tasks: 0,
      },
    };

    // 4. Save initial state
    const saveMissionResult = await this.saveMission(mission);
    if (isErr(saveMissionResult)) return saveMissionResult;

    // 5. Emit event (if event emitter is available)
    // Note: Event emission is optional for now
    // this.emitEvent(createMissionCreatedEvent(missionId, description.slice(0, 50)));

    // 6. Start planning
    const planningResult = await this.runPlanning(mission);
    if (isErr(planningResult)) {
      mission.status = 'failed';
      await this.saveMission(mission);
      return err(planningResult.error);
    }

    // 7. Apply planning result
    const updatedMission = await this.applyPlanningResult(mission, planningResult.data);
    if (isErr(updatedMission)) return updatedMission;

    return ok(updatedMission.data);
  }

  /**
   * Run planning pipeline
   */
  private async runPlanning(mission: Mission): AsyncResult<PlanningResult, MissionError> {
    const pipeline = new PlanningPipeline(
      mission.mission_id,
      this.projectRoot,
      this.getMissionDir(mission.mission_id),
      this.config.planningConfig
    );

    const result = await pipeline.execute(mission.description);
    if (isErr(result)) {
      return err(new MissionError(
        mission.mission_id,
        `Planning failed: ${result.error.message}`,
        ErrorCodes.MISSION_PLANNING_FAILED,
        result.error
      ));
    }

    return ok(result.data);
  }

  /**
   * Apply planning result to mission
   */
  private async applyPlanningResult(
    mission: Mission,
    planningResult: PlanningResult
  ): AsyncResult<Mission, MissionError> {
    // Store critiques
    mission.planning.critiques = planningResult.critiques;
    mission.planning.iterations = planningResult.iterations;

    if (planningResult.outcome === 'approved' && planningResult.finalPlan) {
      // Plan approved: create phases
      mission.planning.stage = 'approved';
      mission.status = 'ready';

      // Extract title from first phase or use mission description
      mission.title = planningResult.finalPlan.phases[0]?.title ||
                     mission.description.slice(0, 50);

      const phasesResult = await this.createPhasesFromPlan(
        mission.mission_id,
        planningResult.finalPlan
      );
      if (isErr(phasesResult)) return phasesResult;

      mission.phases = phasesResult.data;
      mission.stats.total_phases = mission.phases.length;
      mission.stats.total_tasks = mission.phases.reduce(
        (sum, p) => sum + p.tasks.length,
        0
      );

      // Initialize kanban state
      await this.syncKanban(mission);
    } else {
      // Needs human review
      mission.planning.stage = 'needs_human';
      mission.status = 'plan_review';
    }

    mission.updated_at = new Date().toISOString();
    await this.saveMission(mission);

    return ok(mission);
  }

  // ============================================
  // Mission Retrieval
  // ============================================

  /**
   * Get mission by ID
   */
  async getMission(missionId: MissionId): AsyncResult<Mission, MissionError> {
    const missionPath = path.join(
      this.getMissionDir(missionId),
      'mission.json'
    );

    try {
      const content = await readFile(missionPath, 'utf-8');
      return ok(JSON.parse(content) as Mission);
    } catch (error) {
      return err(new MissionError(
        missionId,
        `Mission not found: ${missionId}`,
        ErrorCodes.MISSION_NOT_FOUND,
        error as Error
      ));
    }
  }

  /**
   * List all missions
   */
  async listMissions(): AsyncResult<Mission[], MissionError> {
    try {
      // Ensure missions directory exists
      await mkdir(this.config.missionsDir, { recursive: true });

      const entries = await readdir(this.config.missionsDir, { withFileTypes: true });
      const missions: Mission[] = [];

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('mission-')) {
          const result = await this.getMission(entry.name as MissionId);
          if (isOk(result)) {
            missions.push(result.data);
          }
        }
      }

      // Sort by creation date (newest first)
      missions.sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      return ok(missions);
    } catch (error) {
      return err(new MissionError(
        '' as MissionId,
        'Failed to list missions',
        ErrorCodes.FS_READ_FAILED,
        error as Error
      ));
    }
  }

  // ============================================
  // Mission Execution
  // ============================================

  /**
   * Run phase - executes all tasks in a phase sequentially
   */
  async runPhase(
    missionId: MissionId,
    phaseNumber: number,
    options?: RunOptions
  ): AsyncResult<PhaseRunResult, MissionError> {
    const missionResult = await this.getMission(missionId);
    if (isErr(missionResult)) return missionResult;

    const mission = missionResult.data;
    const phase = mission.phases.find(p => p.number === phaseNumber);

    if (!phase) {
      return err(new MissionError(
        missionId,
        `Phase ${phaseNumber} not found`,
        ErrorCodes.MISSION_PHASE_NOT_FOUND
      ));
    }

    // Check if previous phase is completed
    if (phaseNumber > 1) {
      const prevPhase = mission.phases.find(p => p.number === phaseNumber - 1);
      if (prevPhase && prevPhase.status !== 'completed') {
        return err(new MissionError(
          missionId,
          `Previous phase (${phaseNumber - 1}) not completed`,
          ErrorCodes.MISSION_PHASE_NOT_READY
        ));
      }
    }

    // Update phase status
    phase.status = 'in_progress';
    phase.started_at = new Date().toISOString();
    mission.status = 'in_progress';
    mission.stats.current_phase = phaseNumber;
    await this.saveMission(mission);

    // Load previous phase context
    const context = await this.loadPhaseContextInternal(missionId, phaseNumber - 1);

    // Execute tasks sequentially
    const results: TaskRunResult[] = [];
    let failedTask: MissionTask | null = null;

    for (const task of phase.tasks) {
      // Check dependencies
      if (!this.areDependenciesMet(task, phase.tasks)) {
        task.status = 'blocked';
        continue;
      }

      const taskResult = await this.runSingleTask(
        mission,
        phase,
        task,
        context,
        options
      );

      if (isErr(taskResult)) {
        return err(taskResult.error);
      }

      results.push(taskResult.data);

      if (taskResult.data.status === 'failed') {
        failedTask = task;
        if (!options?.continueOnFailure) {
          break;
        }
      }
    }

    // Aggregate phase results
    const completedTasks = results.filter(r => r.status === 'passed').length;
    const failedTasks = results.filter(r => r.status === 'failed').length;

    if (failedTasks === 0) {
      phase.status = 'completed';
      phase.completed_at = new Date().toISOString();

      // Create phase context for next phase
      await this.createPhaseContext(mission, phase);
    } else {
      phase.status = 'failed';
    }

    mission.stats.completed_tasks += completedTasks;
    mission.stats.failed_tasks = failedTasks;

    // Check if all phases are completed
    if (this.areAllPhasesCompleted(mission)) {
      mission.status = 'completed';
      mission.completed_at = new Date().toISOString();
    }

    await this.saveMission(mission);

    return ok({
      phaseId: phase.phase_id,
      status: phase.status as 'completed' | 'failed',
      tasksCompleted: completedTasks,
      tasksFailed: failedTasks,
      failedTask: failedTask?.task_id,
    });
  }

  /**
   * Run individual task
   */
  async runTask(
    missionId: MissionId,
    taskId: TaskId
  ): AsyncResult<TaskRunResult, MissionError> {
    const missionResult = await this.getMission(missionId);
    if (isErr(missionResult)) return missionResult;

    const mission = missionResult.data;

    // Find the task and its phase
    let targetPhase: MissionPhase | undefined;
    let targetTask: MissionTask | undefined;

    for (const phase of mission.phases) {
      const task = phase.tasks.find(t => t.task_id === taskId);
      if (task) {
        targetPhase = phase;
        targetTask = task;
        break;
      }
    }

    if (!targetPhase || !targetTask) {
      return err(new MissionError(
        missionId,
        `Task ${taskId} not found`,
        ErrorCodes.MISSION_TASK_NOT_FOUND
      ));
    }

    // Check dependencies
    if (!this.areDependenciesMet(targetTask, targetPhase.tasks)) {
      return err(new MissionError(
        missionId,
        `Task ${taskId} has unmet dependencies`,
        ErrorCodes.MISSION_TASK_BLOCKED
      ));
    }

    // Load phase context
    const context = await this.loadPhaseContextInternal(missionId, targetPhase.number - 1);

    // Execute the task
    return await this.runSingleTask(mission, targetPhase, targetTask, context);
  }

  /**
   * Execute a single task through the Dure pipeline
   */
  private async runSingleTask(
    mission: Mission,
    phase: MissionPhase,
    task: MissionTask,
    previousContext: string | null,
    options?: RunOptions
  ): AsyncResult<TaskRunResult, MissionError> {
    // Update task status
    task.status = 'in_progress';
    task.started_at = new Date().toISOString();
    await this.saveMission(mission);

    // Update kanban: task started
    await this.updateKanbanForTask(
      mission.mission_id,
      task.task_id,
      'in_progress'
    );

    try {
      // Load briefing
      const briefing = await this.loadTaskBriefing(task.briefing_path);
      if (isErr(briefing)) {
        throw new Error(`Failed to load briefing: ${briefing.error.message}`);
      }

      // Inject context from previous phase
      let fullBriefing = briefing.data;
      if (previousContext) {
        fullBriefing = `## Previous Context\n\n${previousContext}\n\n---\n\n${fullBriefing}`;
      }

      // Start Dure Run
      const runId = await this.startDureRun(fullBriefing, task.agent_config);
      task.run_id = runId;
      await this.saveMission(mission);

      // Wait for run completion
      const runResult = await this.waitForRunCompletion(runId);

      // Update task based on result
      if (runResult.verdict === 'PASS') {
        task.status = 'passed';
        task.carry_forward = runResult.carry_forward;
      } else if (runResult.verdict === 'NEEDS_HUMAN') {
        task.status = 'needs_human';
      } else {
        task.status = 'failed';
        task.error = runResult.reason;
      }

      task.completed_at = new Date().toISOString();
      await this.saveMission(mission);

      // Update kanban: task completed
      await this.updateKanbanForTask(
        mission.mission_id,
        task.task_id,
        task.status,
        task.run_id,
        task.error
      );

      return ok({
        taskId: task.task_id,
        status: task.status,
        runId,
        error: task.error,
      });

    } catch (error) {
      task.status = 'failed';
      task.error = (error as Error).message;
      task.completed_at = new Date().toISOString();
      await this.saveMission(mission);

      // Update kanban: task failed
      await this.updateKanbanForTask(
        mission.mission_id,
        task.task_id,
        'failed',
        task.run_id,
        task.error
      );

      return ok({
        taskId: task.task_id,
        status: 'failed',
        error: task.error,
      });
    }
  }

  /**
   * Start a Dure Run using the Orchestrator
   */
  private async startDureRun(
    briefing: string,
    agentConfig?: AgentConfigOverride
  ): Promise<string> {
    // Note: This is a simplified implementation
    // In production, we would need to properly initialize Orchestrator
    // For now, we'll use the existing start command logic
    const Orchestrator = (await import('./orchestrator.js')).Orchestrator;
    const { ConfigManager } = await import('../config/config-manager.js');

    const configManager = new ConfigManager(this.projectRoot);
    const config = configManager.loadConfig();
    const orchestrator = new Orchestrator(this.projectRoot, config);

    const runId = await orchestrator.startRun(briefing);
    return runId;
  }

  /**
   * Wait for a run to complete and return the result
   */
  private async waitForRunCompletion(runId: string): Promise<RunResult> {
    // Poll for completion by checking MRP or verdict.json
    const runDir = path.join(this.config.runsDir, runId);
    const verdictPath = path.join(runDir, 'gatekeeper', 'verdict.json');
    const mrpPath = path.join(runDir, 'mrp');

    // Simple polling implementation
    const maxWaitTime = 3600000; // 1 hour
    const pollInterval = 2000; // 2 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Check if verdict.json exists
        const verdictContent = await readFile(verdictPath, 'utf-8');
        const verdict = JSON.parse(verdictContent);
        return {
          verdict: verdict.verdict,
          reason: verdict.reason,
          carry_forward: verdict.carry_forward,
        };
      } catch {
        // File doesn't exist yet, continue polling
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Run completion timeout');
  }

  /**
   * Load phase context from previous phase
   */
  async loadPhaseContext(
    missionId: MissionId,
    phaseNumber: number
  ): AsyncResult<string | null, MissionError> {
    if (phaseNumber < 1) return ok(null);

    const contextPath = path.join(
      this.getMissionDir(missionId),
      'context',
      `phase-${phaseNumber}-summary.md`
    );

    try {
      const content = await readFile(contextPath, 'utf-8');
      return ok(content);
    } catch {
      // Context not found is not an error
      return ok(null);
    }
  }

  /**
   * Load phase context (internal helper that returns string | null)
   */
  private async loadPhaseContextInternal(
    missionId: MissionId,
    phaseNumber: number
  ): Promise<string | null> {
    const result = await this.loadPhaseContext(missionId, phaseNumber);
    return isOk(result) ? result.data : null;
  }

  /**
   * Create phase context after phase completion
   */
  private async createPhaseContext(
    mission: Mission,
    phase: MissionPhase
  ): Promise<void> {
    // Use ContextCompressor to generate structured context
    const contextResult = this.contextCompressor.compressPhase(phase);

    if (isErr(contextResult)) {
      console.warn(`Failed to compress phase context: ${contextResult.error.message}`);
      return;
    }

    const phaseContext = contextResult.data;

    // Update phase summary in mission
    phase.summary = {
      phase_id: phase.phase_id,
      completed_at: phase.completed_at || new Date().toISOString(),
      tasks_completed: phase.tasks.filter(t => t.status === 'passed').length,
      tasks_failed: phase.tasks.filter(t => t.status === 'failed').length,
      tasks_skipped: phase.tasks.filter(t => t.status === 'skipped').length,
      key_artifacts: phaseContext.all_artifacts,
      context_for_next: phaseContext.next_phase_context,
    };

    // Save context to file for next phase
    const contextPath = path.join(
      this.getMissionDir(mission.mission_id),
      'context',
      `phase-${phase.number}-summary.md`
    );

    try {
      await mkdir(path.dirname(contextPath), { recursive: true });
      await writeFile(contextPath, phaseContext.next_phase_context, 'utf-8');
    } catch (error) {
      console.warn(`Failed to save phase context file: ${(error as Error).message}`);
    }

    // Save updated mission
    await this.saveMission(mission);
  }

  /**
   * Load task briefing from file
   */
  private async loadTaskBriefing(briefingPath: string): AsyncResult<string, MissionError> {
    const fullPath = path.isAbsolute(briefingPath)
      ? briefingPath
      : path.join(this.projectRoot, briefingPath);

    try {
      const content = await readFile(fullPath, 'utf-8');
      return ok(content);
    } catch (error) {
      return err(new MissionError(
        '' as MissionId,
        `Failed to load briefing from ${briefingPath}`,
        ErrorCodes.FS_READ_FAILED,
        error as Error
      ));
    }
  }

  /**
   * Check if all task dependencies are met
   */
  private areDependenciesMet(task: MissionTask, allTasks: MissionTask[]): boolean {
    if (task.depends_on.length === 0) return true;

    for (const depId of task.depends_on) {
      const depTask = allTasks.find(t => t.task_id === depId);
      if (!depTask || depTask.status !== 'passed') {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if all phases are completed
   */
  private areAllPhasesCompleted(mission: Mission): boolean {
    return mission.phases.every(p => p.status === 'completed');
  }

  // ============================================
  // Internal Helpers
  // ============================================

  /**
   * Get mission directory path
   */
  private getMissionDir(missionId: MissionId): string {
    return path.join(this.config.missionsDir, missionId);
  }

  /**
   * Create mission directory structure
   */
  private async createMissionDirectories(missionDir: string): AsyncResult<void, MissionError> {
    const dirs = [
      missionDir,
      path.join(missionDir, 'planning'),
      path.join(missionDir, 'phases'),
      path.join(missionDir, 'context'),
    ];

    try {
      for (const dir of dirs) {
        await mkdir(dir, { recursive: true });
      }
      return ok(undefined);
    } catch (error) {
      return err(new MissionError(
        '' as MissionId,
        'Failed to create mission directories',
        ErrorCodes.FS_WRITE_FAILED,
        error as Error
      ));
    }
  }

  /**
   * Save mission state (atomic write)
   */
  private async saveMission(mission: Mission): AsyncResult<void, MissionError> {
    const missionPath = path.join(
      this.getMissionDir(mission.mission_id),
      'mission.json'
    );
    const tmpPath = `${missionPath}.tmp`;

    try {
      // Atomic write pattern
      await writeFile(tmpPath, JSON.stringify(mission, null, 2));
      await writeFile(missionPath, JSON.stringify(mission, null, 2));
      return ok(undefined);
    } catch (error) {
      return err(new MissionError(
        mission.mission_id,
        'Failed to save mission state',
        ErrorCodes.STATE_SAVE_FAILED,
        error as Error
      ));
    }
  }

  /**
   * Save input description
   */
  private async saveInput(missionDir: string, description: string): AsyncResult<void, MissionError> {
    const inputPath = path.join(missionDir, 'input.md');
    try {
      await writeFile(inputPath, description);
      return ok(undefined);
    } catch (error) {
      return err(new MissionError(
        '' as MissionId,
        'Failed to save input description',
        ErrorCodes.FS_WRITE_FAILED,
        error as Error
      ));
    }
  }

  /**
   * Convert PlanDraft to Phase/Task structure
   */
  private async createPhasesFromPlan(
    missionId: MissionId,
    plan: PlanDraft
  ): AsyncResult<MissionPhase[], MissionError> {
    const phases: MissionPhase[] = [];

    for (const phaseDraft of plan.phases) {
      // The phaseDraft is already a MissionPhase (minus some fields)
      // We just need to add the missing execution state fields
      phases.push({
        ...phaseDraft,
        mission_id: missionId,
        status: 'pending',
      });
    }

    return ok(phases);
  }

  // ============================================
  // Plan Management
  // ============================================

  /**
   * Approve a pending mission plan
   */
  async approvePlan(missionId: MissionId): AsyncResult<void, MissionError> {
    const missionResult = await this.getMission(missionId);
    if (isErr(missionResult)) return missionResult;

    const mission = missionResult.data;

    if (mission.planning.stage !== 'needs_human') {
      return err(new MissionError(
        missionId,
        'Plan is not awaiting approval',
        ErrorCodes.MISSION_PLANNING_FAILED
      ));
    }

    mission.planning.stage = 'approved';
    mission.status = 'ready';
    mission.updated_at = new Date().toISOString();

    // Initialize kanban state
    await this.syncKanban(mission);

    return await this.saveMission(mission);
  }

  // ============================================
  // Task Management
  // ============================================

  /**
   * Retry a failed task
   */
  async retryTask(
    missionId: MissionId,
    taskId: TaskId
  ): AsyncResult<string, MissionError> {
    const missionResult = await this.getMission(missionId);
    if (isErr(missionResult)) return missionResult;

    const mission = missionResult.data;

    // Find the task
    let targetTask: MissionTask | undefined;
    let targetPhase: MissionPhase | undefined;

    for (const phase of mission.phases) {
      const task = phase.tasks.find(t => t.task_id === taskId);
      if (task) {
        targetTask = task;
        targetPhase = phase;
        break;
      }
    }

    if (!targetTask) {
      return err(new MissionError(
        missionId,
        `Task ${taskId} not found`,
        ErrorCodes.MISSION_TASK_NOT_FOUND
      ));
    }

    if (targetTask.status !== 'failed' && targetTask.status !== 'needs_human') {
      return err(new MissionError(
        missionId,
        `Task ${taskId} is not in a retriable state`,
        ErrorCodes.MISSION_TASK_BLOCKED
      ));
    }

    // Reset task state
    targetTask.status = 'pending';
    targetTask.error = undefined;
    targetTask.run_id = undefined;
    targetTask.completed_at = undefined;
    mission.stats.failed_tasks = Math.max(0, mission.stats.failed_tasks - 1);
    await this.saveMission(mission);

    // Update kanban
    await this.updateKanbanForTask(missionId, taskId, 'pending');

    // Run the task again
    const result = await this.runTask(missionId, taskId);
    if (isErr(result)) return err(result.error);

    return ok(result.data.runId || '');
  }

  /**
   * Skip a task
   */
  async skipTask(
    missionId: MissionId,
    taskId: TaskId,
    reason?: string
  ): AsyncResult<void, MissionError> {
    const missionResult = await this.getMission(missionId);
    if (isErr(missionResult)) return missionResult;

    const mission = missionResult.data;

    // Find the task
    let targetTask: MissionTask | undefined;

    for (const phase of mission.phases) {
      const task = phase.tasks.find(t => t.task_id === taskId);
      if (task) {
        targetTask = task;
        break;
      }
    }

    if (!targetTask) {
      return err(new MissionError(
        missionId,
        `Task ${taskId} not found`,
        ErrorCodes.MISSION_TASK_NOT_FOUND
      ));
    }

    // Mark as skipped
    targetTask.status = 'skipped';
    targetTask.error = reason || 'Skipped by user';
    targetTask.completed_at = new Date().toISOString();

    mission.updated_at = new Date().toISOString();
    await this.saveMission(mission);

    // Update kanban
    await this.updateKanbanForTask(missionId, taskId, 'skipped', undefined, reason);

    return ok(undefined);
  }

  // ============================================
  // Mission Deletion
  // ============================================

  /**
   * Delete a mission and all its files
   */
  async deleteMission(missionId: MissionId): AsyncResult<void, MissionError> {
    const missionDir = this.getMissionDir(missionId);
    const { rm } = await import('fs/promises');

    try {
      await rm(missionDir, { recursive: true, force: true });
      this.kanbanManagers.delete(missionId);
      return ok(undefined);
    } catch (error) {
      return err(new MissionError(
        missionId,
        `Failed to delete mission: ${(error as Error).message}`,
        ErrorCodes.FS_WRITE_FAILED,
        error as Error
      ));
    }
  }

}
