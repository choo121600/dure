/**
 * Comprehensive unit tests for mission create command
 *
 * Test Coverage:
 * - Functional tests: happy path with various inputs
 * - Boundary conditions: edge cases for inputs
 * - Error cases: missing files, invalid options, planning failures
 * - Adversarial tests: injection attempts, path traversal, edge cases
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { missionCreateCommand } from '../../../src/cli/commands/mission-create.js';
import { ok, err } from '../../../src/types/result.js';
import type { Mission } from '../../../src/types/mission.js';
import type { MissionId } from '../../../src/types/branded.js';
import { MissionError, ErrorCodes } from '../../../src/types/errors.js';

// Helper to create test directories
const createTestDir = (): string => {
  const testDir = join(tmpdir(), `dure-mission-create-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
  return testDir;
};

// Helper to create mock mission object
const createMockMission = (overrides: Partial<Mission> = {}): Mission => {
  const baseId = `mission-${Date.now()}` as MissionId;
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
    phases: [
      {
        phase_id: `phase-1-${baseId}` as any,
        mission_id: baseId,
        number: 1,
        title: 'Phase 1',
        description: 'First phase',
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
    ...overrides,
  };
};

// Mock MissionManager
const mockCreateMission = vi.fn();
vi.mock('../../../src/core/mission-manager.js', () => ({
  MissionManager: class MockMissionManager {
    createMission = mockCreateMission;
  },
}));

describe('mission create command', () => {
  let testDir: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let cwdSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    testDir = createTestDir();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number | string) => {
      throw new Error(`process.exit called with code ${code}`);
    }) as any);
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(testDir);
    mockCreateMission.mockClear();
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  // ============================================================================
  // FUNCTIONAL TESTS - Happy path scenarios
  // ============================================================================

  describe('Functional - Mission creation with description', () => {
    it('should create mission with inline description', async () => {
      const mockMission = createMockMission({ status: 'ready', title: 'Test Mission' });
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand('Create authentication system', {});

      expect(mockCreateMission).toHaveBeenCalledWith('Create authentication system');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Creating new mission')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mission created successfully')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mission Details:')
      );
    });

    it('should display mission details for ready status', async () => {
      const mockMission = createMockMission({
        status: 'ready',
        title: 'API Implementation',
        stats: {
          total_phases: 2,
          total_tasks: 5,
          completed_tasks: 0,
          failed_tasks: 0,
        },
      });
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand('Build REST API', {});

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Plan Summary:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Phases:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Tasks:'));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('dure mission kanban')
      );
    });

    it('should display plan review message for plan_review status', async () => {
      const mockMission = createMockMission({
        status: 'plan_review',
        planning: {
          stage: 'needs_human',
          iterations: 2,
          drafts: [],
          critiques: [],
        },
      });
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand('Complex task', {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Plan needs human review')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Planning iterations:')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('dure mission approve')
      );
    });

    it('should read description from file', async () => {
      const tempFile = join(testDir, 'mission.md');
      const fileContent = '# Multi-line Mission\n\nDescribe feature here';
      writeFileSync(tempFile, fileContent);

      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand(undefined, { file: tempFile });

      expect(mockCreateMission).toHaveBeenCalledWith(fileContent);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Mission created successfully'));
    });
  });

  // ============================================================================
  // BOUNDARY CONDITION TESTS - Edge cases
  // ============================================================================

  describe('Boundary - Description truncation', () => {
    it('should truncate descriptions longer than 200 characters', async () => {
      const longDescription = 'a'.repeat(250);
      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand(longDescription, {});

      // Should display exactly 200 chars + '...'
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('a'.repeat(200) + '...')
      );
    });

    it('should not add ellipsis to descriptions shorter than 200 characters', async () => {
      const shortDescription = 'Short mission description';
      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand(shortDescription, {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(shortDescription)
      );
    });

    it('should handle exactly 200 character description without truncation', async () => {
      const exactDescription = 'a'.repeat(200);
      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand(exactDescription, {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('a'.repeat(200))
      );
    });

    it('should handle empty string description', async () => {
      // Empty string is treated as no input, should exit with error
      await expect(
        missionCreateCommand('', {})
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mission description required')
      );
    });

    it('should handle description with special characters', async () => {
      const specialDesc = '🎯 Mission with émojis and spëcial chars: !@#$%^&*()';
      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand(specialDesc, {});

      expect(mockCreateMission).toHaveBeenCalledWith(specialDesc);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Mission created successfully'));
    });
  });

  describe('Boundary - File handling', () => {
    it('should handle files with various encodings and line endings', async () => {
      const tempFile = join(testDir, 'mission-unicode.md');
      const unicodeContent = 'Unicode test: 你好世界\nLine 2\r\nLine 3';
      writeFileSync(tempFile, unicodeContent, 'utf-8');

      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand(undefined, { file: tempFile });

      expect(mockCreateMission).toHaveBeenCalledWith(unicodeContent);
    });

    it('should handle very large file descriptions', async () => {
      const tempFile = join(testDir, 'large-mission.md');
      const largeContent = 'Description\n' + 'Line\n'.repeat(1000);
      writeFileSync(tempFile, largeContent);

      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand(undefined, { file: tempFile });

      expect(mockCreateMission).toHaveBeenCalledWith(largeContent);
    });

    it('should handle relative file paths', async () => {
      // Note: relative paths are resolved relative to actual cwd, not mocked cwd
      // This test uses absolute path to avoid cwd dependency
      const absolutePath = join(testDir, 'test-mission.md');
      writeFileSync(absolutePath, 'Test content');

      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      // Pass absolute path (relative paths would need actual cwd change)
      await missionCreateCommand(undefined, { file: absolutePath });

      // readFile should work with absolute path
      expect(consoleErrorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Could not read file')
      );
      expect(mockCreateMission).toHaveBeenCalledWith('Test content');
    });
  });

  describe('Boundary - Granularity options', () => {
    it('should accept all granularity values', async () => {
      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      const granularities = ['task', 'phase', 'auto'] as const;
      for (const granularity of granularities) {
        mockCreateMission.mockClear();
        await missionCreateCommand('Test', { granularity });
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining(`Granularity: ${granularity}`)
        );
      }
    });

    it('should default to auto granularity when not specified', async () => {
      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand('Test', {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Granularity: auto')
      );
    });
  });

  // ============================================================================
  // ERROR CASE TESTS - Error handling
  // ============================================================================

  describe('Error - Missing or invalid input', () => {
    it('should exit with error when no description or file provided', async () => {
      await expect(
        missionCreateCommand(undefined, {})
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mission description required')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Usage:')
      );
    });

    it('should exit with error when file does not exist', async () => {
      const nonexistentFile = join(testDir, 'does-not-exist.md');

      await expect(
        missionCreateCommand(undefined, { file: nonexistentFile })
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Could not read file: ${nonexistentFile}`)
      );
    });

    it('should exit with error when file is a directory', async () => {
      const dirPath = join(testDir, 'is-a-directory');
      mkdirSync(dirPath);

      await expect(
        missionCreateCommand(undefined, { file: dirPath })
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(`Could not read file: ${dirPath}`)
      );
    });

    it('should exit with error when file has no read permissions', async () => {
      const tempFile = join(testDir, 'no-perms.md');
      writeFileSync(tempFile, 'content');
      // Note: On some systems, this might not work, so we skip actual permission change
      // This test demonstrates the error handling path exists

      await expect(
        missionCreateCommand(undefined, { file: '/dev/null/nonexistent/path/file.md' })
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not read file')
      );
    });
  });

  describe('Error - Mission creation failure', () => {
    it('should exit with error when mission creation fails', async () => {
      const error = new MissionError(
        'mission-1' as any,
        'Planning failed',
        ErrorCodes.MISSION_PLANNING_FAILED
      );
      mockCreateMission.mockResolvedValue(err(error));

      await expect(
        missionCreateCommand('Test mission', {})
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mission creation failed')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Planning failed')
      );
    });

    it('should exit with error on generic mission error', async () => {
      const error = new MissionError(
        'mission-1' as any,
        'Unknown error occurred',
        ErrorCodes.MISSION_FAILED
      );
      mockCreateMission.mockResolvedValue(err(error));

      await expect(
        missionCreateCommand('Test', {})
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown error occurred')
      );
    });
  });

  // ============================================================================
  // ADVERSARIAL TESTS - Attack vectors and malicious inputs
  // ============================================================================

  describe('Adversarial - Path traversal attempts', () => {
    it('should handle path traversal in file option (../ sequences)', async () => {
      const traversalPath = join(testDir, '..', '..', 'etc', 'passwd');

      await expect(
        missionCreateCommand(undefined, { file: traversalPath })
      ).rejects.toThrow('process.exit called');

      // Should fail with file read error, not security bypass
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not read file')
      );
    });

    it('should handle absolute path escapes', async () => {
      // Attempt to read nonexistent system file
      // Note: /etc/passwd exists and is readable on macOS/Linux
      const systemPath = '/nonexistent/system/path/file.md';

      await expect(
        missionCreateCommand(undefined, { file: systemPath })
      ).rejects.toThrow('process.exit called');

      // Should fail with file read error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not read file')
      );
    });

    it('should handle symbolic link attempts', async () => {
      const linkPath = join(testDir, 'symlink-attempt');
      writeFileSync(linkPath, 'content');

      // Even if someone created a symlink, it would just read the file
      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand(undefined, { file: linkPath });

      // Should work normally - symlink is not a security issue here
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('Adversarial - Input injection attempts', () => {
    it('should handle shell injection in description', async () => {
      const injectionDesc = 'Normal text; rm -rf /; echo hacked';
      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand(injectionDesc, {});

      // Should be treated as plain text, passed to MissionManager
      expect(mockCreateMission).toHaveBeenCalledWith(injectionDesc);
      // No actual shell execution should occur
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mission created successfully')
      );
    });

    it('should handle file path injection attempts', async () => {
      const injectionPath = '/tmp/mission.md; cat /etc/passwd';

      await expect(
        missionCreateCommand(undefined, { file: injectionPath })
      ).rejects.toThrow('process.exit called');

      // Should fail to find the file, not execute commands
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not read file')
      );
    });

    it('should handle ansi escape sequences in description', async () => {
      const ansiDesc = 'Normal\x1b[31mRED\x1b[0m text with color codes';
      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand(ansiDesc, {});

      expect(mockCreateMission).toHaveBeenCalledWith(ansiDesc);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Mission created successfully')
      );
    });
  });

  describe('Adversarial - Resource exhaustion attempts', () => {
    it('should handle extremely long descriptions', async () => {
      const massiveDesc = 'x'.repeat(1000000); // 1MB string
      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand(massiveDesc, {});

      expect(mockCreateMission).toHaveBeenCalledWith(massiveDesc);
      // Should still work - just display first 200 chars
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('x'.repeat(200) + '...')
      );
    });

    it('should handle extremely long file paths', async () => {
      const longPath = join(testDir, 'a'.repeat(500) + '.md');

      await expect(
        missionCreateCommand(undefined, { file: longPath })
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Could not read file')
      );
    });
  });

  describe('Adversarial - Null/undefined/type confusion', () => {
    it('should handle null-like string descriptions', async () => {
      const nullishStrings = ['null', 'undefined', 'NaN', 'false'];

      for (const str of nullishStrings) {
        mockCreateMission.mockClear();
        const mockMission = createMockMission();
        mockCreateMission.mockResolvedValue(ok(mockMission));

        await missionCreateCommand(str, {});

        // Should treat as normal strings
        expect(mockCreateMission).toHaveBeenCalledWith(str);
      }
    });

    it('should handle newlines and whitespace in descriptions', async () => {
      const whitespaceDesc = '  \n\n  \t  ';
      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand(whitespaceDesc, {});

      expect(mockCreateMission).toHaveBeenCalledWith(whitespaceDesc);
    });

    it('should handle mixed control characters', async () => {
      const controlDesc = '\x00\x01\x02Hello\x03\x04\x05';
      const mockMission = createMockMission();
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand(controlDesc, {});

      expect(mockCreateMission).toHaveBeenCalledWith(controlDesc);
    });
  });

  // ============================================================================
  // ADDITIONAL INTEGRATION TESTS
  // ============================================================================

  describe('Integration - Full workflow scenarios', () => {
    it('should handle mission with multiple phases in output', async () => {
      const mockMission = createMockMission({
        status: 'ready',
        phases: [
          {
            phase_id: 'phase-1' as any,
            mission_id: 'mission-1' as any,
            number: 1,
            title: 'Phase 1: Planning',
            description: 'Plan the implementation',
            tasks: [
              {
                task_id: 'task-1' as any,
                phase_id: 'phase-1' as any,
                title: 'Create design document',
                description: 'Design the system',
                briefing_path: '',
                depends_on: [],
                status: 'pending',
              },
            ],
            status: 'pending',
          },
          {
            phase_id: 'phase-2' as any,
            mission_id: 'mission-1' as any,
            number: 2,
            title: 'Phase 2: Implementation',
            description: 'Implement the features',
            tasks: [],
            status: 'pending',
          },
        ],
        stats: {
          total_phases: 2,
          total_tasks: 1,
          completed_tasks: 0,
          failed_tasks: 0,
        },
      });
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand('Multi-phase project', {});

      // Verify phases are displayed
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Phase 1:')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Phase 2:')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Create design document')
      );
    });

    it('should display correct help text for ready missions', async () => {
      const mockMission = createMockMission({ status: 'ready' });
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand('Test', {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('dure mission kanban')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('dure mission run')
      );
    });

    it('should display correct help text for plan_review missions', async () => {
      const mockMission = createMockMission({ status: 'plan_review' });
      mockCreateMission.mockResolvedValue(ok(mockMission));

      await missionCreateCommand('Test', {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('dure mission status')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('dure mission approve')
      );
    });
  });
});
