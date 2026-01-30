/**
 * Context Compressor
 * Compresses phase carry-forward data into context for the next phase
 */

import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import type {
  MissionPhase,
  CarryForward,
  PhaseContext,
} from '../types/mission.js';
import { OrchestraError, ErrorCodes } from '../types/errors.js';

// ============================================================================
// Configuration
// ============================================================================

export interface ContextCompressorConfig {
  maxContextLength: number;      // Maximum context string length (default: 4000)
  summarizeLongLists: boolean;   // Whether to group long artifact lists (default: true)
  longListThreshold: number;     // Threshold for "long list" (default: 10)
}

export const DEFAULT_COMPRESSOR_CONFIG: ContextCompressorConfig = {
  maxContextLength: 4000,
  summarizeLongLists: true,
  longListThreshold: 10,
};

// ============================================================================
// Error Class
// ============================================================================

export class ContextError extends OrchestraError {
  constructor(
    message: string,
    code: string = ErrorCodes.MISSION_CONTEXT_FAILED,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, code as any, context, cause);
    this.name = 'ContextError';
  }
}

// ============================================================================
// Context Compressor
// ============================================================================

export class ContextCompressor {
  private config: ContextCompressorConfig;

  constructor(config?: Partial<ContextCompressorConfig>) {
    this.config = { ...DEFAULT_COMPRESSOR_CONFIG, ...config };
  }

  /**
   * Compress a phase's carry-forward data into a PhaseContext
   */
  compressPhase(phase: MissionPhase): Result<PhaseContext, ContextError> {
    const carryForwards = this.collectCarryForwards(phase);

    if (carryForwards.length === 0) {
      return ok(this.createEmptyContext(phase));
    }

    // Merge all carry-forwards
    const allDecisions = this.mergeDecisions(carryForwards);
    const allArtifacts = this.mergeArtifacts(carryForwards);
    const allApiContracts = this.mergeApiContracts(carryForwards);
    const allWarnings = this.mergeWarnings(carryForwards);

    // Generate summary and context string
    const summary = this.generateSummary(phase);
    const nextPhaseContext = this.generateNextPhaseContext(
      allDecisions,
      allArtifacts,
      allApiContracts,
      allWarnings
    );

    const context: PhaseContext = {
      phase_id: phase.phase_id,
      phase_number: phase.number,
      created_at: new Date().toISOString(),
      summary,
      all_decisions: allDecisions,
      all_artifacts: allArtifacts,
      all_api_contracts: allApiContracts,
      all_warnings: allWarnings,
      next_phase_context: nextPhaseContext,
    };

    // Apply length limit if needed
    if (context.next_phase_context.length > this.config.maxContextLength) {
      context.next_phase_context = this.truncateContext(
        context.next_phase_context,
        this.config.maxContextLength
      );
    }

    return ok(context);
  }

  /**
   * Collect all CarryForward data from completed tasks in a phase
   */
  private collectCarryForwards(phase: MissionPhase): CarryForward[] {
    return phase.tasks
      .filter(task => task.status === 'passed' && task.carry_forward)
      .map(task => task.carry_forward!);
  }

  /**
   * Merge key decisions from all carry-forwards (deduplicated)
   */
  private mergeDecisions(carryForwards: CarryForward[]): string[] {
    const decisions = new Set<string>();
    for (const cf of carryForwards) {
      for (const decision of cf.key_decisions) {
        decisions.add(decision);
      }
    }
    return Array.from(decisions);
  }

  /**
   * Merge artifacts from all carry-forwards (deduplicated, sorted)
   */
  private mergeArtifacts(carryForwards: CarryForward[]): string[] {
    const artifacts = new Set<string>();
    for (const cf of carryForwards) {
      for (const artifact of cf.created_artifacts) {
        artifacts.add(artifact);
      }
    }
    return Array.from(artifacts).sort();
  }

