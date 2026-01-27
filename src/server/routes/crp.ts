import { Router, Request, Response } from 'express';
import type { ApiResponse, CRP, VCR } from '../../types/index.js';
import { RunManager } from '../../core/run-manager.js';
import { Orchestrator } from '../../core/orchestrator.js';

export function createCrpRouter(projectRoot: string, orchestrator: Orchestrator): Router {
  const router = Router();
  const runManager = new RunManager(projectRoot);

  // List CRPs for a run
  router.get('/:runId', async (req: Request, res: Response) => {
    const { runId } = req.params;

    if (!(await runManager.runExists(runId))) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    const crps = await runManager.listCRPs(runId);
    const response: ApiResponse<CRP[]> = {
      success: true,
      data: crps,
    };
    res.json(response);
  });

  // Get specific CRP
  router.get('/:runId/:crpId', async (req: Request, res: Response) => {
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

    const response: ApiResponse<CRP> = {
      success: true,
      data: crp,
    };
    res.json(response);
  });

  // Submit VCR (response to CRP)
  router.post('/:runId/:crpId/respond', async (req: Request, res: Response) => {
    const { runId, crpId } = req.params;
    const { decision, decisions, rationale, additionalNotes, appliesToFuture } = req.body;

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

    // Validate decision based on CRP format (single vs multi-question)
    const isMultiQuestion = crp.questions && Array.isArray(crp.questions);

    if (isMultiQuestion) {
      // Multi-question validation
      const decisionsToValidate = decisions || decision;
      if (typeof decisionsToValidate !== 'object') {
        const response: ApiResponse<null> = {
          success: false,
          error: 'Multi-question CRP requires decisions object',
        };
        return res.status(400).json(response);
      }

      for (const q of crp.questions!) {
        const selectedOption = decisionsToValidate[q.id];
        if (!selectedOption && q.required !== false) {
          const response: ApiResponse<null> = {
            success: false,
            error: `Missing answer for question: ${q.id}`,
          };
          return res.status(400).json(response);
        }
        if (selectedOption && q.options) {
          const validOptions = q.options.map(o => o.id);
          if (!validOptions.includes(selectedOption)) {
            const response: ApiResponse<null> = {
              success: false,
              error: `Invalid option "${selectedOption}" for question ${q.id}. Must be one of: ${validOptions.join(', ')}`,
            };
            return res.status(400).json(response);
          }
        }
      }
    } else {
      // Single question validation (legacy)
      if (crp.options && crp.options.length > 0) {
        const validOptions = crp.options.map(o => o.id);
        if (!validOptions.includes(decision)) {
          const response: ApiResponse<null> = {
            success: false,
            error: `Invalid decision. Must be one of: ${validOptions.join(', ')}`,
          };
          return res.status(400).json(response);
        }
      }
    }

    // Create VCR
    const vcrId = `vcr-${Date.now()}`;
    const vcr: VCR = {
      vcr_id: vcrId,
      crp_id: crpId,
      created_at: new Date().toISOString(),
      decision: isMultiQuestion ? (decisions || decision) : decision,
      decisions: isMultiQuestion ? (decisions || decision) : undefined,
      rationale: rationale || '',
      additional_notes: additionalNotes,
      applies_to_future: appliesToFuture || false,
    };

    // Save VCR
    await runManager.saveVCR(runId, vcr);

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
  router.get('/:runId/vcr', async (req: Request, res: Response) => {
    const { runId } = req.params;

    if (!(await runManager.runExists(runId))) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Run not found',
      };
      return res.status(404).json(response);
    }

    const vcrs = await runManager.listVCRs(runId);
    const response: ApiResponse<VCR[]> = {
      success: true,
      data: vcrs,
    };
    res.json(response);
  });

  return router;
}
