/**
 * Planning Pipeline
 * Orchestrates Planner↔Critic iteration with convergence handling
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import type { Result, AsyncResult } from '../types/result.js';
import { ok, err, isOk, isErr } from '../types/result.js';
import type { MissionId } from '../types/branded.js';
import type { PlanDraft, Critique, CritiqueItem } from '../types/mission.js';
import { PlanningError, ErrorCodes } from '../types/errors.js';
import {
  createPlanningStageStartedEvent,
  createPlanningStageCompletedEvent,
  createPlanApprovedEvent,
  type OrchestratorEventTyped,
} from '../types/events.js';

// ============================================================================
// Configuration
// ============================================================================

export interface PlanningConfig {
  maxIterations: number;
  plannerModel: 'haiku' | 'sonnet' | 'opus';
  criticModel: 'haiku' | 'sonnet' | 'opus';
  autoApproveThreshold: {
    critical: number;
    major: number;
    minor: number;
  };
  convergenceThreshold: number; // Overlap threshold for convergence failure (0.0-1.0)
}

export const DEFAULT_PLANNING_CONFIG: PlanningConfig = {
  maxIterations: 2,
  plannerModel: 'sonnet',
  criticModel: 'sonnet',
  autoApproveThreshold: {
    critical: 0,
    major: 0,
    minor: 3,
  },
  convergenceThreshold: 0.7,
};

// ============================================================================
// Result Types
// ============================================================================

export interface PlanningResult {
  missionId: MissionId;
  finalPlan: PlanDraft | null;
  critiques: Critique[];
  iterations: number;
  outcome: 'approved' | 'needs_human' | 'failed';
  error?: string;
}

interface PlanningState {
  iteration: number;
  stage: 'planner' | 'critic' | 'done';
  lastDraftVersion: number;
  lastCritiqueVersion: number;
}

// ============================================================================
// Planning Pipeline
// ============================================================================

export class PlanningPipeline extends EventEmitter {
  private config: PlanningConfig;
  private projectRoot: string;
  private missionDir: string;
  private missionId: MissionId;

  constructor(
    missionId: MissionId,
    projectRoot: string,
    missionDir: string,
    config?: Partial<PlanningConfig>
  ) {
    super();
    this.missionId = missionId;
    this.projectRoot = projectRoot;
    this.missionDir = missionDir;
    this.config = { ...DEFAULT_PLANNING_CONFIG, ...config };
  }

  /**
   * Planning pipeline execution
   * Planner → Critic → (iteration) → result
   */
  async execute(
    missionDescription: string,
    previousContext?: string
  ): AsyncResult<PlanningResult, PlanningError> {
    const critiques: Critique[] = [];
    let currentDraft: PlanDraft | null = null;
    let iteration = 0;

    // Ensure planning directory exists
    const planningDir = path.join(this.missionDir, 'planning');
    await mkdir(planningDir, { recursive: true });

    while (iteration < this.config.maxIterations) {
      iteration++;

      // 1. Planner execution
      this.emitEvent(
        createPlanningStageStartedEvent(this.missionId, 'planner', iteration)
      );

      const planResult = await this.runPlanner(
        missionDescription,
        previousContext,
        critiques[critiques.length - 1]
      );

      if (isErr(planResult)) {
        return planResult;
      }

      currentDraft = planResult.data;
      const saveDraftResult = await this.saveDraft(currentDraft, iteration);
      if (isErr(saveDraftResult)) {
        return saveDraftResult;
      }

      this.emitEvent(
        createPlanningStageCompletedEvent(
          this.missionId,
          'planner',
          iteration,
          'success'
        )
      );

      // 2. Critic execution
      this.emitEvent(
        createPlanningStageStartedEvent(this.missionId, 'critic', iteration)
      );

      const critiqueResult = await this.runCritic(
        missionDescription,
        currentDraft,
        critiques
      );

      if (isErr(critiqueResult)) {
        return critiqueResult;
      }

      const critique = critiqueResult.data;
      critiques.push(critique);
      const saveCritiqueResult = await this.saveCritique(critique, iteration);
      if (isErr(saveCritiqueResult)) {
        return saveCritiqueResult;
      }

      this.emitEvent(
        createPlanningStageCompletedEvent(
          this.missionId,
          'critic',
          iteration,
          critique.verdict === 'approved' ? 'success' : critique.verdict
        )
      );

      // 3. Convergence check
      if (this.isConvergenceFailed(critiques)) {
        return ok({
          missionId: this.missionId,
          finalPlan: currentDraft,
          critiques,
          iterations: iteration,
          outcome: 'needs_human',
          error: 'Planner and Critic could not converge on a plan',
        });
      }

      // 4. Verdict check
      if (
        critique.verdict === 'approved' ||
        this.shouldAutoApprove(critique)
      ) {
        const saveFinalResult = await this.saveFinalPlan(currentDraft);
        if (isErr(saveFinalResult)) {
          return saveFinalResult;
        }

        this.emitEvent(
          createPlanApprovedEvent(
            this.missionId,
            currentDraft.phases.length,
            currentDraft.phases.reduce((sum, p) => sum + p.tasks.length, 0),
            'auto'
          )
        );

        return ok({
          missionId: this.missionId,
          finalPlan: currentDraft,
          critiques,
          iterations: iteration,
          outcome: 'approved',
        });
      }

      if (critique.verdict === 'needs_human') {
        return ok({
          missionId: this.missionId,
          finalPlan: currentDraft,
          critiques,
          iterations: iteration,
          outcome: 'needs_human',
        });
      }

      // needs_revision: continue iteration
    }

    // Max iterations reached
    return ok({
      missionId: this.missionId,
      finalPlan: currentDraft,
      critiques,
      iterations: iteration,
      outcome: 'needs_human',
      error: `Max iterations (${this.config.maxIterations}) reached without convergence`,
    });
  }

  /**
   * Run Planner agent
   */
  private async runPlanner(
    missionDescription: string,
    previousContext?: string,
    previousCritique?: Critique
  ): AsyncResult<PlanDraft, PlanningError> {
    // 1. Load prompt template
    const templateResult = await this.loadPrompt('planner');
    if (isErr(templateResult)) {
      return templateResult;
    }

    // 2. Format revision instructions if critique exists
    let revisionInstructions = 'None';
    if (previousCritique) {
      revisionInstructions = this.formatRevisionInstructions(previousCritique);
    }

    // 3. Substitute variables
    const prompt = this.substituteVariables(templateResult.data, {
      mission_description: missionDescription,
      previous_context: previousContext || 'None',
      revision_instructions: revisionInstructions,
    });

    // TODO: Call Claude Code CLI in headless mode to execute planner
    // For now, return a mock error indicating implementation needed
    return err(
      new PlanningError(
        'Planner execution not yet implemented',
        ErrorCodes.PLANNING_FAILED,
        { stage: 'planner' }
      )
    );
  }

  /**
   * Run Critic agent
   */
  private async runCritic(
    missionDescription: string,
    planDraft: PlanDraft,
    previousCritiques: Critique[]
  ): AsyncResult<Critique, PlanningError> {
    // 1. Load prompt template
    const templateResult = await this.loadPrompt('critic');
    if (isErr(templateResult)) {
      return templateResult;
    }

    // 2. Format previous critiques
    const previousCritiquesText =
      previousCritiques.length > 0
        ? JSON.stringify(previousCritiques, null, 2)
        : 'None';

    // 3. Substitute variables
    const prompt = this.substituteVariables(templateResult.data, {
      mission_description: missionDescription,
      plan_version: String(planDraft.version),
      plan_json: JSON.stringify(planDraft, null, 2),
      previous_critiques: previousCritiquesText,
    });

    // TODO: Call Claude Code CLI in headless mode to execute critic
    // For now, return a mock error indicating implementation needed
    return err(
      new PlanningError(
        'Critic execution not yet implemented',
        ErrorCodes.PLANNING_FAILED,
        { stage: 'critic' }
      )
    );
  }

  /**
   * Critique auto-approve check
   */
  private shouldAutoApprove(critique: Critique): boolean {
    const { critical, major, minor } = critique.stats;
    const threshold = this.config.autoApproveThreshold;

    return (
      critical <= threshold.critical &&
      major <= threshold.major &&
      minor <= threshold.minor
    );
  }

  /**
   * Calculate overlap between two critiques
   * Returns ratio of overlapping issues (0.0 to 1.0)
   */
  private calculateOverlap(prev: Critique, curr: Critique): number {
    if (prev.items.length === 0) return 0;

    const prevIds = new Set(
      prev.items.map(
        (item) =>
          `${item.category}:${item.target.type}:${item.target.id || 'global'}`
      )
    );

    let overlap = 0;
    for (const item of curr.items) {
      const key = `${item.category}:${item.target.type}:${item.target.id || 'global'}`;
      if (prevIds.has(key)) {
        overlap++;
      }
    }

    return overlap / prev.items.length;
  }

  /**
   * Check if convergence has failed (same issues repeated)
   */
  private isConvergenceFailed(critiques: Critique[]): boolean {
    if (critiques.length < 2) return false;

    const prev = critiques[critiques.length - 2];
    const curr = critiques[critiques.length - 1];

    return this.calculateOverlap(prev, curr) > this.config.convergenceThreshold;
  }

  /**
   * Format critique items as revision instructions for Planner
   */
  private formatRevisionInstructions(critique: Critique): string {
    const lines: string[] = [
      '## Revision Required',
      '',
      `Previous plan received ${critique.items.length} feedback items.`,
      'Please address the following issues:',
      '',
    ];

    // Include critical and major items only
    const importantItems = critique.items.filter(
      (item) => item.severity === 'critical' || item.severity === 'major'
    );

    for (const item of importantItems) {
      lines.push(`### ${item.id}: ${item.title}`);
      lines.push(`- **Severity**: ${item.severity}`);
      lines.push(`- **Category**: ${item.category}`);
      lines.push(
        `- **Target**: ${item.target.type}${item.target.id ? ` (${item.target.id})` : ''}`
      );
      lines.push(`- **Issue**: ${item.description}`);
      if (item.suggestion) {
        lines.push(`- **Suggestion**: ${item.suggestion}`);
      }
      lines.push('');
    }

    if (critique.items.length > importantItems.length) {
      lines.push(
        `(${critique.items.length - importantItems.length} minor/suggestion items omitted)`
      );
    }

    return lines.join('\n');
  }

  /**
   * Load prompt template from file
   */
  private async loadPrompt(
    templateName: 'planner' | 'critic'
  ): AsyncResult<string, PlanningError> {
    const templatePath = path.join(
      this.projectRoot,
      'templates/prompts',
      `${templateName}.md`
    );

    try {
      const content = await readFile(templatePath, 'utf-8');
      return ok(content);
    } catch (error) {
      return err(
        new PlanningError(
          `Failed to load ${templateName} template`,
          ErrorCodes.FS_READ_FAILED,
          { stage: templateName, path: templatePath },
          error as Error
        )
      );
    }
  }

  /**
   * Substitute template variables
   */
  private substituteVariables(
    template: string,
    variables: Record<string, string>
  ): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  /**
   * Save plan draft to file
   */
  private async saveDraft(
    draft: PlanDraft,
    version: number
  ): AsyncResult<void, PlanningError> {
    const draftPath = path.join(
      this.missionDir,
      'planning',
      `draft-v${version}.json`
    );

    try {
      await writeFile(draftPath, JSON.stringify(draft, null, 2));
      return ok(undefined);
    } catch (error) {
      return err(
        new PlanningError(
          `Failed to save plan draft v${version}`,
          ErrorCodes.FS_WRITE_FAILED,
          { stage: 'planner', iteration: version, path: draftPath },
          error as Error
        )
      );
    }
  }

  /**
   * Save critique to file
   */
  private async saveCritique(
    critique: Critique,
    version: number
  ): AsyncResult<void, PlanningError> {
    const critiquePath = path.join(
      this.missionDir,
      'planning',
      `critique-v${version}.json`
    );

    try {
      await writeFile(critiquePath, JSON.stringify(critique, null, 2));
      return ok(undefined);
    } catch (error) {
      return err(
        new PlanningError(
          `Failed to save critique v${version}`,
          ErrorCodes.FS_WRITE_FAILED,
          { stage: 'critic', iteration: version, path: critiquePath },
          error as Error
        )
      );
    }
  }

  /**
   * Save final approved plan
   */
  private async saveFinalPlan(draft: PlanDraft): AsyncResult<void, PlanningError> {
    const finalPath = path.join(this.missionDir, 'planning', 'final.json');

    try {
      await writeFile(finalPath, JSON.stringify(draft, null, 2));
      return ok(undefined);
    } catch (error) {
      return err(
        new PlanningError(
          'Failed to save final plan',
          ErrorCodes.FS_WRITE_FAILED,
          { path: finalPath },
          error as Error
        )
      );
    }
  }

  /**
   * Save planning state for recovery
   */
  private async saveState(state: PlanningState): AsyncResult<void, PlanningError> {
    const statePath = path.join(this.missionDir, 'planning', 'state.json');

    try {
      await writeFile(statePath, JSON.stringify(state, null, 2));
      return ok(undefined);
    } catch (error) {
      return err(
        new PlanningError(
          'Failed to save planning state',
          ErrorCodes.FS_WRITE_FAILED,
          { path: statePath },
          error as Error
        )
      );
    }
  }

  /**
   * Load planning state for recovery
   */
  async loadState(): AsyncResult<PlanningState | null, PlanningError> {
    const statePath = path.join(this.missionDir, 'planning', 'state.json');

    try {
      const content = await readFile(statePath, 'utf-8');
      return ok(JSON.parse(content) as PlanningState);
    } catch {
      return ok(null);
    }
  }

  /**
   * Emit orchestrator event
   */
  private emitEvent(event: OrchestratorEventTyped): void {
    this.emit(event.type, event);
  }
}
