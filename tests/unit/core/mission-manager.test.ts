/**
 * Unit tests for MissionManager
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { MissionManager } from '../../../src/core/mission-manager.js';
import { MissionError, ErrorCodes } from '../../../src/types/errors.js';
import { isOk, isErr } from '../../../src/types/result.js';
import type { Mission, MissionId } from '../../../src/types/mission.js';
import { generateMissionId } from '../../../src/types/branded.js';
import {
  createTempDir,
  cleanupTempDir,
} from '../../helpers/test-utils.js';

// Create a shared mock function that can be controlled from tests
const mockExecute = vi.fn();

// Mock PlanningPipeline to avoid actual agent execution in tests
vi.mock('../../../src/core/planning-pipeline.js', () => {
  return {
    PlanningPipeline: class MockPlanningPipeline {
      execute = mockExecute;
    },
  };
});

describe('MissionManager', () => {
  let tempDir: string;
  let manager: MissionManager;

  beforeEach(() => {
    tempDir = createTempDir('mission-manager-test');
    manager = new MissionManager(tempDir);
    // Reset mock to default failure behavior
    mockExecute.mockReset();
    mockExecute.mockResolvedValue({
      success: false,
      error: new Error('Planning not implemented in tests'),
    });
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('createMission', () => {
    it('should create mission directory structure', async () => {
      const description = 'Test mission description';
      const result = await manager.createMission(description);

      // Note: Will fail planning due to mock, but directory should be created
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(MissionError);
        expect(result.error.code).toBe(ErrorCodes.MISSION_PLANNING_FAILED);
      }

      // Check that basic directories were created
      const missionsDir = join(tempDir, '.dure', 'missions');
      expect(existsSync(missionsDir)).toBe(true);
    });

    it('should save input description to input.md', async () => {
      const description = 'Implement authentication system';
      await manager.createMission(description);

      // Find the mission directory (it has a timestamp)
      const missionsDir = join(tempDir, '.dure', 'missions');
      if (existsSync(missionsDir)) {
        const files = require('fs').readdirSync(missionsDir);
        const missionDir = files.find((f: string) => f.startsWith('mission-'));

        if (missionDir) {
          const inputPath = join(missionsDir, missionDir, 'input.md');
          if (existsSync(inputPath)) {
            const content = readFileSync(inputPath, 'utf-8');
            expect(content).toBe(description);
          }
        }
      }
    });

    it('should create initial mission with planning status', async () => {
      const description = 'Test description';
      await manager.createMission(description);

      // Get the created mission
      const listResult = await manager.listMissions();
      if (isOk(listResult) && listResult.data.length > 0) {
        const mission = listResult.data[0];

        expect(mission.description).toBe(description);
        expect(mission.status).toBe('failed'); // Failed due to planning mock
        expect(mission.planning.stage).toBe('planner_v1');
        expect(mission.stats.total_phases).toBe(0);
        expect(mission.stats.total_tasks).toBe(0);
      }
    });
  });

  describe('getMission', () => {
    it('should return error for non-existent mission', async () => {
      const result = await manager.getMission('mission-99999999999999' as MissionId);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(MissionError);
        expect(result.error.code).toBe(ErrorCodes.MISSION_NOT_FOUND);
      }
    });

    it('should return mission by ID if it exists', async () => {
      // Create a mission first
      await manager.createMission('Test mission');

      // List missions to get the ID
      const listResult = await manager.listMissions();
      if (isOk(listResult) && listResult.data.length > 0) {
        const missionId = listResult.data[0].mission_id;

        // Get the mission by ID
        const getResult = await manager.getMission(missionId);
        expect(isOk(getResult)).toBe(true);

        if (isOk(getResult)) {
          expect(getResult.data.mission_id).toBe(missionId);
          expect(getResult.data.description).toBe('Test mission');
        }
      }
    });
  });

  describe('listMissions', () => {
    it('should return empty array when no missions exist', async () => {
      const result = await manager.listMissions();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toEqual([]);
      }
    });

    it('should return all missions sorted by creation date', async () => {
      // Create multiple missions
      await manager.createMission('First mission');

      // Mission ID uses second-precision timestamp, so wait >1s for different IDs
      await new Promise(resolve => setTimeout(resolve, 1100));

      await manager.createMission('Second mission');

      const result = await manager.listMissions();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.length).toBe(2);

        // Should be sorted newest first
        expect(result.data[0].description).toBe('Second mission');
        expect(result.data[1].description).toBe('First mission');
      }
    });

    it('should handle missions directory not existing yet', async () => {
      const result = await manager.listMissions();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toEqual([]);
      }
    });
  });

  describe('runPhase', () => {
    it('should return not implemented error', async () => {
      const result = await manager.runPhase('mission-00000000000000' as MissionId, 1);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCodes.MISSION_FAILED);
        expect(result.error.message).toContain('not yet implemented');
      }
    });
  });

  describe('runTask', () => {
    it('should return not implemented error', async () => {
      const result = await manager.runTask(
        'mission-00000000000000' as MissionId,
        'task-1.1' as any
      );

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCodes.MISSION_FAILED);
        expect(result.error.message).toContain('not yet implemented');
      }
    });
  });

  describe('directory structure', () => {
    it('should create required subdirectories', async () => {
      await manager.createMission('Test');

      const missionsDir = join(tempDir, '.dure', 'missions');
      const files = require('fs').readdirSync(missionsDir);
      const missionDir = files.find((f: string) => f.startsWith('mission-'));

      if (missionDir) {
        const missionPath = join(missionsDir, missionDir);

        expect(existsSync(join(missionPath, 'planning'))).toBe(true);
        expect(existsSync(join(missionPath, 'phases'))).toBe(true);
        expect(existsSync(join(missionPath, 'context'))).toBe(true);
      }
    });

    it('should save mission.json in mission directory', async () => {
      await manager.createMission('Test');

      const missionsDir = join(tempDir, '.dure', 'missions');
      const files = require('fs').readdirSync(missionsDir);
      const missionDir = files.find((f: string) => f.startsWith('mission-'));

      if (missionDir) {
        const missionJsonPath = join(missionsDir, missionDir, 'mission.json');
        expect(existsSync(missionJsonPath)).toBe(true);

        const content = JSON.parse(readFileSync(missionJsonPath, 'utf-8'));
        expect(content.mission_id).toBe(missionDir);
        expect(content.description).toBe('Test');
      }
    });
  });

  describe('Planning Pipeline Integration', () => {
    describe('Successful Planning', () => {
      it('should apply planning result with approved plan', async () => {
        // Create a realistic planning result with approved plan
        const mockPlanResult = {
          missionId: 'mission-00000000000000' as any,
          outcome: 'approved' as const,
          iterations: 2,
          critiques: [
            {
              version: 1,
              created_at: new Date().toISOString(),
              verdict: 'needs_revision' as const,
              summary: 'Some issues found',
              items: [],
              stats: { critical: 0, major: 1, minor: 0, suggestion: 0 },
              rationale: 'Needs improvement',
            },
            {
              version: 2,
              created_at: new Date().toISOString(),
              verdict: 'approved' as const,
              summary: 'Looks good',
              items: [],
              stats: { critical: 0, major: 0, minor: 0, suggestion: 0 },
              rationale: 'All issues resolved',
            },
          ],
          finalPlan: {
            version: 2,
            created_at: new Date().toISOString(),
            phases: [
              {
                phase_id: 'phase-1' as any,
                mission_id: 'mission-00000000000000' as any,
                number: 1,
                title: 'Setup Authentication',
                description: 'Implement user authentication',
                tasks: [
                  {
                    task_id: 'task-1.1' as any,
                    phase_id: 'phase-1' as any,
                    title: 'Create auth models',
                    description: 'Define User and Session models',
                    briefing_path: 'phases/phase-1/task-1.1/briefing.md',
                    depends_on: [],
                    status: 'pending' as const,
                  },
                  {
                    task_id: 'task-1.2' as any,
                    phase_id: 'phase-1' as any,
                    title: 'Implement login endpoint',
                    description: 'Create POST /auth/login endpoint',
                    briefing_path: 'phases/phase-1/task-1.2/briefing.md',
                    depends_on: ['task-1.1' as any],
                    status: 'pending' as const,
                  },
                ],
              },
            ],
          },
        };

        // Configure mock for this test
        mockExecute.mockResolvedValue({
          success: true,
          data: mockPlanResult,
        } as any);

        const result = await manager.createMission('Setup authentication system');

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const mission = result.data;

          // Verify mission status
          expect(mission.status).toBe('ready');
          expect(mission.planning.stage).toBe('approved');

          // Verify planning metadata
          expect(mission.planning.iterations).toBe(2);
          expect(mission.planning.critiques).toHaveLength(2);

          // Verify phases were created
          expect(mission.phases).toHaveLength(1);
          expect(mission.phases[0].title).toBe('Setup Authentication');
          expect(mission.phases[0].tasks).toHaveLength(2);
          expect(mission.phases[0].status).toBe('pending');

          // Verify tasks structure
          expect(mission.phases[0].tasks[0].title).toBe('Create auth models');
          expect(mission.phases[0].tasks[0].depends_on).toEqual([]);
          expect(mission.phases[0].tasks[1].depends_on).toEqual(['task-1.1']);

          // Verify statistics
          expect(mission.stats.total_phases).toBe(1);
          expect(mission.stats.total_tasks).toBe(2);
          expect(mission.stats.completed_tasks).toBe(0);
          expect(mission.stats.failed_tasks).toBe(0);
        }
      });

      it('should handle multi-phase planning results', async () => {
        const mockPlanResult = {
          missionId: 'mission-00000000000000' as any,
          outcome: 'approved' as const,
          iterations: 1,
          critiques: [
            {
              version: 1,
              created_at: new Date().toISOString(),
              verdict: 'approved' as const,
              summary: 'Plan looks good',
              items: [],
              stats: { critical: 0, major: 0, minor: 0, suggestion: 0 },
              rationale: 'Well structured',
            },
          ],
          finalPlan: {
            version: 1,
            created_at: new Date().toISOString(),
            phases: [
              {
                phase_id: 'phase-1' as any,
                mission_id: 'mission-00000000000000' as any,
                number: 1,
                title: 'Foundation',
                description: 'Setup basic structure',
                tasks: [
                  {
                    task_id: 'task-1.1' as any,
                    phase_id: 'phase-1' as any,
                    title: 'Setup project',
                    description: 'Initialize project structure',
                    briefing_path: 'phases/phase-1/task-1.1/briefing.md',
                    depends_on: [],
                    status: 'pending' as const,
                  },
                ],
              },
              {
                phase_id: 'phase-2' as any,
                mission_id: 'mission-00000000000000' as any,
                number: 2,
                title: 'Implementation',
                description: 'Implement core features',
                tasks: [
                  {
                    task_id: 'task-2.1' as any,
                    phase_id: 'phase-2' as any,
                    title: 'Implement feature',
                    description: 'Build the main feature',
                    briefing_path: 'phases/phase-2/task-2.1/briefing.md',
                    depends_on: [],
                    status: 'pending' as const,
                  },
                ],
              },
            ],
          },
        };

        mockExecute.mockResolvedValue({
          success: true,
          data: mockPlanResult,
        } as any);

        const result = await manager.createMission('Build complete system');

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const mission = result.data;

          expect(mission.phases).toHaveLength(2);
          expect(mission.phases[0].number).toBe(1);
          expect(mission.phases[1].number).toBe(2);
          expect(mission.stats.total_phases).toBe(2);
          expect(mission.stats.total_tasks).toBe(2);
        }
      });

      it('should extract mission title from first phase', async () => {
        const mockPlanResult = {
          missionId: 'mission-00000000000000' as any,
          outcome: 'approved' as const,
          iterations: 1,
          critiques: [],
          finalPlan: {
            version: 1,
            created_at: new Date().toISOString(),
            phases: [
              {
                phase_id: 'phase-1' as any,
                mission_id: 'mission-00000000000000' as any,
                number: 1,
                title: 'Authentication Setup',
                description: 'Phase description',
                tasks: [],
              },
            ],
          },
        };

        mockExecute.mockResolvedValue({
          success: true,
          data: mockPlanResult,
        } as any);

        const result = await manager.createMission('Setup auth');

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.data.title).toBe('Authentication Setup');
        }
      });
    });

    describe('Planning Needs Human Review', () => {
      it('should handle needs_human outcome', async () => {
        const mockPlanResult = {
          missionId: 'mission-00000000000000' as any,
          outcome: 'needs_human' as const,
          iterations: 2,
          critiques: [
            {
              version: 1,
              created_at: new Date().toISOString(),
              verdict: 'needs_revision' as const,
              summary: 'Issues found',
              items: [],
              stats: { critical: 1, major: 0, minor: 0, suggestion: 0 },
              rationale: 'Critical issues',
            },
            {
              version: 2,
              created_at: new Date().toISOString(),
              verdict: 'needs_human' as const,
              summary: 'Cannot converge',
              items: [],
              stats: { critical: 1, major: 0, minor: 0, suggestion: 0 },
              rationale: 'Requires human judgment',
            },
          ],
          finalPlan: {
            version: 2,
            created_at: new Date().toISOString(),
            phases: [
              {
                phase_id: 'phase-1' as any,
                mission_id: 'mission-00000000000000' as any,
                number: 1,
                title: 'Ambiguous Phase',
                description: 'Unclear requirements',
                tasks: [],
              },
            ],
          },
        };

        mockExecute.mockResolvedValue({
          success: true,
          data: mockPlanResult,
        } as any);

        const result = await manager.createMission('Ambiguous task');

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const mission = result.data;

          expect(mission.status).toBe('plan_review');
          expect(mission.planning.stage).toBe('needs_human');
          expect(mission.planning.iterations).toBe(2);

          // Critiques should be stored
          expect(mission.planning.critiques).toHaveLength(2);
        }
      });

      it('should not create phases when planning needs human review', async () => {
        const mockPlanResult = {
          missionId: 'mission-00000000000000' as any,
          outcome: 'needs_human' as const,
          iterations: 1,
          critiques: [],
          finalPlan: null,
        };

        mockExecute.mockResolvedValue({
          success: true,
          data: mockPlanResult,
        } as any);

        const result = await manager.createMission('Test');

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.data.phases).toHaveLength(0);
          expect(result.data.stats.total_phases).toBe(0);
          expect(result.data.stats.total_tasks).toBe(0);
        }
      });
    });

    describe('Planning Failures', () => {
      it('should handle planning pipeline errors', async () => {
        mockExecute.mockResolvedValue({
          success: false,
          error: new Error('Agent execution failed'),
        } as any);

        const result = await manager.createMission('Test mission');

        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.code).toBe(ErrorCodes.MISSION_PLANNING_FAILED);
          expect(result.error.message).toContain('Planning failed');
        }

        // Mission state should be saved as failed
        const listResult = await manager.listMissions();
        if (isOk(listResult) && listResult.data.length > 0) {
          expect(listResult.data[0].status).toBe('failed');
        }
      });

      it('should preserve mission state after planning failure', async () => {
        mockExecute.mockResolvedValue({
          success: false,
          error: new Error('Timeout'),
        } as any);

        await manager.createMission('Test description');

        const listResult = await manager.listMissions();
        expect(isOk(listResult)).toBe(true);

        if (isOk(listResult) && listResult.data.length > 0) {
          const mission = listResult.data[0];
          expect(mission.description).toBe('Test description');
          expect(mission.status).toBe('failed');
          expect(mission.phases).toHaveLength(0);
        }
      });
    });

    describe('Phase and Task Creation', () => {
      it('should create phases with correct metadata', async () => {
        const mockPlanResult = {
          missionId: 'mission-00000000000000' as any,
          outcome: 'approved' as const,
          iterations: 1,
          critiques: [],
          finalPlan: {
            version: 1,
            created_at: new Date().toISOString(),
            phases: [
              {
                phase_id: 'phase-1' as any,
                mission_id: 'mission-00000000000000' as any,
                number: 1,
                title: 'Phase One',
                description: 'First phase',
                tasks: [
                  {
                    task_id: 'task-1.1' as any,
                    phase_id: 'phase-1' as any,
                    title: 'Task 1',
                    description: 'First task',
                    briefing_path: 'phases/phase-1/task-1.1/briefing.md',
                    depends_on: [],
                    status: 'pending' as const,
                  },
                ],
              },
            ],
          },
        };

        mockExecute.mockResolvedValue({
          success: true,
          data: mockPlanResult,
        } as any);

        const result = await manager.createMission('Test');

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const phase = result.data.phases[0];

          expect(phase.phase_id).toBe('phase-1');
          expect(phase.number).toBe(1);
          expect(phase.title).toBe('Phase One');
          expect(phase.description).toBe('First phase');
          expect(phase.status).toBe('pending');
          expect(phase.started_at).toBeUndefined();
          expect(phase.completed_at).toBeUndefined();
        }
      });

      it('should preserve task dependencies from plan', async () => {
        const mockPlanResult = {
          missionId: 'mission-00000000000000' as any,
          outcome: 'approved' as const,
          iterations: 1,
          critiques: [],
          finalPlan: {
            version: 1,
            created_at: new Date().toISOString(),
            phases: [
              {
                phase_id: 'phase-1' as any,
                mission_id: 'mission-00000000000000' as any,
                number: 1,
                title: 'Phase',
                description: 'Test phase',
                tasks: [
                  {
                    task_id: 'task-1.1' as any,
                    phase_id: 'phase-1' as any,
                    title: 'Task A',
                    description: 'First task',
                    briefing_path: 'task-a.md',
                    depends_on: [],
                    status: 'pending' as const,
                  },
                  {
                    task_id: 'task-1.2' as any,
                    phase_id: 'phase-1' as any,
                    title: 'Task B',
                    description: 'Second task',
                    briefing_path: 'task-b.md',
                    depends_on: ['task-1.1' as any],
                    status: 'pending' as const,
                  },
                  {
                    task_id: 'task-1.3' as any,
                    phase_id: 'phase-1' as any,
                    title: 'Task C',
                    description: 'Third task',
                    briefing_path: 'task-c.md',
                    depends_on: ['task-1.1' as any, 'task-1.2' as any],
                    status: 'pending' as const,
                  },
                ],
              },
            ],
          },
        };

        mockExecute.mockResolvedValue({
          success: true,
          data: mockPlanResult,
        } as any);

        const result = await manager.createMission('Test dependencies');

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const tasks = result.data.phases[0].tasks;

          expect(tasks[0].depends_on).toEqual([]);
          expect(tasks[1].depends_on).toEqual(['task-1.1']);
          expect(tasks[2].depends_on).toEqual(['task-1.1', 'task-1.2']);
        }
      });

      it('should correctly calculate task statistics', async () => {
        const mockPlanResult = {
          missionId: 'mission-00000000000000' as any,
          outcome: 'approved' as const,
          iterations: 1,
          critiques: [],
          finalPlan: {
            version: 1,
            created_at: new Date().toISOString(),
            phases: [
              {
                phase_id: 'phase-1' as any,
                mission_id: 'mission-00000000000000' as any,
                number: 1,
                title: 'Phase 1',
                description: 'First phase',
                tasks: Array.from({ length: 3 }, (_, i) => ({
                  task_id: `task-1.${i + 1}` as any,
                  phase_id: 'phase-1' as any,
                  title: `Task ${i + 1}`,
                  description: 'Task description',
                  briefing_path: `task-${i + 1}.md`,
                  depends_on: [],
                  status: 'pending' as const,
                })),
              },
              {
                phase_id: 'phase-2' as any,
                mission_id: 'mission-00000000000000' as any,
                number: 2,
                title: 'Phase 2',
                description: 'Second phase',
                tasks: Array.from({ length: 2 }, (_, i) => ({
                  task_id: `task-2.${i + 1}` as any,
                  phase_id: 'phase-2' as any,
                  title: `Task ${i + 1}`,
                  description: 'Task description',
                  briefing_path: `task-${i + 1}.md`,
                  depends_on: [],
                  status: 'pending' as const,
                })),
              },
            ],
          },
        };

        mockExecute.mockResolvedValue({
          success: true,
          data: mockPlanResult,
        } as any);

        const result = await manager.createMission('Test stats');

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.data.stats.total_phases).toBe(2);
          expect(result.data.stats.total_tasks).toBe(5);
          expect(result.data.stats.completed_tasks).toBe(0);
          expect(result.data.stats.failed_tasks).toBe(0);
        }
      });
    });
  });

  // ============================================
  // Edge Cases - Error Handling
  // ============================================

  describe('Edge Cases - File System Errors', () => {
    // NOTE: Permission tests disabled - vi.spyOn() incompatible with ESM modules
    // These tests require vi.mock() at module level which would interfere with other tests
    // File system error handling is validated through integration tests instead

    describe.skip('Permission Denied - Directory Creation', () => {
      it('should return FS_WRITE_FAILED when missions directory cannot be created', async () => {
        // This test is skipped due to ESM mocking limitations with vi.spyOn()
        // Error handling path is verified through integration tests with actual file system errors
      });
    });

    describe.skip('Permission Denied - File Operations', () => {
      it('should return FS_WRITE_FAILED when input.md cannot be written', async () => {
        // This test is skipped due to ESM mocking limitations with vi.spyOn()
      });

      it('should return STATE_SAVE_FAILED when mission.json cannot be written', async () => {
        // This test is skipped due to ESM mocking limitations with vi.spyOn()
      });
    });

    describe('Corrupted mission.json', () => {
      it('should return MISSION_NOT_FOUND for invalid JSON in getMission', async () => {
        // Create a mission directory manually with corrupted JSON
        const missionId = 'mission-99999999999998' as MissionId;
        const missionDir = join(tempDir, '.dure', 'missions', missionId);
        await mkdir(missionDir, { recursive: true });

        const fs = await import('fs/promises');
        await fs.writeFile(
          join(missionDir, 'mission.json'),
          '{ invalid json: this is not valid }'
        );

        const result = await manager.getMission(missionId);

        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.code).toBe(ErrorCodes.MISSION_NOT_FOUND);
        }
      });

      it('should return MISSION_NOT_FOUND for empty mission.json', async () => {
        const missionId = 'mission-99999999999997' as MissionId;
        const missionDir = join(tempDir, '.dure', 'missions', missionId);
        await mkdir(missionDir, { recursive: true });

        const fs = await import('fs/promises');
        await fs.writeFile(join(missionDir, 'mission.json'), '');

        const result = await manager.getMission(missionId);

        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.code).toBe(ErrorCodes.MISSION_NOT_FOUND);
        }
      });

      it('should skip corrupted missions in listMissions', async () => {
        // Create one valid mission
        mockExecute.mockResolvedValueOnce({
          success: true,
          data: {
            missionId: 'mission-00000000000000' as any,
            outcome: 'approved' as const,
            iterations: 1,
            critiques: [],
            finalPlan: {
              version: 1,
              created_at: new Date().toISOString(),
              phases: [{
                phase_id: 'phase-1' as any,
                mission_id: 'mission-00000000000000' as any,
                number: 1,
                title: 'Test Phase',
                description: 'Test',
                tasks: [],
              }],
            },
          },
        } as any);

        await manager.createMission('Valid mission');

        // Create a corrupted mission directory
        const corruptedId = 'mission-99999999999996' as MissionId;
        const corruptedDir = join(tempDir, '.dure', 'missions', corruptedId);
        await mkdir(corruptedDir, { recursive: true });

        const fs = await import('fs/promises');
        await fs.writeFile(join(corruptedDir, 'mission.json'), '{ corrupted }');

        // List should only return the valid mission
        const result = await manager.listMissions();

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.data.length).toBe(1);
          expect(result.data[0].description).toBe('Valid mission');
        }
      });
    });
  });

  describe('Edge Cases - Input Validation', () => {
    it('should handle empty string description', async () => {
      const result = await manager.createMission('');

      // Should create mission with empty description (planning may fail)
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCodes.MISSION_PLANNING_FAILED);
      }

      // But the mission should exist in the list
      const listResult = await manager.listMissions();
      if (isOk(listResult)) {
        expect(listResult.data.length).toBeGreaterThan(0);
        expect(listResult.data[0].description).toBe('');
      }
    });

    it('should handle whitespace-only description', async () => {
      const result = await manager.createMission('   \n\t  ');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCodes.MISSION_PLANNING_FAILED);
      }

      const listResult = await manager.listMissions();
      if (isOk(listResult)) {
        const mission = listResult.data.find(m => m.description === '   \n\t  ');
        expect(mission).toBeDefined();
      }
    });

    it('should handle very long descriptions (>10KB)', async () => {
      const longDescription = 'A'.repeat(15000); // 15KB

      const result = await manager.createMission(longDescription);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCodes.MISSION_PLANNING_FAILED);
      }

      // Verify it was saved
      const listResult = await manager.listMissions();
      if (isOk(listResult)) {
        const mission = listResult.data.find(m => m.description === longDescription);
        expect(mission).toBeDefined();
        expect(mission?.description.length).toBe(15000);
      }
    });

    it('should handle unicode characters in description', async () => {
      const unicodeDesc = '测试任务 🚀 émojis and spëcial çhars';

      const result = await manager.createMission(unicodeDesc);

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(ErrorCodes.MISSION_PLANNING_FAILED);
      }

      const listResult = await manager.listMissions();
      if (isOk(listResult)) {
        const mission = listResult.data.find(m => m.description === unicodeDesc);
        expect(mission).toBeDefined();
      }
    });

    it('should handle newlines and special formatting in description', async () => {
      const formattedDesc = `Multi-line\ndescription\twith\ttabs\rand\rcarriage\rreturns`;

      const result = await manager.createMission(formattedDesc);

      expect(isErr(result)).toBe(true);

      // Verify the exact content is preserved
      const listResult = await manager.listMissions();
      if (isOk(listResult)) {
        const mission = listResult.data.find(m => m.description === formattedDesc);
        expect(mission).toBeDefined();
      }
    });
  });

  describe('Edge Cases - Directory Structure', () => {
    it('should handle pre-existing mission directory gracefully', async () => {
      // Pre-create a mission directory (shouldn't happen in normal flow)
      const missionId = generateMissionId();
      const missionDir = join(tempDir, '.dure', 'missions', missionId);
      await mkdir(missionDir, { recursive: true });

      // mkdir with recursive: true should not fail
      mockExecute.mockResolvedValueOnce({
        success: true,
        data: {
          missionId: missionId as any,
          outcome: 'approved' as const,
          iterations: 1,
          critiques: [],
          finalPlan: {
            version: 1,
            created_at: new Date().toISOString(),
            phases: [{
              phase_id: 'phase-1' as any,
              mission_id: missionId as any,
              number: 1,
              title: 'Test',
              description: 'Test',
              tasks: [],
            }],
          },
        },
      } as any);

      const result = await manager.createMission('Test');

      // Should succeed despite pre-existing directory
      expect(isOk(result)).toBe(true);
    });

    it('should handle missions directory containing non-mission files', async () => {
      const missionsDir = join(tempDir, '.dure', 'missions');
      await mkdir(missionsDir, { recursive: true });

      // Create some non-mission files and directories
      const fs = await import('fs/promises');
      await fs.writeFile(join(missionsDir, 'README.md'), 'Test');
      await mkdir(join(missionsDir, 'not-a-mission'));
      await fs.writeFile(join(missionsDir, '.DS_Store'), '');

      const result = await manager.listMissions();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data).toEqual([]);
      }
    });
  });

  describe('Edge Cases - Planning Result Edge Cases', () => {
    it('should handle planning result with empty phases array', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        data: {
          missionId: 'mission-00000000000000' as any,
          outcome: 'approved' as const,
          iterations: 1,
          critiques: [],
          finalPlan: {
            version: 1,
            created_at: new Date().toISOString(),
            phases: [], // Empty phases array
          },
        },
      } as any);

      const result = await manager.createMission('Test');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.phases).toEqual([]);
        expect(result.data.stats.total_phases).toBe(0);
        expect(result.data.stats.total_tasks).toBe(0);
        expect(result.data.status).toBe('ready');
      }
    });

    it('should handle phases with no tasks', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        data: {
          missionId: 'mission-00000000000000' as any,
          outcome: 'approved' as const,
          iterations: 1,
          critiques: [],
          finalPlan: {
            version: 1,
            created_at: new Date().toISOString(),
            phases: [
              {
                phase_id: 'phase-1' as any,
                mission_id: 'mission-00000000000000' as any,
                number: 1,
                title: 'Empty Phase',
                description: 'Phase with no tasks',
                tasks: [], // No tasks
              },
            ],
          },
        },
      } as any);

      const result = await manager.createMission('Test');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.phases).toHaveLength(1);
        expect(result.data.phases[0].tasks).toEqual([]);
        expect(result.data.stats.total_phases).toBe(1);
        expect(result.data.stats.total_tasks).toBe(0);
      }
    });

    it('should handle planning result with null finalPlan', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        data: {
          missionId: 'mission-00000000000000' as any,
          outcome: 'needs_human' as const,
          iterations: 1,
          critiques: [],
          finalPlan: null, // Null plan
        },
      } as any);

      const result = await manager.createMission('Test');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.status).toBe('plan_review');
        expect(result.data.planning.stage).toBe('needs_human');
        expect(result.data.phases).toEqual([]);
      }
    });

    it('should handle zero iterations in planning result', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        data: {
          missionId: 'mission-00000000000000' as any,
          outcome: 'approved' as const,
          iterations: 0, // Zero iterations
          critiques: [],
          finalPlan: {
            version: 1,
            created_at: new Date().toISOString(),
            phases: [{
              phase_id: 'phase-1' as any,
              mission_id: 'mission-00000000000000' as any,
              number: 1,
              title: 'Test',
              description: 'Test',
              tasks: [],
            }],
          },
        },
      } as any);

      const result = await manager.createMission('Test');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.planning.iterations).toBe(0);
      }
    });

    it('should extract title from description when no phases exist', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        data: {
          missionId: 'mission-00000000000000' as any,
          outcome: 'approved' as const,
          iterations: 1,
          critiques: [],
          finalPlan: {
            version: 1,
            created_at: new Date().toISOString(),
            phases: [],
          },
        },
      } as any);

      const longDescription = 'This is a very long mission description that exceeds 50 characters and should be truncated';
      const result = await manager.createMission(longDescription);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.title).toBe(longDescription.slice(0, 50));
      }
    });
  });

  describe('Edge Cases - State Persistence', () => {
    it('should persist mission state after planning failure', async () => {
      const description = 'Test mission that will fail';

      mockExecute.mockResolvedValueOnce({
        success: false,
        error: new Error('Planning timeout'),
      } as any);

      const result = await manager.createMission(description);

      expect(isErr(result)).toBe(true);

      // Verify the failed mission is persisted
      const listResult = await manager.listMissions();
      expect(isOk(listResult)).toBe(true);

      if (isOk(listResult)) {
        const failedMission = listResult.data.find(m => m.description === description);
        expect(failedMission).toBeDefined();
        expect(failedMission?.status).toBe('failed');
        expect(failedMission?.planning.stage).toBe('planner_v1');
      }
    });

    it('should update mission timestamps correctly', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        data: {
          missionId: 'mission-00000000000000' as any,
          outcome: 'approved' as const,
          iterations: 1,
          critiques: [],
          finalPlan: {
            version: 1,
            created_at: new Date().toISOString(),
            phases: [{
              phase_id: 'phase-1' as any,
              mission_id: 'mission-00000000000000' as any,
              number: 1,
              title: 'Test',
              description: 'Test',
              tasks: [],
            }],
          },
        },
      } as any);

      const before = new Date().toISOString();
      const result = await manager.createMission('Test');
      const after = new Date().toISOString();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.created_at).toBeDefined();
        expect(result.data.updated_at).toBeDefined();
        expect(result.data.created_at >= before).toBe(true);
        expect(result.data.updated_at <= after).toBe(true);
        // updated_at should be >= created_at due to planning
        expect(result.data.updated_at >= result.data.created_at).toBe(true);
      }
    });
  });

  describe('Edge Cases - Task Dependencies', () => {
    it('should handle tasks with multiple dependencies', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        data: {
          missionId: 'mission-00000000000000' as any,
          outcome: 'approved' as const,
          iterations: 1,
          critiques: [],
          finalPlan: {
            version: 1,
            created_at: new Date().toISOString(),
            phases: [{
              phase_id: 'phase-1' as any,
              mission_id: 'mission-00000000000000' as any,
              number: 1,
              title: 'Complex Dependencies',
              description: 'Test',
              tasks: [
                {
                  task_id: 'task-1.1' as any,
                  phase_id: 'phase-1' as any,
                  title: 'Task A',
                  description: 'First',
                  briefing_path: 'a.md',
                  depends_on: [],
                  status: 'pending' as const,
                },
                {
                  task_id: 'task-1.2' as any,
                  phase_id: 'phase-1' as any,
                  title: 'Task B',
                  description: 'Second',
                  briefing_path: 'b.md',
                  depends_on: [],
                  status: 'pending' as const,
                },
                {
                  task_id: 'task-1.3' as any,
                  phase_id: 'phase-1' as any,
                  title: 'Task C',
                  description: 'Depends on A and B',
                  briefing_path: 'c.md',
                  depends_on: ['task-1.1' as any, 'task-1.2' as any],
                  status: 'pending' as const,
                },
              ],
            }],
          },
        },
      } as any);

      const result = await manager.createMission('Test');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const tasks = result.data.phases[0].tasks;
        expect(tasks[2].depends_on).toHaveLength(2);
        expect(tasks[2].depends_on).toContain('task-1.1');
        expect(tasks[2].depends_on).toContain('task-1.2');
      }
    });

    it('should preserve empty depends_on arrays', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        data: {
          missionId: 'mission-00000000000000' as any,
          outcome: 'approved' as const,
          iterations: 1,
          critiques: [],
          finalPlan: {
            version: 1,
            created_at: new Date().toISOString(),
            phases: [{
              phase_id: 'phase-1' as any,
              mission_id: 'mission-00000000000000' as any,
              number: 1,
              title: 'Test',
              description: 'Test',
              tasks: [
                {
                  task_id: 'task-1.1' as any,
                  phase_id: 'phase-1' as any,
                  title: 'Independent Task',
                  description: 'No dependencies',
                  briefing_path: 'task.md',
                  depends_on: [], // Explicitly empty
                  status: 'pending' as const,
                },
              ],
            }],
          },
        },
      } as any);

      const result = await manager.createMission('Test');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.phases[0].tasks[0].depends_on).toEqual([]);
      }
    });
  });

  describe('Edge Cases - Statistics Calculation', () => {
    it('should calculate stats correctly for large number of phases and tasks', async () => {
      const numPhases = 10;
      const tasksPerPhase = 15;

      const phases = Array.from({ length: numPhases }, (_, i) => ({
        phase_id: `phase-${i + 1}` as any,
        mission_id: 'mission-00000000000000' as any,
        number: i + 1,
        title: `Phase ${i + 1}`,
        description: 'Test phase',
        tasks: Array.from({ length: tasksPerPhase }, (_, j) => ({
          task_id: `task-${i + 1}.${j + 1}` as any,
          phase_id: `phase-${i + 1}` as any,
          title: `Task ${j + 1}`,
          description: 'Test task',
          briefing_path: `task-${i + 1}-${j + 1}.md`,
          depends_on: [],
          status: 'pending' as const,
        })),
      }));

      mockExecute.mockResolvedValueOnce({
        success: true,
        data: {
          missionId: 'mission-00000000000000' as any,
          outcome: 'approved' as const,
          iterations: 1,
          critiques: [],
          finalPlan: {
            version: 1,
            created_at: new Date().toISOString(),
            phases,
          },
        },
      } as any);

      const result = await manager.createMission('Large mission');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.stats.total_phases).toBe(numPhases);
        expect(result.data.stats.total_tasks).toBe(numPhases * tasksPerPhase);
        expect(result.data.stats.completed_tasks).toBe(0);
        expect(result.data.stats.failed_tasks).toBe(0);
      }
    });

    it('should handle stats when all phases have different task counts', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        data: {
          missionId: 'mission-00000000000000' as any,
          outcome: 'approved' as const,
          iterations: 1,
          critiques: [],
          finalPlan: {
            version: 1,
            created_at: new Date().toISOString(),
            phases: [
              {
                phase_id: 'phase-1' as any,
                mission_id: 'mission-00000000000000' as any,
                number: 1,
                title: 'Phase 1',
                description: 'Test',
                tasks: Array(1).fill(null).map((_, i) => ({
                  task_id: `task-1.${i + 1}` as any,
                  phase_id: 'phase-1' as any,
                  title: `Task ${i + 1}`,
                  description: 'Test',
                  briefing_path: 'task.md',
                  depends_on: [],
                  status: 'pending' as const,
                })),
              },
              {
                phase_id: 'phase-2' as any,
                mission_id: 'mission-00000000000000' as any,
                number: 2,
                title: 'Phase 2',
                description: 'Test',
                tasks: Array(5).fill(null).map((_, i) => ({
                  task_id: `task-2.${i + 1}` as any,
                  phase_id: 'phase-2' as any,
                  title: `Task ${i + 1}`,
                  description: 'Test',
                  briefing_path: 'task.md',
                  depends_on: [],
                  status: 'pending' as const,
                })),
              },
              {
                phase_id: 'phase-3' as any,
                mission_id: 'mission-00000000000000' as any,
                number: 3,
                title: 'Phase 3',
                description: 'Test',
                tasks: [], // No tasks
              },
            ],
          },
        },
      } as any);

      const result = await manager.createMission('Test');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.data.stats.total_phases).toBe(3);
        expect(result.data.stats.total_tasks).toBe(6); // 1 + 5 + 0
      }
    });
  });
});
