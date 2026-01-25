import { Router, Request, Response } from 'express';
import type { OrchestraConfig, ApiResponse, RunListItem, RunState } from '../../types/index.js';
import { RunManager } from '../../core/run-manager.js';
import { StateManager } from '../../core/state-manager.js';
import { ConfigManager } from '../../config/config-manager.js';
import { Orchestrator } from '../../core/orchestrator.js';

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
  router.get('/runs', (req: Request, res: Response) => {
    const runs = runManager.listRuns();
    const response: ApiResponse<RunListItem[]> = {
      success: true,
      data: runs,
    };
    res.json(response);
  });

  // Get active run
  router.get('/runs/active', (req: Request, res: Response) => {
    const activeRun = runManager.getActiveRun();
    if (!activeRun) {
      const response: ApiResponse<null> = {
        success: true,
        data: null,
      };
      return res.json(response);
    }

    const runDir = runManager.getRunDir(activeRun.run_id);
    const stateManager = new StateManager(runDir);
    const state = stateManager.loadState();

    const response: ApiResponse<RunState | null> = {
      success: true,
      data: state,
    };
    res.json(response);
  });

  // Get specific run
  router.get('/runs/:runId', (req: Request, res: Response) => {
    const { runId } = req.params;

    if (!runManager.runExists(runId)) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    const runDir = runManager.getRunDir(runId);
    const stateManager = new StateManager(runDir);
    const state = stateManager.loadState();

    const response: ApiResponse<RunState | null> = {
      success: true,
      data: state,
    };
    res.json(response);
  });

  // Start new run
  router.post('/runs', async (req: Request, res: Response) => {
    try {
      const { briefing } = req.body;

      if (!briefing || typeof briefing !== 'string') {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Briefing is required',
        };
        return res.status(400).json(response);
      }

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
  router.post('/runs/:runId/stop', async (req: Request, res: Response) => {
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

  // Get run briefing
  router.get('/runs/:runId/briefing', (req: Request, res: Response) => {
    const { runId } = req.params;

    const raw = runManager.readRawBriefing(runId);
    const refined = runManager.readRefinedBriefing(runId);

    const response: ApiResponse<{ raw: string | null; refined: string | null }> = {
      success: true,
      data: { raw, refined },
    };
    res.json(response);
  });

  // Get verifier results
  router.get('/runs/:runId/verifier/results', (req: Request, res: Response) => {
    const { runId } = req.params;
    const results = runManager.readVerifierResults(runId);

    const response: ApiResponse<typeof results> = {
      success: true,
      data: results,
    };
    res.json(response);
  });

  // Get gatekeeper verdict
  router.get('/runs/:runId/gatekeeper/verdict', (req: Request, res: Response) => {
    const { runId } = req.params;
    const verdict = runManager.readGatekeeperVerdict(runId);

    const response: ApiResponse<typeof verdict> = {
      success: true,
      data: verdict,
    };
    res.json(response);
  });

  return router;
}