  /**
   * Merge API contracts from all carry-forwards (deduplicated)
   */
  private mergeApiContracts(carryForwards: CarryForward[]): string[] {
    const contracts = new Set<string>();
    for (const cf of carryForwards) {
      if (cf.api_contracts) {
        for (const contract of cf.api_contracts) {
          contracts.add(contract);
        }
      }
    }
    return Array.from(contracts);
  }

  /**
   * Merge warnings from all carry-forwards (deduplicated, order preserved)
   */
  private mergeWarnings(carryForwards: CarryForward[]): string[] {
    const warnings: string[] = [];
    for (const cf of carryForwards) {
      for (const warning of cf.warnings) {
        if (!warnings.includes(warning)) {
          warnings.push(warning);
        }
      }
    }
    return warnings;
  }

  /**
   * Generate a brief summary of the phase
   */
  private generateSummary(phase: MissionPhase): string {
    const completedTasks = phase.tasks.filter(t => t.status === 'passed').length;
    const totalTasks = phase.tasks.length;
    return `Phase ${phase.number} (${phase.title}) completed: ${completedTasks}/${totalTasks} tasks.`;
  }

  /**
   * Generate the context string for the next phase
   */
  private generateNextPhaseContext(
    decisions: string[],
    artifacts: string[],
    apiContracts: string[],
    warnings: string[]
  ): string {
    const sections: string[] = [];

    // Key Decisions section
    if (decisions.length > 0) {
      sections.push('## Key Decisions Made\n');
      for (const decision of decisions) {
        sections.push(`- ${decision}`);
      }
      sections.push('');
    }

    // Created Artifacts section
    if (artifacts.length > 0) {
      sections.push('## Created Artifacts\n');
      if (this.config.summarizeLongLists && artifacts.length > this.config.longListThreshold) {
        // Group by directory for long lists
        const grouped = this.groupArtifactsByDirectory(artifacts);
        for (const [dir, files] of Object.entries(grouped)) {
          sections.push(`- ${dir}/ (${files.length} files)`);
        }
      } else {
        for (const artifact of artifacts) {
          sections.push(`- ${artifact}`);
        }
      }
      sections.push('');
    }

    // API Contracts section
    if (apiContracts.length > 0) {
      sections.push('## API Contracts Defined\n');
      for (const contract of apiContracts) {
        sections.push(`- ${contract}`);
      }
      sections.push('');
    }

    // Warnings section (always included if present)
    if (warnings.length > 0) {
      sections.push('## Warnings for Next Phase\n');
      for (const warning of warnings) {
        sections.push(`- ${warning}`);
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Group artifacts by their parent directory
   */
  groupArtifactsByDirectory(artifacts: string[]): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};

    for (const artifact of artifacts) {
      const parts = artifact.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';

      if (!grouped[dir]) {
        grouped[dir] = [];
      }
      grouped[dir].push(artifact);
    }

    return grouped;
  }

  /**
   * Truncate context string to fit within max length
   */
  private truncateContext(context: string, maxLength: number): string {
    if (context.length <= maxLength) return context;

    // Leave room for the truncation notice
    const truncated = context.slice(0, maxLength - 100);

    // Find the last newline to avoid cutting mid-line
    const lastNewline = truncated.lastIndexOf('\n');

    return truncated.slice(0, lastNewline) +
      '\n\n... (truncated for length)';
  }

  /**
   * Create an empty context for phases with no carry-forward data
   */
  private createEmptyContext(phase: MissionPhase): PhaseContext {
    return {
      phase_id: phase.phase_id,
      phase_number: phase.number,
      created_at: new Date().toISOString(),
      summary: `Phase ${phase.number} (${phase.title}) completed with no carry-forward data.`,
      all_decisions: [],
      all_artifacts: [],
      all_api_contracts: [],
      all_warnings: [],
      next_phase_context: 'No context from previous phase.',
    };
  }
}
