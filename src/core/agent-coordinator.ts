import { EventEmitter } from 'events';
import type { AgentName, Phase, TestOutput, TestConfig } from '../types/index.js';
import type { AgentLifecycleManager } from './agent-lifecycle-manager.js';
import type { PhaseTransitionManager } from './phase-transition-manager.js';
import type { RunManager } from './run-manager.js';
import type { StateManager } from './state-manager.js';

/**
 * Action to take after an agent completes
 */
export type AgentDoneAction =
  | { type: 'transition'; nextPhase: Phase; nextAgent: AgentName }
  | { type: 'wait_crp'; crpId: string };

export type AgentCoordinatorEvent =
  | { type: 'agent_completing'; agent: AgentName; runId: string }
  | { type: 'agent_completed'; agent: AgentName; runId: string }
  | { type: 'phase_transitioning'; from: Phase; to: Phase; runId: string }
  | { type: 'phase_transitioned'; phase: Phase; runId: string }
  | { type: 'crp_detected'; crpId: string; agent: AgentName; runId: string }
  | { type: 'crp_created'; crpId: string; agent: AgentName; runId: string }
  | { type: 'waiting_human'; crpId: string; runId: string }
  | { type: 'verifier_phase1_done'; runId: string }
  | { type: 'test_execution_starting'; runId: string }
  | { type: 'test_execution_done'; runId: string; testOutput: TestOutput }
  | { type: 'verifier_phase2_starting'; runId: string };

/**
 * AgentCoordinator handles agent completion and phase transitions:
 * - Determining next action after agent completes
 * - Coordinating phase transitions
 * - Handling CRP creation and detection
 */
export class AgentCoordinator extends EventEmitter {
  private agentLifecycle: AgentLifecycleManager;
  private phaseManager: PhaseTransitionManager;
  private runManager: RunManager;
  private stateManager: StateManager;

  // Track agents currently being processed to prevent duplicate handling
  private processingAgents: Set<AgentName> = new Set();

  constructor(
    agentLifecycle: AgentLifecycleManager,
    phaseManager: PhaseTransitionManager,
    runManager: RunManager,
    stateManager: StateManager
  ) {
    super();
    this.agentLifecycle = agentLifecycle;
    this.phaseManager = phaseManager;
    this.runManager = runManager;
    this.stateManager = stateManager;
  }

  /**
   * Determine the next action after an agent completes
   * This is a pure function that returns the action without side effects
   */
  async determineNextAction(
    agent: AgentName,
    runId: string,
    nextPhase: Phase
  ): Promise<AgentDoneAction> {
    // Check for unresolved CRP by this agent
    const unresolvedCrp = await this.findUnresolvedCRP(runId, agent);
    if (unresolvedCrp) {
      return { type: 'wait_crp', crpId: unresolvedCrp };
    }

    // Check current state for pending CRP or waiting_human phase
    const state = await this.stateManager.loadState();
    if (state?.phase === 'waiting_human' || state?.pending_crp) {
      const crpId = state.pending_crp || '';
      return { type: 'wait_crp', crpId };
    }

    // Normal transition to next phase
    const nextAgent = this.phaseManager.getPhaseAgent(nextPhase);
    if (!nextAgent) {
      throw new Error(`No agent for phase: ${nextPhase}`);
    }

    return { type: 'transition', nextPhase, nextAgent };
  }

  /**
   * Execute an agent completion action
   * This method performs side effects based on the determined action
   */
  async executeAgentCompletion(
    agent: AgentName,
    runId: string,
    action: AgentDoneAction
  ): Promise<void> {
    this.emitEvent({ type: 'agent_completing', agent, runId });

    // Complete the agent
    await this.agentLifecycle.completeAgent(agent);
    this.emitEvent({ type: 'agent_completed', agent, runId });

    // Handle the action
    if (action.type === 'wait_crp') {
      await this.handleWaitCRP(action.crpId, agent, runId);
    } else {
      await this.handleTransition(agent, action.nextPhase, runId);
    }
  }

  /**
   * Handle agent done event - combines determineNextAction and executeAgentCompletion
   * Includes guard against duplicate calls for the same agent
   */
  async handleAgentDone(
    agent: AgentName,
    runId: string,
    nextPhase: Phase
  ): Promise<AgentDoneAction> {
    // Guard against duplicate handling
    if (this.processingAgents.has(agent)) {
      // Return a dummy action - the real transition is already in progress
      const nextAgent = this.phaseManager.getPhaseAgent(nextPhase);
      return { type: 'transition', nextPhase, nextAgent: nextAgent || agent };
    }

    this.processingAgents.add(agent);

    try {
      this.emitEvent({ type: 'agent_completing', agent, runId });

      // Complete the agent
      await this.agentLifecycle.completeAgent(agent);
      this.emitEvent({ type: 'agent_completed', agent, runId });

      // Wait for potential CRP to be written
      await this.delay(1000);

      // Determine and execute action
      const action = await this.determineNextAction(agent, runId, nextPhase);

      if (action.type === 'wait_crp') {
        await this.handleWaitCRP(action.crpId, agent, runId);
      } else {
        await this.handleTransition(agent, action.nextPhase, runId);
      }

      return action;
    } finally {
      // Remove from processing set after completion
      this.processingAgents.delete(agent);
    }
  }

