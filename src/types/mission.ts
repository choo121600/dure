/**
 * Mission Planning System Types
 *
 * Core entity types for the Mission Planning system that breaks down
 * large projects into phases and tasks, each executing through the
 * Dure agent pipeline (REFINE → BUILD → VERIFY → GATE).
 */

import type { MissionId, PhaseId, TaskId } from './branded.js';
import type { AgentModel } from './index.js';

// ============================================================================
// Forward Declarations (to be defined in Task 1.4)
// ============================================================================

/**
 * Placeholder for CarryForward type (defined in Task 1.4)
 * Represents the output from Gatekeeper that gets carried forward to next tasks
 */
export type CarryForward = any;

/**
 * Placeholder for Critique type (defined in Task 1.4)
 * Represents feedback from the Critic agent during planning phase
 */
export type Critique = any;

// ============================================================================
// Task Types
// ============================================================================

/**
 * Status of an individual task within a phase
 */
export type MissionTaskStatus =
  | 'pending'      // Waiting to be executed
  | 'blocked'      // Waiting for dependencies to complete
  | 'in_progress'  // Currently executing
  | 'passed'       // Successfully completed
  | 'failed'       // Execution failed
  | 'skipped'      // Intentionally skipped
  | 'needs_human'; // Requires human intervention

/**
 * Agent configuration override for a specific task
 * Allows per-task customization of agent behavior and models
 */
export interface AgentConfigOverride {
  model_selection?: {
    builder?: AgentModel;
    verifier?: AgentModel;
  };
  max_iterations?: number;
  timeout_ms?: number;
}

/**
 * Individual task within a phase
 * Each task runs through the full Dure pipeline (REFINE → BUILD → VERIFY → GATE)
 */
export interface MissionTask {
  task_id: TaskId;
  phase_id: PhaseId;
  title: string;                      // Brief descriptive title
  description: string;                // Detailed task description
  briefing_path: string;              // Path to briefing.md file

  // Agent configuration
  agent_config?: AgentConfigOverride; // Optional per-task agent settings

  // Dependencies
  depends_on: TaskId[];               // Tasks that must complete before this one

  // Execution state
  status: MissionTaskStatus;
  run_id?: string;                    // Associated Run ID once executed
  started_at?: string;                // ISO timestamp
  completed_at?: string;              // ISO timestamp
  error?: string;                     // Error message if failed

  // Results
  carry_forward?: CarryForward;       // Output from Gatekeeper to pass to dependent tasks
}

// ============================================================================
// Phase Types
// ============================================================================

/**
 * Status of a phase (collection of tasks)
 */
export type PhaseStatus =
  | 'pending'       // Not started yet
  | 'in_progress'   // At least one task is running
  | 'completed'     // All tasks completed successfully
  | 'failed'        // One or more tasks failed
  | 'needs_human';  // Human intervention required

/**
 * Summary generated when a phase completes
 * Provides context for the next phase
 */
export interface PhaseSummary {
  phase_id: PhaseId;
  completed_at: string;
  tasks_completed: number;
  tasks_failed: number;
  tasks_skipped: number;
  key_artifacts: string[];            // Important files created in this phase
  context_for_next: string;           // Compressed context for next phase
}

/**
 * MissionPhase - a logical grouping of related tasks
 * Tasks within a phase may have dependencies on each other
 * (Named MissionPhase to avoid conflict with execution Phase type)
 */
export interface MissionPhase {
  phase_id: PhaseId;
  mission_id: MissionId;
  number: number;                     // Phase number (1, 2, 3, ...)
  title: string;                      // Phase title
  description: string;                // Phase description

  tasks: MissionTask[];               // All tasks in this phase

  // State
  status: PhaseStatus;
  started_at?: string;
  completed_at?: string;

  // Summary generated when phase completes
  summary?: PhaseSummary;
}

// ============================================================================
// Mission Types
// ============================================================================

/**
 * Overall mission status
 */
export type MissionStatus =
  | 'planning'        // Planner/Critic agents are designing the mission
  | 'plan_review'     // Waiting for human approval of the plan
  | 'ready'           // Plan approved, ready to execute
  | 'in_progress'     // Executing tasks
  | 'completed'       // All phases and tasks completed
  | 'failed'          // Mission failed
  | 'cancelled';      // Mission cancelled by user

/**
 * Planning stage during mission initialization
 * Uses Planner and Critic agents to iterate on the plan
 */
export type PlanningStage =
  | 'planner_v1'      // First planning draft
  | 'critic_v1'       // First critique
  | 'planner_v2'      // Revised plan after first critique
  | 'critic_v2'       // Second critique
  | 'approved'        // Plan approved (by critic or human)
  | 'needs_human';    // Requires human review

/**
 * Draft plan created by Planner agent
 */
export interface PlanDraft {
  version: number;                    // Plan version (1 or 2)
  created_at: string;
  phases: Omit<MissionPhase, 'status' | 'started_at' | 'completed_at' | 'summary'>[];
}

/**
 * Statistics about mission progress
 */
export interface MissionStats {
  total_phases: number;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  current_phase?: number;             // Current phase number
}

/**
 * Mission - the top-level entity representing a multi-phase project
 *
 * Workflow:
 * 1. Planning: Planner/Critic iterate to create a multi-phase plan
 * 2. Review: Human reviews and approves the plan
 * 3. Execution: Tasks execute sequentially/in-parallel based on dependencies
 * 4. Completion: All tasks complete, mission summary generated
 */
export interface Mission {
  mission_id: MissionId;
  title: string;                      // Brief mission title
  description: string;                // Original mission description from user

  // Planning phase
  planning: {
    stage: PlanningStage;
    iterations: number;               // Number of Planner/Critic iterations (max 2)
    drafts: PlanDraft[];              // Plan versions
    critiques: Critique[];            // Critiques from Critic agent
  };

  // Execution structure
  phases: MissionPhase[];

  // Overall state
  status: MissionStatus;
  created_at: string;
  updated_at: string;
  completed_at?: string;

  // Statistics
  stats: MissionStats;
}
