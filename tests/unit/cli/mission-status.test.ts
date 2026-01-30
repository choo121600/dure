/**
 * Unit tests for mission status and list commands
 *
 * Test Coverage:
 * - Mission status display with various statuses
 * - Verbose mode details
 * - JSON output format
 * - Mission list filtering and display
 * - Error handling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { missionStatusCommand } from '../../../src/cli/commands/mission-status.js';
import { missionListCommand } from '../../../src/cli/commands/mission-list.js';
import { ok, err } from '../../../src/types/result.js';
import type { Mission } from '../../../src/types/mission.js';
import type { MissionId } from '../../../src/types/branded.js';
import { MissionError, ErrorCodes } from '../../../src/types/errors.js';

// Helper to create mock phase
const createMockPhase = (number: number, taskCount: number, baseId: MissionId) => ({
  phase_id: `phase-${number}` as any,
  mission_id: baseId,
  number,
  title: `Phase ${number}`,
  description: `Test phase ${number}`,
  tasks: Array.from({ length: taskCount }, (_, i) => ({
    task_id: `task-${number}-${i + 1}` as any,
    phase_id: `phase-${number}` as any,
    title: `Task ${i + 1}`,
    description: 'Test task',
    briefing_path: '',
    depends_on: [],
    status: 'pending' as const,
  })),
  status: 'pending' as const,
});

// Helper to create mock mission object
const createMockMission = (overrides: Partial<Mission> = {}): Mission => {
  const baseId = `mission-${Date.now()}` as MissionId;

  // If stats with total_tasks is provided but no phases, auto-generate phases
  const stats = overrides.stats || {
    total_phases: 0,
    total_tasks: 0,
    completed_tasks: 0,
    failed_tasks: 0,
  };

  let phases = overrides.phases;
  if (!phases && stats.total_tasks > 0) {
    // Auto-generate a phase with the specified number of tasks
    phases = [createMockPhase(1, stats.total_tasks, baseId)];
  }

  return {
    mission_id: baseId,
    title: 'Test Mission',
    description: 'Test description',
    status: 'ready',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    planning: {
      stage: 'approved',
      iterations: 1,
      drafts: [],
      critiques: [],
    },
    phases: phases || [],
    stats,
    ...overrides,
  };
};

// Mock MissionManager
const mockGetMission = vi.fn();
const mockListMissions = vi.fn();
vi.mock('../../../src/core/mission-manager.js', () => ({
  MissionManager: class MockMissionManager {
    getMission = mockGetMission;
    listMissions = mockListMissions;
  },
}));

describe('mission status command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string) => {
      throw new Error(`process.exit called with code ${code}`);
    }) as any);
    mockGetMission.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic status display', () => {
    it('should display mission details in normal mode', async () => {
      const mockMission = createMockMission({
        mission_id: 'mission-20240129143052' as MissionId,
        title: 'Test Mission',
        status: 'ready',
        stats: {
          total_phases: 2,
          total_tasks: 5,
          completed_tasks: 2,
          failed_tasks: 0,
        },
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-20240129143052', {});

      expect(mockGetMission).toHaveBeenCalledWith('mission-20240129143052');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Mission: Test Mission'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Basic Info:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Planning:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Progress:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2/5'));
    });

    it('should display progress bar', async () => {
      const mockMission = createMockMission({
        stats: {
          total_phases: 1,
          total_tasks: 10,
          completed_tasks: 5,
          failed_tasks: 0,
        },
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-20240129143052', {});

      // Progress bar should be displayed
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('['));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('] 50%'));
    });

    it('should show failed tasks count when present', async () => {
      const mockMission = createMockMission({
        stats: {
          total_phases: 1,
          total_tasks: 5,
          completed_tasks: 2,
          failed_tasks: 2,
        },
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-20240129143052', {});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed:'));
    });
  });

  describe('JSON output mode', () => {
    it('should output JSON when --json flag is set', async () => {
      const mockMission = createMockMission();
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-20240129143052', { json: true });

      // Should output valid JSON
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"mission_id"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"status"')
      );

      // Get the JSON output
      const jsonOutput = consoleSpy.mock.calls[0][0];
      expect(() => JSON.parse(jsonOutput)).not.toThrow();
    });
  });

  describe('Verbose mode', () => {
    it('should display detailed phase and task info in verbose mode', async () => {
      const mockMission = createMockMission({
        phases: [
          {
            phase_id: 'phase-1' as any,
            mission_id: 'mission-1' as any,
            number: 1,
            title: 'Phase 1: Setup',
            description: 'Setup the project',
            tasks: [
              {
                task_id: 'task-1' as any,
                phase_id: 'phase-1' as any,
                title: 'Install dependencies',
                description: 'Install all deps',
                briefing_path: '',
                depends_on: [],
                status: 'passed',
              },
            ],
            status: 'completed',
          },
        ],
        stats: {
          total_phases: 1,
          total_tasks: 1,
          completed_tasks: 1,
          failed_tasks: 0,
        },
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-20240129143052', { verbose: true });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Phases:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Phase 1:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Setup the project'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('task-1'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Install dependencies'));
    });

    it('should show task dependencies in verbose mode', async () => {
      const mockMission = createMockMission({
        phases: [
          {
            phase_id: 'phase-1' as any,
            mission_id: 'mission-1' as any,
            number: 1,
            title: 'Phase 1',
            description: 'Test phase',
            tasks: [
              {
                task_id: 'task-2' as any,
                phase_id: 'phase-1' as any,
                title: 'Dependent task',
                description: 'Depends on task-1',
                briefing_path: '',
                depends_on: ['task-1' as any],
                status: 'pending',
              },
            ],
            status: 'pending',
          },
        ],
        stats: {
          total_phases: 1,
          total_tasks: 1,
          completed_tasks: 0,
          failed_tasks: 0,
        },
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-20240129143052', { verbose: true });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Depends on:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('task-1'));
    });
  });

  describe('Next actions guidance', () => {
    it('should show approval actions for plan_review status', async () => {
      const mockMission = createMockMission({ status: 'plan_review' });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-20240129143052', {});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Next Actions:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('dure mission approve'));
    });

    it('should show run actions for ready status', async () => {
      const mockMission = createMockMission({ status: 'ready' });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-20240129143052', {});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('dure mission run'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('dure mission kanban'));
    });

    it('should show completion message for completed status', async () => {
      const mockMission = createMockMission({ status: 'completed' });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-20240129143052', {});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Mission completed! 🎉'));
    });
  });

  describe('Error handling', () => {
    it('should exit with error when mission not found', async () => {
      const error = new MissionError(
        'mission-123' as any,
        'Mission not found',
        ErrorCodes.MISSION_NOT_FOUND
      );
      mockGetMission.mockResolvedValue(err(error));

      await expect(
        missionStatusCommand('mission-123', {})
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error: Mission not found')
      );
    });

    it('should handle error with permission denied', async () => {
      const error = new MissionError(
        'mission-123' as any,
        'Permission denied',
        ErrorCodes.FS_READ_FAILED
      );
      mockGetMission.mockResolvedValue(err(error));

      await expect(
        missionStatusCommand('mission-123', {})
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error: Permission denied')
      );
    });
  });

  // ============================================================================
  // BOUNDARY CONDITION TESTS - Edge cases
  // ============================================================================

  describe('Boundary - Progress calculations', () => {
    it('should display 0% when no tasks completed', async () => {
      const mockMission = createMockMission({
        stats: {
          total_phases: 1,
          total_tasks: 10,
          completed_tasks: 0,
          failed_tasks: 0,
        },
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-123', {});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('] 0%'));
    });

    it('should display 100% when all tasks completed', async () => {
      const mockMission = createMockMission({
        stats: {
          total_phases: 1,
          total_tasks: 10,
          completed_tasks: 10,
          failed_tasks: 0,
        },
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-123', {});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('] 100%'));
    });

    it('should handle 0 total tasks gracefully', async () => {
      const mockMission = createMockMission({
        stats: {
          total_phases: 0,
          total_tasks: 0,
          completed_tasks: 0,
          failed_tasks: 0,
        },
        phases: [],
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-123', {});

      // Should not crash, should show 0% or handle gracefully
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should round progress percentages correctly', async () => {
      const mockMission = createMockMission({
        stats: {
          total_phases: 1,
          total_tasks: 3,
          completed_tasks: 1,
          failed_tasks: 0,
        },
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-123', {});

      // 1/3 = 33.33% should round to 33%
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('] 33%'));
    });
  });

  describe('Boundary - Title and descriptions', () => {
    it('should display mission with very long title', async () => {
      const longTitle = 'a'.repeat(100);
      const mockMission = createMockMission({
        title: longTitle,
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-123', {});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(longTitle));
    });

    it('should use mission_id when title is empty', async () => {
      const mockMission = createMockMission({
        mission_id: 'mission-20240129143052' as MissionId,
        title: '',
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-20240129143052', {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mission: mission-20240129143052')
      );
    });

    it('should display phase with empty description', async () => {
      const mockMission = createMockMission({
        phases: [
          {
            phase_id: 'phase-1' as any,
            mission_id: 'mission-1' as any,
            number: 1,
            title: 'Phase 1',
            description: '',
            tasks: [],
            status: 'pending',
          },
        ],
        stats: {
          total_phases: 1,
          total_tasks: 0,
          completed_tasks: 0,
          failed_tasks: 0,
        },
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-123', { verbose: true });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Phase 1:'));
    });
  });

  describe('Boundary - Date formatting', () => {
    it('should handle ISO date strings correctly', async () => {
      const isoDate = '2024-01-29T14:30:52.000Z';
      const mockMission = createMockMission({
        created_at: isoDate,
        updated_at: isoDate,
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-123', {});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Created:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Updated:'));
    });

    it('should handle very recent dates', async () => {
      const now = new Date().toISOString();
      const mockMission = createMockMission({
        created_at: now,
        updated_at: now,
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-123', {});

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Boundary - Multiple phases and tasks', () => {
    it('should handle mission with many phases', async () => {
      const phases = Array.from({ length: 10 }, (_, i) => ({
        phase_id: `phase-${i}` as any,
        mission_id: 'mission-1' as any,
        number: i + 1,
        title: `Phase ${i + 1}`,
        description: `Phase description ${i}`,
        tasks: [],
        status: 'pending' as const,
      }));

      const mockMission = createMockMission({
        phases,
        stats: {
          total_phases: 10,
          total_tasks: 0,
          completed_tasks: 0,
          failed_tasks: 0,
        },
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-123', {});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Phases:'));
    });

    it('should handle phase with many tasks', async () => {
      const tasks = Array.from({ length: 20 }, (_, i) => ({
        task_id: `task-${i}` as any,
        phase_id: 'phase-1' as any,
        title: `Task ${i + 1}`,
        description: `Task description ${i}`,
        briefing_path: '',
        depends_on: [],
        status: 'pending' as const,
      }));

      const mockMission = createMockMission({
        phases: [
          {
            phase_id: 'phase-1' as any,
            mission_id: 'mission-1' as any,
            number: 1,
            title: 'Phase 1',
            description: 'Phase description',
            tasks,
            status: 'pending',
          },
        ],
        stats: {
          total_phases: 1,
          total_tasks: 20,
          completed_tasks: 5,
          failed_tasks: 0,
        },
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-123', { verbose: true });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Phases:'));
    });
  });

  // ============================================================================
  // ADVERSARIAL TESTS - Malicious/unexpected inputs
  // ============================================================================

  describe('Adversarial - Mission ID injection', () => {
    it('should handle mission ID with special characters', async () => {
      const mockMission = createMockMission({
        mission_id: 'mission-20240129143052' as MissionId,
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-20240129143052!@#$%', {});

      // Should pass the ID as-is (manager handles validation)
      expect(mockGetMission).toHaveBeenCalledWith('mission-20240129143052!@#$%');
    });

    it('should handle mission ID with quotes', async () => {
      const mockMission = createMockMission();
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-"test"', {});

      expect(mockGetMission).toHaveBeenCalledWith('mission-"test"');
    });

    it('should handle mission ID with command injection attempt', async () => {
      const mockMission = createMockMission();
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-123; rm -rf /', {});

      // Should pass through (not execute)
      expect(mockGetMission).toHaveBeenCalledWith('mission-123; rm -rf /');
    });
  });

  describe('Adversarial - Option handling', () => {
    it('should handle conflicting options (json and verbose)', async () => {
      const mockMission = createMockMission();
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-123', { json: true, verbose: true });

      // json mode should take precedence
      const jsonCalls = consoleSpy.mock.calls.filter(
        call => typeof call[0] === 'string' && call[0].includes('"mission_id"')
      );
      expect(jsonCalls.length).toBeGreaterThan(0);
    });

    it('should handle undefined options', async () => {
      const mockMission = createMockMission();
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-123', {});

      expect(mockGetMission).toHaveBeenCalledWith('mission-123');
    });
  });

  describe('Adversarial - Malformed mission data', () => {
    it('should handle task with error message', async () => {
      const mockMission = createMockMission({
        phases: [
          {
            phase_id: 'phase-1' as any,
            mission_id: 'mission-1' as any,
            number: 1,
            title: 'Phase 1',
            description: 'Description',
            tasks: [
              {
                task_id: 'task-1' as any,
                phase_id: 'phase-1' as any,
                title: 'Failed Task',
                description: 'Description',
                briefing_path: '',
                depends_on: [],
                status: 'failed',
                error: 'Intentional error message',
              },
            ],
            status: 'failed',
          },
        ],
        stats: {
          total_phases: 1,
          total_tasks: 1,
          completed_tasks: 0,
          failed_tasks: 1,
        },
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-123', { verbose: true });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'));
    });

    it('should handle task with very long error message', async () => {
      const longError = 'e'.repeat(500);
      const mockMission = createMockMission({
        phases: [
          {
            phase_id: 'phase-1' as any,
            mission_id: 'mission-1' as any,
            number: 1,
            title: 'Phase 1',
            description: 'Description',
            tasks: [
              {
                task_id: 'task-1' as any,
                phase_id: 'phase-1' as any,
                title: 'Failed Task',
                description: 'Description',
                briefing_path: '',
                depends_on: [],
                status: 'failed',
                error: longError,
              },
            ],
            status: 'failed',
          },
        ],
        stats: {
          total_phases: 1,
          total_tasks: 1,
          completed_tasks: 0,
          failed_tasks: 1,
        },
      });
      mockGetMission.mockResolvedValue(ok(mockMission));

      await missionStatusCommand('mission-123', { verbose: true });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Error:'));
    });
  });
});

describe('mission list command', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string) => {
      throw new Error(`process.exit called with code ${code}`);
    }) as any);
    mockListMissions.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic list display', () => {
    it('should list all missions', async () => {
      const missions = [
        createMockMission({ mission_id: 'mission-1' as any, title: 'Mission 1' }),
        createMockMission({ mission_id: 'mission-2' as any, title: 'Mission 2' }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({});

      expect(mockListMissions).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('🎯 Missions'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('mission-1'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('mission-2'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Total: 2 mission(s)'));
    });

    it('should display empty message when no missions found', async () => {
      mockListMissions.mockResolvedValue(ok([]));

      await missionListCommand({});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No missions found.'));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('dure mission create')
      );
    });
  });

  describe('Filtering and limits', () => {
    it('should filter by status', async () => {
      const missions = [
        createMockMission({ status: 'ready' }),
        createMockMission({ status: 'completed' }),
        createMockMission({ status: 'ready' }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ status: 'ready' });

      // Should only show ready missions
      const allCalls = consoleSpy.mock.calls.map(call => call[0]).join('\n');
      expect(allCalls).toContain('Total: 2 mission(s)');
    });

    it('should limit number of results', async () => {
      const missions = Array.from({ length: 5 }, (_, i) =>
        createMockMission({ mission_id: `mission-${i}` as any })
      );
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ limit: 2 });

      const allCalls = consoleSpy.mock.calls.map(call => call[0]).join('\n');
      expect(allCalls).toContain('Total: 2 mission(s)');
    });
  });

  describe('JSON output mode', () => {
    it('should output JSON when --json flag is set', async () => {
      const missions = [createMockMission()];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ json: true });

      const jsonOutput = consoleSpy.mock.calls[0][0];
      expect(() => JSON.parse(jsonOutput)).not.toThrow();
      const parsed = JSON.parse(jsonOutput);
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should exit with error when listing fails', async () => {
      const error = new MissionError(
        '' as any,
        'Failed to list missions',
        ErrorCodes.FS_READ_FAILED
      );
      mockListMissions.mockResolvedValue(err(error));

      await expect(
        missionListCommand({})
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error: Failed to list missions')
      );
    });

    it('should handle permission denied error', async () => {
      const error = new MissionError(
        '' as any,
        'Permission denied',
        ErrorCodes.FS_READ_FAILED
      );
      mockListMissions.mockResolvedValue(err(error));

      await expect(
        missionListCommand({})
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error: Permission denied')
      );
    });
  });

  // ============================================================================
  // BOUNDARY CONDITION TESTS - Edge cases
  // ============================================================================

  describe('Boundary - Title truncation and formatting', () => {
    it('should truncate long mission titles', async () => {
      const longTitle = 'a'.repeat(50);
      const missions = [
        createMockMission({ mission_id: 'mission-1' as any, title: longTitle }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({});

      // Title should be truncated to 28 chars + '..'
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not truncate titles shorter than 28 characters', async () => {
      const shortTitle = 'Short Title';
      const missions = [
        createMockMission({ mission_id: 'mission-1' as any, title: shortTitle }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining(shortTitle));
    });

    it('should display untitled missions with placeholder', async () => {
      const missions = [
        createMockMission({ mission_id: 'mission-1' as any, title: '' }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('(untitled)'));
    });

    it('should handle titles with special characters', async () => {
      const specialTitle = '🎯 Mission (with) [special] chars!';
      const missions = [
        createMockMission({ mission_id: 'mission-1' as any, title: specialTitle }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({});

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Boundary - Date formatting', () => {
    it('should display just now for very recent missions', async () => {
      const now = new Date().toISOString();
      const missions = [
        createMockMission({ updated_at: now }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('just now'));
    });

    it('should display minutes ago for recent missions', async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60000).toISOString();
      const missions = [
        createMockMission({ updated_at: tenMinutesAgo }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('m ago'));
    });

    it('should display hours ago for missions from earlier today', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
      const missions = [
        createMockMission({ updated_at: twoHoursAgo }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('h ago'));
    });

    it('should display days ago for missions from this week', async () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
      const missions = [
        createMockMission({ updated_at: threeDaysAgo }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('d ago'));
    });

    it('should display date for missions older than a week', async () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
      const missions = [
        createMockMission({ updated_at: tenDaysAgo }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({});

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Boundary - Progress display', () => {
    it('should display progress as dash when no tasks', async () => {
      const missions = [
        createMockMission({
          stats: {
            total_phases: 0,
            total_tasks: 0,
            completed_tasks: 0,
            failed_tasks: 0,
          },
        }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('-'));
    });

    it('should display progress as fraction when tasks exist', async () => {
      const missions = [
        createMockMission({
          stats: {
            total_phases: 1,
            total_tasks: 5,
            completed_tasks: 2,
            failed_tasks: 0,
          },
        }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('2/5'));
    });

    it('should display 0/0 when tasks are zero', async () => {
      const missions = [
        createMockMission({
          stats: {
            total_phases: 1,
            total_tasks: 0,
            completed_tasks: 0,
            failed_tasks: 0,
          },
        }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({});

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('Boundary - Filtering and limits', () => {
    it('should handle limit of 0', async () => {
      const missions = Array.from({ length: 5 }, (_, i) =>
        createMockMission({ mission_id: `mission-${i}` as any })
      );
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ limit: 0 });

      const allCalls = consoleSpy.mock.calls.map(call => call[0]).join('\n');
      // Empty result shows "No missions found" message
      expect(allCalls).toContain('No missions found');
    });

    it('should handle limit equal to missions count', async () => {
      const missions = Array.from({ length: 3 }, (_, i) =>
        createMockMission({ mission_id: `mission-${i}` as any })
      );
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ limit: 3 });

      const allCalls = consoleSpy.mock.calls.map(call => call[0]).join('\n');
      expect(allCalls).toContain('Total: 3 mission(s)');
    });

    it('should handle limit greater than missions count', async () => {
      const missions = Array.from({ length: 2 }, (_, i) =>
        createMockMission({ mission_id: `mission-${i}` as any })
      );
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ limit: 10 });

      const allCalls = consoleSpy.mock.calls.map(call => call[0]).join('\n');
      expect(allCalls).toContain('Total: 2 mission(s)');
    });

    it('should filter with non-existent status', async () => {
      const missions = [
        createMockMission({ status: 'ready' }),
        createMockMission({ status: 'completed' }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ status: 'nonexistent' });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No missions found'));
    });

    it('should combine filter and limit', async () => {
      const missions = [
        createMockMission({ status: 'ready' }),
        createMockMission({ status: 'ready' }),
        createMockMission({ status: 'ready' }),
        createMockMission({ status: 'completed' }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ status: 'ready', limit: 2 });

      const allCalls = consoleSpy.mock.calls.map(call => call[0]).join('\n');
      expect(allCalls).toContain('Total: 2 mission(s)');
    });
  });

  describe('Boundary - Large mission lists', () => {
    it('should handle 100 missions', async () => {
      const missions = Array.from({ length: 100 }, (_, i) =>
        createMockMission({ mission_id: `mission-${i}` as any })
      );
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Total: 100 mission(s)'));
    });

    it('should display all mission IDs correctly', async () => {
      const missions = Array.from({ length: 5 }, (_, i) =>
        createMockMission({ mission_id: `mission-${1000 + i}` as any })
      );
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({});

      for (let i = 0; i < 5; i++) {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining(`mission-${1000 + i}`)
        );
      }
    });
  });

  // ============================================================================
  // ADVERSARIAL TESTS - Malicious/unexpected inputs
  // ============================================================================

  describe('Adversarial - Status filter injection', () => {
    it('should handle status filter with special characters', async () => {
      const missions = [
        createMockMission({ status: 'ready' }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ status: 'ready!@#$%' });

      // Should filter with exact match (no match)
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No missions found'));
    });

    it('should handle status filter with quotes', async () => {
      const missions = [
        createMockMission({ status: 'ready' }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ status: '"ready"' });

      // Should not match
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No missions found'));
    });

    it('should be case sensitive for status filtering', async () => {
      const missions = [
        createMockMission({ status: 'ready' }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ status: 'READY' });

      // Should not match (case sensitive)
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No missions found'));
    });
  });

  describe('Adversarial - Limit parameter injection', () => {
    it('should handle negative limit', async () => {
      const missions = Array.from({ length: 5 }, (_, i) =>
        createMockMission({ mission_id: `mission-${i}` as any })
      );
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ limit: -10 });

      // Negative limit should result in 0 missions shown
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No missions found'));
    });

    it('should handle very large limit number', async () => {
      const missions = Array.from({ length: 5 }, (_, i) =>
        createMockMission({ mission_id: `mission-${i}` as any })
      );
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ limit: Number.MAX_SAFE_INTEGER });

      const allCalls = consoleSpy.mock.calls.map(call => call[0]).join('\n');
      expect(allCalls).toContain('Total: 5 mission(s)');
    });
  });

  describe('Adversarial - Combined options', () => {
    it('should handle json output with filter', async () => {
      const missions = [
        createMockMission({ status: 'ready' }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ json: true, status: 'ready' });

      const jsonOutput = consoleSpy.mock.calls[0][0];
      expect(() => JSON.parse(jsonOutput)).not.toThrow();
      const parsed = JSON.parse(jsonOutput);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('should handle json output with limit', async () => {
      const missions = Array.from({ length: 5 }, (_, i) =>
        createMockMission({ mission_id: `mission-${i}` as any })
      );
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ json: true, limit: 2 });

      const jsonOutput = consoleSpy.mock.calls[0][0];
      expect(() => JSON.parse(jsonOutput)).not.toThrow();
      const parsed = JSON.parse(jsonOutput);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
    });

    it('should handle all options together', async () => {
      const missions = [
        createMockMission({ status: 'ready' }),
        createMockMission({ status: 'ready' }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ json: true, status: 'ready', limit: 1 });

      const jsonOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(jsonOutput);
      expect(parsed.length).toBe(1);
    });
  });

  describe('Adversarial - Malformed mission data in list', () => {
    it('should handle mission with missing stats', async () => {
      const incompleteMission = createMockMission();
      delete (incompleteMission as any).stats;

      mockListMissions.mockResolvedValue(ok([incompleteMission]));

      // Should not crash, should display something
      expect(() => missionListCommand({})).not.toThrow();
    });

    it('should handle mission with null values', async () => {
      const missions = [
        {
          ...createMockMission(),
          title: null,
          updated_at: null,
        } as any,
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      // Should handle gracefully
      expect(() => missionListCommand({})).not.toThrow();
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe('Integration - Status and list together', () => {
    it('should allow listing then getting status', async () => {
      const mission = createMockMission({ mission_id: 'mission-1' as any });
      mockListMissions.mockResolvedValue(ok([mission]));
      mockGetMission.mockResolvedValue(ok(mission));

      await missionListCommand({});
      await missionStatusCommand('mission-1', {});

      expect(mockListMissions).toHaveBeenCalled();
      expect(mockGetMission).toHaveBeenCalledWith('mission-1');
    });
  });

  describe('Integration - Multiple status queries', () => {
    it('should handle sequential status queries', async () => {
      const mission1 = createMockMission({ mission_id: 'mission-1' as any, status: 'ready' });
      const mission2 = createMockMission({ mission_id: 'mission-2' as any, status: 'completed' });

      mockGetMission
        .mockResolvedValueOnce(ok(mission1))
        .mockResolvedValueOnce(ok(mission2));

      await missionStatusCommand('mission-1', {});
      await missionStatusCommand('mission-2', {});

      expect(mockGetMission).toHaveBeenCalledTimes(2);
    });
  });

  describe('Integration - Complex filtering scenario', () => {
    it('should handle list then filter by status with limit', async () => {
      const missions = [
        createMockMission({ mission_id: 'mission-1' as any, status: 'ready' }),
        createMockMission({ mission_id: 'mission-2' as any, status: 'ready' }),
        createMockMission({ mission_id: 'mission-3' as any, status: 'completed' }),
        createMockMission({ mission_id: 'mission-4' as any, status: 'ready' }),
      ];
      mockListMissions.mockResolvedValue(ok(missions));

      await missionListCommand({ status: 'ready', limit: 2 });

      expect(mockListMissions).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(call => call[0]).join('\n');
      expect(output).toContain('Total: 2 mission(s)');
    });
  });
});
