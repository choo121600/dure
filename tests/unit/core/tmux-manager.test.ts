import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TmuxManager } from '../../../src/core/tmux-manager.js';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

import { execSync, spawnSync } from 'child_process';

const mockExecSync = execSync as ReturnType<typeof vi.fn>;
const mockSpawnSync = spawnSync as ReturnType<typeof vi.fn>;

describe('TmuxManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawnSync.mockReturnValue({ status: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with session prefix and project root', () => {
      const manager = new TmuxManager('orchestral', '/project/root');
      expect(manager.getSessionName()).toBe('orchestral');
    });

    it('should include run ID in session name when provided', () => {
      const manager = new TmuxManager('orchestral', '/project/root', 'run-123');
      expect(manager.getSessionName()).toBe('orchestral-run-123');
    });

    it('should throw error for invalid session name with special characters', () => {
      expect(() => new TmuxManager('test session!', '/project/root')).toThrow(
        'Invalid session name'
      );
    });

    it('should sanitize run ID with special characters', () => {
      const manager = new TmuxManager('orchestral', '/project/root', 'run@123');
      expect(manager.getSessionName()).not.toContain('@');
    });
  });

  describe('isTmuxAvailable', () => {
    it('should return true when tmux is available', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      expect(TmuxManager.isTmuxAvailable()).toBe(true);
      expect(mockSpawnSync).toHaveBeenCalledWith('which', ['tmux'], { stdio: 'pipe' });
    });

    it('should return false when tmux is not available', () => {
      mockSpawnSync.mockReturnValue({ status: 1 });
      expect(TmuxManager.isTmuxAvailable()).toBe(false);
    });

    it('should return false when which command throws', () => {
      mockSpawnSync.mockImplementation(() => {
        throw new Error('command not found');
      });
      expect(TmuxManager.isTmuxAvailable()).toBe(false);
    });
  });

  describe('sessionExists', () => {
    it('should return true when session exists', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('orchestral', '/project/root');
      expect(manager.sessionExists()).toBe(true);
    });

    it('should return false when session does not exist', () => {
      mockSpawnSync.mockReturnValue({ status: 1 });
      const manager = new TmuxManager('orchestral', '/project/root');
      expect(manager.sessionExists()).toBe(false);
    });

    it('should return false when has-session command throws', () => {
      mockSpawnSync.mockImplementation(() => {
        throw new Error('tmux error');
      });
      const manager = new TmuxManager('orchestral', '/project/root');
      expect(manager.sessionExists()).toBe(false);
    });
  });

  describe('createSession', () => {
    it('should not create session if it already exists', () => {
      mockSpawnSync.mockReturnValue({ status: 0 }); // sessionExists returns true
      const manager = new TmuxManager('orchestral', '/project/root');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      manager.createSession();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'));
      consoleSpy.mockRestore();
    });

    it('should create session with correct parameters when session does not exist', () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 1 }) // sessionExists returns false
        .mockReturnValue({ status: 0 }); // subsequent calls succeed

      const manager = new TmuxManager('orchestral', '/project/root');
      manager.createSession();

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'tmux',
        expect.arrayContaining(['new-session', '-d', '-s', 'orchestral']),
        expect.anything()
      );
    });
  });

  describe('killSession', () => {
    it('should kill session if it exists', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('orchestral', '/project/root');
      manager.killSession();

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'tmux',
        ['kill-session', '-t', 'orchestral'],
        expect.anything()
      );
    });

    it('should not throw if session does not exist', () => {
      mockSpawnSync.mockReturnValue({ status: 1 });
      const manager = new TmuxManager('orchestral', '/project/root');
      expect(() => manager.killSession()).not.toThrow();
    });
  });

  describe('getPaneIndex', () => {
    it('should return correct pane index for refiner', () => {
      expect(TmuxManager.getPaneIndex('refiner')).toBe(0);
    });

    it('should return correct pane index for builder', () => {
      expect(TmuxManager.getPaneIndex('builder')).toBe(1);
    });

    it('should return correct pane index for verifier', () => {
      expect(TmuxManager.getPaneIndex('verifier')).toBe(2);
    });

    it('should return correct pane index for gatekeeper', () => {
      expect(TmuxManager.getPaneIndex('gatekeeper')).toBe(3);
    });
  });

  describe('getSessionName', () => {
    it('should return the session name', () => {
      const manager = new TmuxManager('test-session', '/project/root');
      expect(manager.getSessionName()).toBe('test-session');
    });
  });

  describe('capturePane', () => {
    it('should return empty string when session does not exist', () => {
      mockSpawnSync.mockReturnValue({ status: 1 }); // sessionExists returns false
      const manager = new TmuxManager('orchestral', '/project/root');

      const output = manager.capturePane('builder');

      expect(output).toBe('');
    });

    it('should return captured output when session exists', () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0 }) // sessionExists
        .mockReturnValueOnce({ status: 0, stdout: 'captured output' }); // capture-pane
      const manager = new TmuxManager('orchestral', '/project/root');

      const output = manager.capturePane('builder');

      expect(output).toBe('captured output');
    });

    it('should return empty string on error', () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0 }) // sessionExists
        .mockImplementationOnce(() => { throw new Error('capture failed'); });
      const manager = new TmuxManager('orchestral', '/project/root');

      const output = manager.capturePane('builder');

      expect(output).toBe('');
    });
  });

  describe('isPaneActive', () => {
    it('should return false when session does not exist', () => {
      mockSpawnSync.mockReturnValue({ status: 1 }); // sessionExists returns false
      const manager = new TmuxManager('orchestral', '/project/root');

      const active = manager.isPaneActive('builder');

      expect(active).toBe(false);
    });

    it('should return true when pane has running non-shell process', () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0 }) // sessionExists
        .mockReturnValueOnce({ status: 0, stdout: '0:bash\n1:node\n2:bash\n3:bash' }); // list-panes
      const manager = new TmuxManager('orchestral', '/project/root');

      const active = manager.isPaneActive('builder'); // pane 1

      expect(active).toBe(true);
    });

    it('should return false when pane has shell process', () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0 }) // sessionExists
        .mockReturnValueOnce({ status: 0, stdout: '0:bash\n1:bash\n2:bash\n3:bash' }); // list-panes
      const manager = new TmuxManager('orchestral', '/project/root');

      const active = manager.isPaneActive('builder'); // pane 1

      expect(active).toBe(false);
    });

    it('should return false on error', () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0 }) // sessionExists
        .mockImplementationOnce(() => { throw new Error('check failed'); }); // list-panes throws
      const manager = new TmuxManager('orchestral', '/project/root');

      const active = manager.isPaneActive('builder');

      expect(active).toBe(false);
    });
  });

  describe('updatePaneBordersWithModels', () => {
    const modelSelection = {
      models: {
        refiner: 'haiku' as const,
        builder: 'sonnet' as const,
        verifier: 'haiku' as const,
        gatekeeper: 'sonnet' as const,
      },
      analysis: {
        level: 'standard' as const,
        estimated_complexity: 'medium' as const,
        tokens: { estimated_input: 1000, estimated_output: 500 },
        recommendation: 'sonnet',
      },
      selection_method: 'auto' as const,
      timestamp: new Date().toISOString(),
    };

    it('should not update if session does not exist', () => {
      mockSpawnSync.mockReturnValue({ status: 1 }); // sessionExists returns false
      const manager = new TmuxManager('orchestral', '/project/root');

      manager.updatePaneBordersWithModels(modelSelection);

      // Should only call for sessionExists check
      expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    });

    it('should update pane borders when session exists', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('orchestral', '/project/root');

      manager.updatePaneBordersWithModels(modelSelection);

      // Should call tmux for set-option
      expect(mockSpawnSync).toHaveBeenCalledWith(
        'tmux',
        expect.arrayContaining(['set-option']),
        expect.anything()
      );
    });

    it('should handle errors gracefully', () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0 }) // sessionExists
        .mockImplementationOnce(() => { throw new Error('tmux error'); }); // set-option throws
      const manager = new TmuxManager('orchestral', '/project/root');

      // Should not throw
      expect(() => manager.updatePaneBordersWithModels(modelSelection)).not.toThrow();
    });
  });
});
