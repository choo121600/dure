import { Router, Request, Response } from 'express';
import type { ApiResponse, CRP, VCR } from '../../types/index.js';
import { RunManager } from '../../core/run-manager.js';
import { Orchestrator } from '../../core/orchestrator.js';

export function createCrpRouter(projectRoot: string, orchestrator: Orchestrator): Router {
  const router = Router();
  const runManager = new RunManager(projectRoot);

  // List CRPs for a run
  router.get('/:runId', (req: Request, res: Response) => {
    const { runId } = req.params;

    if (!runManager.runExists(runId)) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    const crps = runManager.listCRPs(runId);
    const response: ApiResponse<CRP[]> = {
      success: true,
      data: crps,
    };
    res.json(response);
  });

  // Get specific CRP
  router.get('/:runId/:crpId', (req: Request, res: Response) => {
    const { runId, crpId } = req.params;

    if (!runManager.runExists(runId)) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    const crp = runManager.getCRP(runId, crpId);
    if (!crp) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'CRP not found',
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse<CRP> = {
      success: true,
      data: crp,
    };
    res.json(response);
  });

  // Submit VCR (response to CRP)
  router.post('/:runId/:crpId/respond', async (req: Request, res: Response) => {
    const { runId, crpId } = req.params;
    const { decision, rationale, additionalNotes, appliesToFuture } = req.body;

    if (!runManager.runExists(runId)) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    const crp = runManager.getCRP(runId, crpId);
    if (!crp) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'CRP not found',
      };
      return res.status(404).json(response);
    }

    // Validate decision
    const validOptions = crp.options.map(o => o.id);
    if (!validOptions.includes(decision)) {
      const response: ApiResponse<null> = {
        success: false,
        error: `Invalid decision. Must be one of: ${validOptions.join(', ')}`,
      };
      return res.status(400).json(response);
    }

    // Create VCR
    const vcrId = `vcr-${Date.now()}`;
    const vcr: VCR = {
      vcr_id: vcrId,
      crp_id: crpId,
      created_at: new Date().toISOString(),
      decision,
      rationale: rationale || '',
      additional_notes: additionalNotes,
      applies_to_future: appliesToFuture || false,
    };

    // Save VCR
    runManager.saveVCR(runId, vcr);

    // Resume the orchestrator
    try {
      await orchestrator.resumeRun(runId);

      const response: ApiResponse<VCR> = {
        success: true,
        data: vcr,
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

  // List VCRs for a run
  router.get('/:runId/vcr', (req: Request, res: Response) => {
    const { runId } = req.params;

    if (!runManager.runExists(runId)) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    const vcrs = runManager.listVCRs(runId);
    const response: ApiResponse<VCR[]> = {
      success: true,
      data: vcrs,
    };
    res.json(response);
  });

  return router;
}
