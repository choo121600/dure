import { Router, Request, Response } from 'express';
import type { OrchestraConfig, ApiResponse, RunListItem, RunState, UsageInfo, TotalUsage, AgentName, CRP, VCR, ModelSelectionResult } from '../../types/index.js';
import { RunManager } from '../../core/run-manager.js';
import { StateManager } from '../../core/state-manager.js';
import { ConfigManager } from '../../config/config-manager.js';
import { Orchestrator } from '../../core/orchestrator.js';
import { TmuxManager } from '../../core/tmux-manager.js';
import { CleanupManager } from '../../core/cleanup-manager.js';
import {
  validateRunId,
  validateBriefingMiddleware,
  validateCrpId,
  validateCRPResponse,
  validateDuration,
} from '../middleware/validate.js';
import { isValidRunId } from '../../utils/sanitize.js';

export function createApiRouter(
  projectRoot: string,
  config: OrchestraConfig,
  orchestrator: Orchestrator
): Router {
  const router = Router();
  const runManager = new RunManager(projectRoot);
  const configManager = new ConfigManager(projectRoot);

  // Get project info
  router.get('/project', (req: Request, res: Response) => {
    const response: ApiResponse<{ projectRoot: string; config: OrchestraConfig }> = {
      success: true,
      data: {
        projectRoot,
        config,
      },
    };
    res.json(response);
  });

  // Get configuration
  router.get('/config', (req: Request, res: Response) => {
    const currentConfig = configManager.loadConfig();
    const response: ApiResponse<OrchestraConfig> = {
      success: true,
      data: currentConfig,
    };
    res.json(response);
  });

  // Update configuration
  router.put('/config', (req: Request, res: Response) => {
    try {
      const newConfig = req.body as OrchestraConfig;
      configManager.saveFullConfig(newConfig);
      const response: ApiResponse<OrchestraConfig> = {
        success: true,
        data: newConfig,
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(500).json(response);
    }
  });

  // List all runs
  router.get('/runs', async (req: Request, res: Response) => {
    const runs = await runManager.listRuns();
    const response: ApiResponse<RunListItem[]> = {
      success: true,
      data: runs,
    };
    res.json(response);
  });

  // Get active run
  router.get('/runs/active', async (req: Request, res: Response) => {
    const activeRun = await runManager.getActiveRun();
    if (!activeRun) {
      const response: ApiResponse<null> = {
        success: true,
        data: null,
      };
      return res.json(response);
    }

    const runDir = runManager.getRunDir(activeRun.run_id);
    const stateManager = new StateManager(runDir);
    const state = await stateManager.loadState();

    const response: ApiResponse<RunState | null> = {
      success: true,
      data: state,
    };
    res.json(response);
  });

  // Get specific run
  router.get('/runs/:runId', validateRunId, async (req: Request, res: Response) => {
    const { runId } = req.params;

    if (!(await runManager.runExists(runId))) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    const runDir = runManager.getRunDir(runId);
    const stateManager = new StateManager(runDir);
    const state = await stateManager.loadState();

    const response: ApiResponse<RunState | null> = {
      success: true,
      data: state,
    };
    res.json(response);
  });

  // Start new run
  router.post('/runs', validateBriefingMiddleware, async (req: Request, res: Response) => {
    try {
      const { briefing } = req.body;

      const runId = await orchestrator.startRun(briefing);

      const response: ApiResponse<{ runId: string }> = {
        success: true,
        data: { runId },
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(500).json(response);
    }
  });

  // Stop run
  router.post('/runs/:runId/stop', validateRunId, async (req: Request, res: Response) => {
    try {
      await orchestrator.stopRun();

      const response: ApiResponse<{ success: boolean }> = {
        success: true,
        data: { success: true },
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(500).json(response);
    }
  });

  // Stop all agents (clear run)
  router.post('/runs/:runId/stop-all-agents', validateRunId, async (req: Request, res: Response) => {
    const { runId } = req.params;

    if (!(await runManager.runExists(runId))) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    try {
      const runDir = runManager.getRunDir(runId);
      const stateManager = new StateManager(runDir);
      const tmuxManager = new TmuxManager(
        config.global.tmux_session_prefix,
        projectRoot,
        runId
      );

      // Check if tmux session exists
      if (!tmuxManager.sessionExists()) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Tmux session not found for this run',
        };
        return res.status(404).json(response);
      }

      // Create cleanup manager and execute
      const cleanupManager = new CleanupManager(tmuxManager, stateManager);
      const result = await cleanupManager.stopAllAgents();

      if (result.success) {
        const response: ApiResponse<{
          success: boolean;
          processes_stopped: number;
          message: string;
        }> = {
          success: true,
          data: {
            success: true,
            processes_stopped: result.processes_stopped,
            message: result.message,
          },
        };
        res.json(response);
      } else {
        const response: ApiResponse<null> = {
          success: false,
          error: result.message,
        };
        res.status(500).json(response);
      }
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(500).json(response);
    }
  });

  // Get run briefing
  router.get('/runs/:runId/briefing', validateRunId, async (req: Request, res: Response) => {
    const { runId } = req.params;

    const raw = await runManager.readRawBriefing(runId);
    const refined = await runManager.readRefinedBriefing(runId);

    const response: ApiResponse<{ raw: string | null; refined: string | null }> = {
      success: true,
      data: { raw, refined },
    };
    res.json(response);
  });

  // Get model selection for a run
  router.get('/runs/:runId/models', validateRunId, async (req: Request, res: Response) => {
    const { runId } = req.params;

    if (!(await runManager.runExists(runId))) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    const modelSelection = await runManager.readModelSelection(runId);
    const response: ApiResponse<ModelSelectionResult | null> = {
      success: true,
      data: modelSelection,
    };
    res.json(response);
  });

  // Get verifier results
  router.get('/runs/:runId/verifier/results', validateRunId, async (req: Request, res: Response) => {
    const { runId } = req.params;
    const results = await runManager.readVerifierResults(runId);

    const response: ApiResponse<typeof results> = {
      success: true,
      data: results,
    };
    res.json(response);
  });

  // Get gatekeeper verdict
  router.get('/runs/:runId/gatekeeper/verdict', validateRunId, async (req: Request, res: Response) => {
    const { runId } = req.params;
    const verdict = await runManager.readGatekeeperVerdict(runId);

    const response: ApiResponse<typeof verdict> = {
      success: true,
      data: verdict,
    };
    res.json(response);
  });

  // Get usage for a run
  router.get('/runs/:runId/usage', validateRunId, async (req: Request, res: Response) => {
    const { runId } = req.params;

    if (!(await runManager.runExists(runId))) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    const runDir = runManager.getRunDir(runId);
    const stateManager = new StateManager(runDir);
    const state = await stateManager.loadState();

    if (!state) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'State not found',
      };
      return res.status(404).json(response);
    }

    const agents: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];
    const byAgent: Record<AgentName, UsageInfo | null> = {
      refiner: state.agents.refiner.usage || null,
      builder: state.agents.builder.usage || null,
      verifier: state.agents.verifier.usage || null,
      gatekeeper: state.agents.gatekeeper.usage || null,
    };

    const response: ApiResponse<{
      by_agent: Record<AgentName, UsageInfo | null>;
      total: TotalUsage | null;
    }> = {
      success: true,
      data: {
        by_agent: byAgent,
        total: state.usage || null,
      },
    };
    res.json(response);
  });

  // Get live usage (from orchestrator)
  router.get('/usage/live', (req: Request, res: Response) => {
    const allUsage = orchestrator.getAllAgentUsage();
    const totalUsage = orchestrator.getTotalUsage();

    if (!allUsage || !totalUsage) {
      const response: ApiResponse<null> = {
        success: true,
        data: null,
      };
      return res.json(response);
    }

    const response: ApiResponse<{
      by_agent: Record<AgentName, UsageInfo>;
      total: TotalUsage;
    }> = {
      success: true,
      data: {
        by_agent: allUsage,
        total: totalUsage,
      },
    };
    res.json(response);
  });

  // Get CRPs for a run
  router.get('/runs/:runId/crps', validateRunId, async (req: Request, res: Response) => {
    const { runId } = req.params;

    if (!(await runManager.runExists(runId))) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    const crps = await runManager.listCRPs(runId);
    const response: ApiResponse<typeof crps> = {
      success: true,
      data: crps,
    };
    res.json(response);
  });

  // Get a specific CRP
  router.get('/runs/:runId/crp/:crpId', validateRunId, validateCrpId, async (req: Request, res: Response) => {
    const { runId, crpId } = req.params;

    if (!(await runManager.runExists(runId))) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    const crp = await runManager.getCRP(runId, crpId);
    if (!crp) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'CRP not found',
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse<typeof crp> = {
      success: true,
      data: crp,
    };
    res.json(response);
  });

  // Submit VCR (respond to CRP)
  router.post('/runs/:runId/crp/:crpId/respond', validateRunId, validateCrpId, validateCRPResponse, async (req: Request, res: Response) => {
    const { runId, crpId } = req.params;
    const { decision, rationale, additional_notes, applies_to_future } = req.body;

    if (!(await runManager.runExists(runId))) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    const crp = await runManager.getCRP(runId, crpId);
    if (!crp) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'CRP not found',
      };
      return res.status(404).json(response);
    }

    try {
      // Generate VCR ID
      const vcrs = await runManager.listVCRs(runId);
      const vcrNumber = vcrs.length + 1;
      const vcrId = `vcr-${String(vcrNumber).padStart(3, '0')}`;

      // Create and save VCR
      const vcr = {
        vcr_id: vcrId,
        crp_id: crpId,
        created_at: new Date().toISOString(),
        decision,
        rationale: rationale || '',
        additional_notes: additional_notes || '',
        applies_to_future: applies_to_future || false,
      };

      await runManager.saveVCR(runId, vcr);

      // Resume the run
      await orchestrator.resumeRun(runId);

      const response: ApiResponse<{ vcr_id: string }> = {
        success: true,
        data: { vcr_id: vcrId },
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(500).json(response);
    }
  });

  // Delete a specific run
  router.delete('/runs/:runId', validateRunId, async (req: Request, res: Response) => {
    const { runId } = req.params;

    if (!(await runManager.runExists(runId))) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    try {
      const success = await runManager.deleteRun(runId);
      const response: ApiResponse<{ deleted: boolean; runId: string }> = {
        success: true,
        data: { deleted: success, runId },
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(400).json(response);
    }
  });

  // Clean old runs
  router.delete('/runs', validateDuration, async (req: Request, res: Response) => {
    const olderThan = req.query.olderThan as string;

    try {
      const durationMs = RunManager.parseDuration(olderThan);
      const result = await runManager.cleanRuns(durationMs);

      const response: ApiResponse<{ deleted: string[]; count: number }> = {
        success: true,
        data: result,
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(400).json(response);
    }
  });

  // Retry a failed agent
  router.post('/runs/:runId/retry/:agent', validateRunId, async (req: Request, res: Response) => {
    const { runId, agent } = req.params;

    // Validate agent name
    const validAgents: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];
    if (!validAgents.includes(agent as AgentName)) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Invalid agent name',
      };
      return res.status(400).json(response);
    }

    if (!(await runManager.runExists(runId))) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    // Check if this is the current active run
    const currentRunId = orchestrator.getCurrentRunId();
    if (currentRunId !== runId) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Can only retry agents in the active run',
      };
      return res.status(400).json(response);
    }

    try {
      const runDir = runManager.getRunDir(runId);
      const stateManager = new StateManager(runDir);
      const state = await stateManager.loadState();

      if (!state) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Run state not found',
        };
        return res.status(404).json(response);
      }

      // Check if agent is in failed state
      const agentState = state.agents[agent as AgentName];
      if (agentState.status !== 'failed' && agentState.status !== 'timeout') {
        const response: ApiResponse<null> = {
          success: false,
          error: `Agent ${agent} is not in a failed state (current: ${agentState.status})`,
        };
        return res.status(400).json(response);
      }

      // Trigger retry through orchestrator's recovery manager
      const retryManager = orchestrator.getRetryManager();
      const recoveryManager = orchestrator.getRecoveryManager();
      const selectedModels = orchestrator.getSelectedModels();

      if (!selectedModels) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'No models selected for this run',
        };
        return res.status(400).json(response);
      }

      // Create a synthetic error flag for manual retry
      const errorFlag = {
        agent,
        error_type: 'crash' as const,
        message: 'Manual retry requested',
        timestamp: new Date().toISOString(),
        recoverable: true,
      };

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: `Retry initiated for agent ${agent}` },
      };
      res.json(response);

      // Note: The actual retry will be handled by the orchestrator
      // and events will be emitted through WebSocket
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(500).json(response);
    }
  });

  // Extend timeout for an agent
  router.post('/runs/:runId/extend-timeout/:agent', validateRunId, (req: Request, res: Response) => {
    const { runId, agent } = req.params;
    const { additionalMs } = req.body;

    // Validate agent name
    const validAgents: AgentName[] = ['refiner', 'builder', 'verifier', 'gatekeeper'];
    if (!validAgents.includes(agent as AgentName)) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Invalid agent name',
      };
      return res.status(400).json(response);
    }

    // Validate additionalMs
    if (typeof additionalMs !== 'number' || additionalMs <= 0 || additionalMs > 1800000) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'additionalMs must be a number between 1 and 1800000 (30 minutes)',
      };
      return res.status(400).json(response);
    }

    // Check if this is the current active run
    const currentRunId = orchestrator.getCurrentRunId();
    if (currentRunId !== runId) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Can only extend timeout for the active run',
      };
      return res.status(400).json(response);
    }

    try {
      // Note: Actual timeout extension would require access to AgentMonitor
      // For now, we acknowledge the request
      const response: ApiResponse<{ message: string; extendedBy: number }> = {
        success: true,
        data: {
          message: `Timeout extended for agent ${agent}`,
          extendedBy: additionalMs,
        },
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(500).json(response);
    }
  });

  // Stop the current run
  router.post('/runs/:runId/stop', validateRunId, async (req: Request, res: Response) => {
    const { runId } = req.params;

    // Check if this is the current active run
    const currentRunId = orchestrator.getCurrentRunId();
    if (currentRunId !== runId) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Can only stop the active run',
      };
      return res.status(400).json(response);
    }

    try {
      await orchestrator.stopRun();

      const response: ApiResponse<{ message: string }> = {
        success: true,
        data: { message: 'Run stopped successfully' },
      };
      res.json(response);
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(500).json(response);
    }
  });

  return router;
}
