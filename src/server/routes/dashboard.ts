/**
 * Dashboard API Routes
 *
 * REST API endpoints for dashboard data, complementing Socket.io real-time updates.
 */
import { Router, Request, Response } from 'express';
import type { ApiResponse, DashboardData, AgentName } from '../../types/index.js';
import { RunManager } from '../../core/run-manager.js';
import { StateManager } from '../../core/state-manager.js';
import { TmuxManager } from '../../core/tmux-manager.js';
import { DashboardDataProvider } from '../../core/dashboard-data-provider.js';
import type { OrchestraConfig } from '../../types/index.js';
import { validateRunId } from '../middleware/validate.js';

/**
 * Dashboard route options
 */
export interface DashboardRouterOptions {
  /** Tmux session prefix from config */
  tmuxSessionPrefix: string;
  /** Output lines to capture per agent */
  outputLines?: number;
}

/**
 * Create dashboard API router
 */
export function createDashboardRouter(
  projectRoot: string,
  config: OrchestraConfig,
  options: DashboardRouterOptions
): Router {
  const router = Router();
  const runManager = new RunManager(projectRoot);
  const { tmuxSessionPrefix, outputLines = 50 } = options;

  /**
   * GET /api/dashboard/latest
   *
   * Get dashboard data for the latest active run
   * NOTE: This route MUST be defined before /:runId to avoid 'latest' being matched as runId
   */
  router.get('/latest', async (req: Request, res: Response) => {
    try {
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
      const tmuxManager = new TmuxManager(tmuxSessionPrefix, projectRoot, activeRun.run_id);

      const provider = new DashboardDataProvider(tmuxManager, stateManager, runDir, {
        outputLines,
        projectRoot,
      });

      const data = await provider.getData();
      provider.destroy();

      const response: ApiResponse<DashboardData> = {
        success: true,
        data,
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

  /**
   * GET /api/dashboard/:runId
   *
   * Get current dashboard data for a run
   */
  router.get('/:runId', validateRunId, async (req: Request, res: Response) => {
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
      const tmuxManager = new TmuxManager(tmuxSessionPrefix, projectRoot, runId);

      const provider = new DashboardDataProvider(tmuxManager, stateManager, runDir, {
        outputLines,
        projectRoot,
      });

      const data = await provider.getData();
      provider.destroy(); // Clean up provider after single use

      const response: ApiResponse<DashboardData> = {
        success: true,
        data,
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

  /**
   * GET /api/dashboard/:runId/agent/:agent/output
   *
   * Get agent output directly (without full dashboard data)
   */
  router.get('/:runId/agent/:agent/output', validateRunId, async (req: Request, res: Response) => {
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

    try {
      const tmuxManager = new TmuxManager(tmuxSessionPrefix, projectRoot, runId);

      // Get lines from query param, default to 50
      const lines = parseInt(req.query.lines as string) || outputLines;
      const output = tmuxManager.capturePane(agent as AgentName, lines);

      const response: ApiResponse<{ agent: AgentName; output: string; lines: number }> = {
        success: true,
        data: {
          agent: agent as AgentName,
          output,
          lines,
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

  /**
   * GET /api/dashboard/:runId/progress
   *
   * Get progress information for a run
   */
  router.get('/:runId/progress', validateRunId, async (req: Request, res: Response) => {
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
      const state = await stateManager.loadState();

      if (!state) {
        const response: ApiResponse<null> = {
          success: false,
          error: 'State not found',
        };
        return res.status(404).json(response);
      }

      // Calculate progress
      const phaseOrder = ['refine', 'build', 'verify', 'gate'];
      const currentStep = phaseOrder.indexOf(state.phase) + 1;
      const totalSteps = 4;

      const response: ApiResponse<{
        runId: string;
        phase: string;
        currentStep: number;
        totalSteps: number;
        iteration: number;
        maxIterations: number;
        agents: {
          [key in AgentName]: {
            status: string;
            startedAt?: string;
            completedAt?: string;
          };
        };
      }> = {
        success: true,
        data: {
          runId: state.run_id,
          phase: state.phase,
          currentStep: currentStep > 0 ? currentStep : 1,
          totalSteps,
          iteration: state.iteration,
          maxIterations: state.max_iterations,
          agents: {
            refiner: {
              status: state.agents.refiner.status,
              startedAt: state.agents.refiner.started_at,
              completedAt: state.agents.refiner.completed_at,
            },
            builder: {
              status: state.agents.builder.status,
              startedAt: state.agents.builder.started_at,
              completedAt: state.agents.builder.completed_at,
            },
            verifier: {
              status: state.agents.verifier.status,
              startedAt: state.agents.verifier.started_at,
              completedAt: state.agents.verifier.completed_at,
            },
            gatekeeper: {
              status: state.agents.gatekeeper.status,
              startedAt: state.agents.gatekeeper.started_at,
              completedAt: state.agents.gatekeeper.completed_at,
            },
          },
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

  return router;
}
