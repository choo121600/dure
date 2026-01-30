/**
 * Mission Routes - REST API for mission management
 *
 * Provides endpoints for listing, viewing, and controlling missions.
 */
import { Router, Request, Response } from 'express';
import { MissionManager } from '../../core/mission-manager.js';
import { KanbanStateManager } from '../../core/kanban-state-manager.js';
import { isOk, isErr } from '../../types/result.js';
import type { MissionId, PhaseId, TaskId } from '../../types/branded.js';
import type { ApiResponse, Mission, KanbanState } from '../../types/index.js';

// ============================================================================
// Types
// ============================================================================

interface MissionSummary {
  mission_id: string;
  title: string;
  status: string;
  stats: {
    total_phases: number;
    total_tasks: number;
    completed_tasks: number;
    failed_tasks: number;
  };
  created_at: string;
  updated_at: string;
}

interface RunOptions {
  phase?: number;
  task?: string;
  continueOnFailure?: boolean;
}

// ============================================================================
// Route Factory
// ============================================================================

export function createMissionRoutes(projectRoot: string): Router {
  const router = Router();
  const missionManager = new MissionManager(projectRoot);

  /**
   * GET /api/missions
   * List all missions
   */
  router.get('/missions', async (_req: Request, res: Response) => {
    const result = await missionManager.listMissions();

    if (isErr(result)) {
      const response: ApiResponse<null> = {
        success: false,
        error: result.error.message,
      };
      return res.status(500).json(response);
    }

    const missions: MissionSummary[] = result.data.map(m => ({
      mission_id: m.mission_id,
      title: m.title,
      status: m.status,
      stats: m.stats,
      created_at: m.created_at,
      updated_at: m.updated_at,
    }));

    const response: ApiResponse<{ missions: MissionSummary[] }> = {
      success: true,
      data: { missions },
    };
    res.json(response);
  });

  /**
   * GET /api/missions/:id
   * Get mission details
   */
  router.get('/missions/:id', async (req: Request, res: Response) => {
    const missionId = req.params.id as MissionId;
    const result = await missionManager.getMission(missionId);

    if (isErr(result)) {
      const status = result.error.code === 'MISSION_NOT_FOUND' ? 404 : 500;
      const response: ApiResponse<null> = {
        success: false,
        error: result.error.message,
      };
      return res.status(status).json(response);
    }

    const response: ApiResponse<{ mission: Mission }> = {
      success: true,
      data: { mission: result.data },
    };
    res.json(response);
  });

  /**
   * GET /api/missions/:id/kanban
   * Get mission kanban state
   */
  router.get('/missions/:id/kanban', async (req: Request, res: Response) => {
    const missionId = req.params.id as MissionId;
    const kanbanManager = new KanbanStateManager(projectRoot, missionId);

    const result = await kanbanManager.load();

    if (isErr(result)) {
      const response: ApiResponse<null> = {
        success: false,
        error: result.error.message,
      };
      return res.status(404).json(response);
    }

    const response: ApiResponse<{ kanban: KanbanState }> = {
      success: true,
      data: { kanban: result.data },
    };
    res.json(response);
  });

  /**
   * POST /api/missions/:id/run
   * Run a mission phase or task
   */
  router.post('/missions/:id/run', async (req: Request, res: Response) => {
    const missionId = req.params.id as MissionId;
    const { phase, task, continueOnFailure }: RunOptions = req.body;

    // Validate request
    if (phase === undefined && !task) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Either phase or task must be specified',
      };
      return res.status(400).json(response);
    }

    try {
      if (task) {
        // Run specific task
        const taskResult = await missionManager.runTask(missionId, task as TaskId);

        if (isErr(taskResult)) {
          const response: ApiResponse<null> = {
            success: false,
            error: taskResult.error.message,
          };
          return res.status(500).json(response);
        }

        const response: ApiResponse<{ result: typeof taskResult.data }> = {
          success: true,
          data: { result: taskResult.data },
        };
        res.json(response);
      } else if (phase !== undefined) {
        // Run specific phase
        const phaseResult = await missionManager.runPhase(missionId, phase, {
          continueOnFailure: continueOnFailure ?? false,
        });

        if (isErr(phaseResult)) {
          const response: ApiResponse<null> = {
            success: false,
            error: phaseResult.error.message,
          };
          return res.status(500).json(response);
        }

        const response: ApiResponse<{ result: typeof phaseResult.data }> = {
          success: true,
          data: { result: phaseResult.data },
        };
        res.json(response);
      } else {
        const response: ApiResponse<null> = {
          success: false,
          error: 'No operation performed',
        };
        return res.status(400).json(response);
      }
    } catch (error) {
      const response: ApiResponse<null> = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      res.status(500).json(response);
    }
  });

  /**
   * POST /api/missions/:id/approve
   * Approve a mission plan
   */
  router.post('/missions/:id/approve', async (req: Request, res: Response) => {
    const missionId = req.params.id as MissionId;

    const result = await missionManager.approvePlan(missionId);

    if (isErr(result)) {
      const response: ApiResponse<null> = {
        success: false,
        error: result.error.message,
      };
      return res.status(500).json(response);
    }

    const response: ApiResponse<{ approved: boolean }> = {
      success: true,
      data: { approved: true },
    };
    res.json(response);
  });

  /**
   * POST /api/missions/:id/retry/:taskId
   * Retry a failed task
   */
  router.post('/missions/:id/retry/:taskId', async (req: Request, res: Response) => {
    const missionId = req.params.id as MissionId;
    const taskId = req.params.taskId as TaskId;

    const result = await missionManager.retryTask(missionId, taskId);

    if (isErr(result)) {
      const response: ApiResponse<null> = {
        success: false,
        error: result.error.message,
      };
      return res.status(500).json(response);
    }

    const response: ApiResponse<{ retried: boolean; runId?: string }> = {
      success: true,
      data: { retried: true, runId: result.data },
    };
    res.json(response);
  });

  /**
   * POST /api/missions/:id/skip/:taskId
   * Skip a task
   */
  router.post('/missions/:id/skip/:taskId', async (req: Request, res: Response) => {
    const missionId = req.params.id as MissionId;
    const taskId = req.params.taskId as TaskId;
    const { reason } = req.body;

    const result = await missionManager.skipTask(missionId, taskId, reason);

    if (isErr(result)) {
      const response: ApiResponse<null> = {
        success: false,
        error: result.error.message,
      };
      return res.status(500).json(response);
    }

    const response: ApiResponse<{ skipped: boolean }> = {
      success: true,
      data: { skipped: true },
    };
    res.json(response);
  });

  /**
   * DELETE /api/missions/:id
   * Delete a mission
   */
  router.delete('/missions/:id', async (req: Request, res: Response) => {
    const missionId = req.params.id as MissionId;

    const result = await missionManager.deleteMission(missionId);

    if (isErr(result)) {
      const response: ApiResponse<null> = {
        success: false,
        error: result.error.message,
      };
      return res.status(500).json(response);
    }

    const response: ApiResponse<{ deleted: boolean }> = {
      success: true,
      data: { deleted: true },
    };
    res.json(response);
  });

  return router;
}
