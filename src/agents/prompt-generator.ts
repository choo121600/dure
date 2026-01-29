import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type { PromptContext, AgentName } from '../types/index.js';
import { PromptLoader } from '../services/prompt-loader.js';

/**
 * Verifier prompt phase for external test runner mode
 * - 'phase1': Test generation only (creates tests-ready.flag)
 * - 'phase2': Result analysis (creates done.flag)
 */
export type VerifierPhase = 'phase1' | 'phase2';

/**
 * Information about VCR (human response) for continuation prompts
 */
export interface VCRPromptInfo {
  crpQuestion: string;
  crpContext: string;
  decision: string;
  decisionLabel: string;
  rationale: string;
  additionalNotes?: string;
}

export class PromptGenerator {
  private projectRoot: string;
  private promptLoader: PromptLoader;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    // Don't pass projectRoot to PromptLoader - templates are always in package installation
    this.promptLoader = new PromptLoader();
  }

  /**
   * Substitute template variables in prompt content
   * @param template - Raw template content with ${variable} placeholders
   * @param context - Prompt context containing substitution values
   * @returns Template with variables substituted
   */
  private substituteVariables(template: string, context: PromptContext): string {
    const { project_root, run_id, config, iteration, has_review } = context;

    let result = template;

    // Basic variables
    result = result.replace(/\$\{project_root\}/g, project_root);
    result = result.replace(/\$\{run_id\}/g, run_id);

    // Config variables - need to be JSON stringified
    result = result.replace(/\$\{config_refiner\}/g, JSON.stringify(config.refiner, null, 2));
    result = result.replace(/\$\{config_builder\}/g, JSON.stringify(config.builder, null, 2));
    result = result.replace(/\$\{config_verifier\}/g, JSON.stringify(config.verifier, null, 2));
    result = result.replace(/\$\{config_gatekeeper\}/g, JSON.stringify(config.gatekeeper, null, 2));

    // Refiner-specific variables
    const autoFillAllowed = config.refiner.auto_fill.allowed.join(', ');
    const autoFillForbidden = config.refiner.auto_fill.forbidden.join(', ');
    const delegationKeywords = config.refiner.delegation_keywords.map(k => `- "${k}"`).join('\n');

    result = result.replace(/\$\{auto_fill_allowed\}/g, autoFillAllowed);
    result = result.replace(/\$\{auto_fill_forbidden\}/g, autoFillForbidden);
    result = result.replace(/\$\{delegation_keywords\}/g, delegationKeywords);

    // Builder-specific variables
    const maxFileSize = config.builder.constraints.max_file_size_lines;
    const preferLibraries = config.builder.style.prefer_libraries.length > 0
      ? `- Preferred libraries: ${config.builder.style.prefer_libraries.join(', ')}`
      : '';
    const avoidLibraries = config.builder.style.avoid_libraries.length > 0
      ? `- Libraries to avoid: ${config.builder.style.avoid_libraries.join(', ')}`
      : '';

    result = result.replace(/\$\{max_file_size_lines\}/g, String(maxFileSize));
    result = result.replace(/\$\{prefer_libraries_section\}/g, preferLibraries);
    result = result.replace(/\$\{avoid_libraries_section\}/g, avoidLibraries);

    // Builder review section
    const hasReviewLabel = has_review ? `- (Retry) Review feedback: .dure/runs/${run_id}/gatekeeper/review.md` : '';
    const reviewSection = has_review
      ? `This is attempt #${iteration}.\n- Review feedback: .dure/runs/${run_id}/gatekeeper/review.md\nMake sure to incorporate the above feedback in your implementation.`
      : '';
    const incorporateReview = has_review ? '4. Must incorporate review.md feedback' : '';

    result = result.replace(/\$\{has_review_section\}/g, hasReviewLabel);
    result = result.replace(/\$\{review_section\}/g, reviewSection);
    result = result.replace(/\$\{incorporate_review\}/g, incorporateReview);

    // Verifier-specific variables
    const minCoverage = config.verifier.test_coverage.min_percentage;
    const requireEdgeCases = config.verifier.test_coverage.require_edge_cases;
    const requireErrorCases = config.verifier.test_coverage.require_error_cases;
    const adversarialTests = config.verifier.adversarial.enabled
      ? `4. Adversarial tests (max ${config.verifier.adversarial.max_attack_vectors} attack vectors)`
      : '';
    const adversarialFindings = config.verifier.adversarial.enabled
      ? '6. Report any adversarial findings from test results'
      : '';

    result = result.replace(/\$\{min_coverage_percentage\}/g, String(minCoverage));
    result = result.replace(/\$\{require_edge_cases\}/g, String(requireEdgeCases));
    result = result.replace(/\$\{require_error_cases\}/g, String(requireErrorCases));
    result = result.replace(/\$\{adversarial_tests_section\}/g, adversarialTests);
    result = result.replace(/\$\{adversarial_findings_section\}/g, adversarialFindings);

    // Gatekeeper-specific variables
    const maxIterations = config.gatekeeper.max_iterations;
    const testsPassing = config.gatekeeper.pass_criteria.tests_passing;
    const noCriticalIssues = config.gatekeeper.pass_criteria.no_critical_issues;
    const minTestCoverage = config.gatekeeper.pass_criteria.min_test_coverage;
    const autoCrpTriggers = config.gatekeeper.auto_crp_triggers.map(t => `- ${t}`).join('\n');

    result = result.replace(/\$\{iteration\}/g, String(iteration || 1));
    result = result.replace(/\$\{max_iterations\}/g, String(maxIterations));
    result = result.replace(/\$\{tests_passing\}/g, String(testsPassing));
    result = result.replace(/\$\{no_critical_issues\}/g, String(noCriticalIssues));
    result = result.replace(/\$\{min_test_coverage\}/g, String(minTestCoverage));
    result = result.replace(/\$\{auto_crp_triggers\}/g, autoCrpTriggers);

    return result;
  }

  /**
   * Generate all prompt files for a run
   */
  async generateAllPrompts(outputDir: string, context: PromptContext): Promise<void> {
    await mkdir(outputDir, { recursive: true });

    await Promise.all([
      this.generateRefinerPrompt(outputDir, context),
      this.generateBuilderPrompt(outputDir, context),
      this.generateVerifierPrompt(outputDir, context, 'phase1'),
      this.generateVerifierPrompt(outputDir, context, 'phase2'),
      this.generateGatekeeperPrompt(outputDir, context),
    ]);
  }

  /**
   * Generate Refiner prompt
   */
  async generateRefinerPrompt(outputDir: string, context: PromptContext): Promise<void> {
    const template = await this.promptLoader.loadPrompt('refiner');
    const prompt = this.substituteVariables(template, context);
    await writeFile(join(outputDir, 'refiner.md'), prompt, 'utf-8');
  }

  /**
   * Generate Builder prompt
   */
  async generateBuilderPrompt(outputDir: string, context: PromptContext): Promise<void> {
    const template = await this.promptLoader.loadPrompt('builder');
    const prompt = this.substituteVariables(template, context);
    await writeFile(join(outputDir, 'builder.md'), prompt, 'utf-8');
  }

  /**
   * Generate Verifier prompt
   * @param outputDir - Directory to write the prompt file
   * @param context - Prompt context containing run configuration
   * @param phase - Which phase prompt to generate:
   *   - 'phase1': Test generation only (external runner mode)
   *   - 'phase2': Result analysis (external runner mode)
   */
  async generateVerifierPrompt(
    outputDir: string,
    context: PromptContext,
    phase: VerifierPhase
  ): Promise<void> {
    const promptType = phase === 'phase1' ? 'verifier-phase1' : 'verifier-phase2';
    const template = await this.promptLoader.loadPrompt(promptType);
    const prompt = this.substituteVariables(template, context);

    const filename = phase === 'phase1'
      ? 'verifier-phase1.md'
      : 'verifier-phase2.md';

    await writeFile(join(outputDir, filename), prompt, 'utf-8');
  }

  /**
   * Generate Gatekeeper prompt
   */
  async generateGatekeeperPrompt(outputDir: string, context: PromptContext): Promise<void> {
    const template = await this.promptLoader.loadPrompt('gatekeeper');
    const prompt = this.substituteVariables(template, context);
    await writeFile(join(outputDir, 'gatekeeper.md'), prompt, 'utf-8');
  }

  /**
   * Generate continuation prompt for resuming an agent after VCR response
   * @returns Path to the generated prompt file
   */
  async generateContinuationPrompt(
    outputDir: string,
    agent: AgentName,
    context: PromptContext,
    vcrInfo: VCRPromptInfo
  ): Promise<string> {
    const filename = `${agent}-continuation.md`;
    const filepath = join(outputDir, filename);

    const vcrSection = `
## Human Decision (VCR)

The human has responded to your question:

**Question:** ${vcrInfo.crpQuestion}

**Context:** ${vcrInfo.crpContext}

**Decision:** ${vcrInfo.decisionLabel}

**Rationale:** ${vcrInfo.rationale}
${vcrInfo.additionalNotes ? `\n**Additional Notes:** ${vcrInfo.additionalNotes}` : ''}

## Instructions

Continue your work based on this decision. Follow the human's guidance and complete your task.
`;

    let template: string;
    const promptType = this.getPromptTypeForAgent(agent);
    template = await this.promptLoader.loadPrompt(promptType);

    const basePrompt = this.substituteVariables(template, context);
    const fullPrompt = basePrompt + '\n' + vcrSection;
    await writeFile(filepath, fullPrompt, 'utf-8');

    return filepath;
  }

  /**
   * Get the prompt template type for an agent
   */
  private getPromptTypeForAgent(agent: AgentName): string {
    switch (agent) {
      case 'refiner':
        return 'refiner';
      case 'builder':
        return 'builder';
      case 'verifier':
        return 'verifier-phase1';
      case 'gatekeeper':
        return 'gatekeeper';
      default:
        throw new Error(`Unknown agent: ${agent}`);
    }
  }
}