import { Router, Request, Response } from 'express';
import type { ApiResponse, MRPEvidence } from '../../types/index.js';
import { RunManager } from '../../core/run-manager.js';

export function createMrpRouter(projectRoot: string): Router {
  const router = Router();
  const runManager = new RunManager(projectRoot);

  // Get MRP for a run
  router.get('/:runId', async (req: Request, res: Response) => {
    const { runId } = req.params;

    if (!(await runManager.runExists(runId))) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    const summary = await runManager.readMRPSummary(runId);
    const evidence = await runManager.readMRPEvidence(runId);

    if (!summary && !evidence) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'MRP not found',
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse<{ summary: string | null; evidence: MRPEvidence | null }> = {
      success: true,
      data: { summary, evidence },
    };
    res.json(response);
  });

  // Approve MRP (mark run as complete)
  router.post('/:runId/approve', async (req: Request, res: Response) => {
    const { runId } = req.params;

    if (!(await runManager.runExists(runId))) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    // For now, just acknowledge the approval
    // In a full implementation, this could trigger git commits, etc.
    const response: ApiResponse<{ approved: boolean }> = {
      success: true,
      data: { approved: true },
    };
    res.json(response);
  });

  // Request changes (send back to builder)
  router.post('/:runId/request-changes', async (req: Request, res: Response) => {
    const { runId } = req.params;
    const { feedback } = req.body;

    if (!(await runManager.runExists(runId))) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    // In a full implementation, this would restart the pipeline with feedback
    const response: ApiResponse<{ feedbackReceived: boolean }> = {
      success: true,
      data: { feedbackReceived: true },
    };
    res.json(response);
  });

  return router;
}
