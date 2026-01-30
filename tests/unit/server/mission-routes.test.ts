/**
 * Tests for Mission API Routes
 *
 * Tests the REST API endpoints for mission management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import express, { Express } from 'express';
import request from 'supertest';
import { createMissionRoutes } from '../../../src/server/dashboard/mission-routes.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockMission,
  createMockPhase,
  createMockTask,
} from '../../helpers/test-utils.js';
import type { Mission, KanbanState } from '../../../src/types/mission.js';
import type { MissionId, TaskId, PhaseId } from '../../../src/types/branded.js';

describe('Mission API Routes', () => {
  let tempDir: string;
  let app: Express;
  let missionId: MissionId;

  beforeEach(async () => {
    tempDir = createTempDir('mission-routes-test');
    missionId = 'mission-20260130000000' as MissionId;

    // Create mission directory and files
    const missionDir = join(tempDir, '.dure', 'missions', missionId);
    mkdirSync(missionDir, { recursive: true });

    // Create mock mission
    const task1 = createMockTask(1, 1, { status: 'pending' });
    const task2 = createMockTask(1, 2, {
      depends_on: ['task-1.1' as TaskId],
      status: 'pending',
    });
    const phase1 = createMockPhase(1, { tasks: [task1, task2] });
    const mission = createMockMission({
      mission_id: missionId,
      phases: [phase1],
      planning: {
        stage: 'approved',
        iterations: 1,
        drafts: [],
        critiques: [],
      },
      status: 'ready',
      stats: {
        total_phases: 1,
        total_tasks: 2,
        completed_tasks: 0,
        failed_tasks: 0,
      },
    }) as Mission;

    writeFileSync(
      join(missionDir, 'mission.json'),
      JSON.stringify(mission, null, 2)
    );

    // Create mock kanban state
    const kanban: KanbanState = {
      mission_id: missionId,
      mission_title: mission.title,
      planning_stage: 'approved',
      columns: [
        {
          phase_id: 'phase-1' as PhaseId,
          number: 1,
          title: 'Phase 1',
          status: 'pending',
          cards: [
            {
              task_id: 'task-1.1' as TaskId,
              phase_id: 'phase-1' as PhaseId,
              title: 'Task 1.1',
              status: 'pending',
              depends_on: [],
              blocked_by: [],
            },
            {
              task_id: 'task-1.2' as TaskId,
              phase_id: 'phase-1' as PhaseId,
              title: 'Task 1.2',
              status: 'blocked',
              depends_on: ['task-1.1' as TaskId],
              blocked_by: ['task-1.1' as TaskId],
            },
          ],
        },
      ],
      stats: {
        total_tasks: 2,
        pending: 1,
        blocked: 1,
        in_progress: 0,
        passed: 0,
        failed: 0,
        needs_human: 0,
      },
      updated_at: new Date().toISOString(),
    };

    writeFileSync(join(missionDir, 'kanban.json'), JSON.stringify(kanban, null, 2));

    // Create express app with mission routes
    app = express();
    app.use(express.json());
    app.use('/api', createMissionRoutes(tempDir));
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('GET /api/missions', () => {
    it('should return list of missions', async () => {
      const res = await request(app).get('/api/missions');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.missions).toBeInstanceOf(Array);
      expect(res.body.data.missions.length).toBe(1);
      expect(res.body.data.missions[0].mission_id).toBe(missionId);
    });

    it('should return empty array when no missions exist', async () => {
      // Clean up mission directory
      cleanupTempDir(join(tempDir, '.dure', 'missions', missionId));

      const res = await request(app).get('/api/missions');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.missions).toHaveLength(0);
    });
  });

  describe('GET /api/missions/:id', () => {
    it('should return mission details', async () => {
      const res = await request(app).get(`/api/missions/${missionId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mission).toBeDefined();
      expect(res.body.data.mission.mission_id).toBe(missionId);
    });

    it('should return 404 for non-existent mission', async () => {
      const res = await request(app).get('/api/missions/mission-nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/missions/:id/kanban', () => {
    it('should return kanban state', async () => {
      const res = await request(app).get(`/api/missions/${missionId}/kanban`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.kanban).toBeDefined();
      expect(res.body.data.kanban.mission_id).toBe(missionId);
      expect(res.body.data.kanban.columns).toBeInstanceOf(Array);
    });

    it('should return 404 for mission without kanban', async () => {
      const res = await request(app).get('/api/missions/mission-nonexistent/kanban');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/missions/:id/run', () => {
    it('should return 400 when neither phase nor task specified', async () => {
      const res = await request(app)
        .post(`/api/missions/${missionId}/run`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Either phase or task must be specified');
    });
  });

  describe('POST /api/missions/:id/approve', () => {
    it('should approve a pending plan', async () => {
      // Update mission to needs_human state
      const missionDir = join(tempDir, '.dure', 'missions', missionId);
      const missionPath = join(missionDir, 'mission.json');
      const mission = JSON.parse(require('fs').readFileSync(missionPath, 'utf-8'));
      mission.planning.stage = 'needs_human';
      mission.status = 'plan_review';
      writeFileSync(missionPath, JSON.stringify(mission, null, 2));

      const res = await request(app).post(`/api/missions/${missionId}/approve`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.approved).toBe(true);
    });

    it('should return error for already approved plan', async () => {
      const res = await request(app).post(`/api/missions/${missionId}/approve`);

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/missions/:id/skip/:taskId', () => {
    it('should skip a task', async () => {
      const res = await request(app)
        .post(`/api/missions/${missionId}/skip/task-1.1`)
        .send({ reason: 'Test skip' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.skipped).toBe(true);
    });

    it('should return error for non-existent task', async () => {
      const res = await request(app)
        .post(`/api/missions/${missionId}/skip/task-99.99`)
        .send({});

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/missions/:id', () => {
    it('should delete a mission', async () => {
      const res = await request(app).delete(`/api/missions/${missionId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.deleted).toBe(true);

      // Verify mission is deleted
      const checkRes = await request(app).get(`/api/missions/${missionId}`);
      expect(checkRes.status).toBe(404);
    });
  });
});