  /**
   * Handle CRP creation by an agent
   */
  async handleCRPCreated(
    crp: { crp_id: string; created_by: AgentName },
    runId: string
  ): Promise<void> {
    const { crp_id: crpId, created_by: agent } = crp;

    // Stop the agent
    this.agentLifecycle.stopAgent(agent);
    await this.stateManager.updateAgentStatus(agent, 'pending');

    // Set pending CRP
    await this.stateManager.setPendingCRP(crpId);

    this.emitEvent({ type: 'crp_created', crpId, agent, runId });
    this.emitEvent({ type: 'waiting_human', crpId, runId });
  }

  /**
   * Handle unresolved CRP detection
   */
  async handleUnresolvedCRP(agent: AgentName, runId: string): Promise<string | null> {
    const unresolvedCrpId = await this.findUnresolvedCRP(runId, agent);

    if (!unresolvedCrpId) {
      return null;
    }

    // Check if already tracked
    const state = await this.stateManager.loadState();
    if (state?.pending_crp) {
      return state.pending_crp;
    }

    // Set as pending
    await this.stateManager.setPendingCRP(unresolvedCrpId);
    this.emitEvent({ type: 'crp_detected', crpId: unresolvedCrpId, agent, runId });
    this.emitEvent({ type: 'waiting_human', crpId: unresolvedCrpId, runId });

    return unresolvedCrpId;
  }

  /**
   * Check if there's an unresolved CRP for an agent
   */
  async hasUnresolvedCRP(runId: string, agent: AgentName): Promise<boolean> {
    const crpId = await this.findUnresolvedCRP(runId, agent);
    return crpId !== null;
  }

  /**
   * Start the next agent after transition
   */
  async startNextAgent(
    nextAgent: AgentName,
    runId: string
  ): Promise<void> {
    const runDir = this.runManager.getRunDir(runId);
    await this.agentLifecycle.startAgent(nextAgent, runDir);
  }

  /**
   * Handle transition to next phase
   */
  private async handleTransition(
    currentAgent: AgentName,
    nextPhase: Phase,
    runId: string
  ): Promise<void> {
    const currentPhase = await this.phaseManager.getCurrentPhase();
    this.emitEvent({ type: 'phase_transitioning', from: currentPhase!, to: nextPhase, runId });

    // Transition to next phase
    await this.phaseManager.transition(nextPhase);
    this.emitEvent({ type: 'phase_transitioned', phase: nextPhase, runId });

    // Start the next agent
    const nextAgent = this.phaseManager.getPhaseAgent(nextPhase);
    if (nextAgent) {
      await this.startNextAgent(nextAgent, runId);
    }
  }

  /**
   * Handle waiting for CRP
   */
  private async handleWaitCRP(
    crpId: string,
    agent: AgentName,
    runId: string
  ): Promise<void> {
    // Make sure CRP is tracked
    const state = await this.stateManager.loadState();
    if (!state?.pending_crp && crpId) {
      await this.stateManager.setPendingCRP(crpId);
    }

    this.emitEvent({ type: 'crp_detected', crpId, agent, runId });
    this.emitEvent({ type: 'waiting_human', crpId, runId });
  }

  /**
   * Find unresolved CRP by agent
   */
  private async findUnresolvedCRP(runId: string, agent: AgentName): Promise<string | null> {
    const crps = (await this.runManager.listCRPs(runId)).filter(c => c.created_by === agent);
    const vcrs = await this.runManager.listVCRs(runId);

    const unresolved = crps.find(crp => !vcrs.some(vcr => vcr.crp_id === crp.crp_id));
    return unresolved?.crp_id || null;
  }

  /**
   * Handle Verifier Phase 1 completion (tests-ready.flag detected)
   * Transitions Verifier to waiting_test_execution state
   */
  async handleVerifierPhase1Done(runId: string, config: TestConfig): Promise<void> {
    // Mark verifier as waiting for test execution
    await this.agentLifecycle.setAgentWaitingTestExecution('verifier');

    this.emitEvent({ type: 'verifier_phase1_done', runId });
    this.emitEvent({ type: 'test_execution_starting', runId });
  }

  /**
   * Handle external test execution completion (test-output.json detected)
   * Starts Verifier Phase 2 with test results
   */
  async handleTestExecutionDone(runId: string, testOutput: TestOutput): Promise<void> {
    this.emitEvent({ type: 'test_execution_done', runId, testOutput });
    this.emitEvent({ type: 'verifier_phase2_starting', runId });

    // Start Verifier Phase 2
    await this.startVerifierPhase2(runId, testOutput);
  }

  /**
   * Start Verifier Phase 2 with test execution results
   * @param runId Run ID
   * @param testOutput Test execution output from external runner
   */
  async startVerifierPhase2(runId: string, testOutput: TestOutput): Promise<void> {
    const runDir = this.runManager.getRunDir(runId);
    await this.agentLifecycle.startVerifierPhase2(runDir, testOutput);
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Emit typed event
   */
  private emitEvent(event: AgentCoordinatorEvent): void {
    this.emit('coordinator_event', event);
  }
}
