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

import { execSync, spawnSync, spawn } from 'child_process';

const mockExecSync = execSync as ReturnType<typeof vi.fn>;
const mockSpawnSync = spawnSync as ReturnType<typeof vi.fn>;
const mockSpawn = spawn as ReturnType<typeof vi.fn>;

describe('TmuxManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawnSync.mockReturnValue({ status: 0 });
    mockSpawn.mockReturnValue({ unref: vi.fn() });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with session prefix and project root', () => {
      const manager = new TmuxManager('dure', '/project/root');
      expect(manager.getSessionName()).toBe('dure');
    });

    it('should include run ID in session name when provided', () => {
      const manager = new TmuxManager('dure', '/project/root', 'run-123');
      expect(manager.getSessionName()).toBe('dure-run-123');
    });

    it('should throw error for invalid session name with special characters', () => {
      expect(() => new TmuxManager('test session!', '/project/root')).toThrow(
        'Invalid session name'
      );
    });

    it('should sanitize run ID with special characters', () => {
      const manager = new TmuxManager('dure', '/project/root', 'run@123');
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
      const manager = new TmuxManager('dure', '/project/root');
      expect(manager.sessionExists()).toBe(true);
    });

    it('should return false when session does not exist', () => {
      mockSpawnSync.mockReturnValue({ status: 1 });
      const manager = new TmuxManager('dure', '/project/root');
      expect(manager.sessionExists()).toBe(false);
    });

    it('should return false when has-session command throws', () => {
      mockSpawnSync.mockImplementation(() => {
        throw new Error('tmux error');
      });
      const manager = new TmuxManager('dure', '/project/root');
      expect(manager.sessionExists()).toBe(false);
    });
  });

  describe('createSession', () => {
    it('should not create session if it already exists', () => {
      mockSpawnSync.mockReturnValue({ status: 0 }); // sessionExists returns true
      const manager = new TmuxManager('dure', '/project/root');

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      manager.createSession();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'));
      consoleSpy.mockRestore();
    });

    it('should create session with correct parameters when session does not exist', () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 1 }) // sessionExists returns false
        .mockReturnValue({ status: 0 }); // subsequent calls succeed

      const manager = new TmuxManager('dure', '/project/root');
      manager.createSession();

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'tmux',
        expect.arrayContaining(['new-session', '-d', '-s', 'dure']),
        expect.anything()
      );
    });
  });

  describe('killSession', () => {
    it('should kill session if it exists', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');
      manager.killSession();

      expect(mockSpawnSync).toHaveBeenCalledWith(
        'tmux',
        ['kill-session', '-t', 'dure'],
        expect.anything()
      );
    });

    it('should not throw if session does not exist', () => {
      mockSpawnSync.mockReturnValue({ status: 1 });
      const manager = new TmuxManager('dure', '/project/root');
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
      const manager = new TmuxManager('dure', '/project/root');

      const output = manager.capturePane('builder');

      expect(output).toBe('');
    });

    it('should return captured output when session exists', () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0 }) // sessionExists
        .mockReturnValueOnce({ status: 0, stdout: 'captured output' }); // capture-pane
      const manager = new TmuxManager('dure', '/project/root');

      const output = manager.capturePane('builder');

      expect(output).toBe('captured output');
    });

    it('should return empty string on error', () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0 }) // sessionExists
        .mockImplementationOnce(() => { throw new Error('capture failed'); });
      const manager = new TmuxManager('dure', '/project/root');

      const output = manager.capturePane('builder');

      expect(output).toBe('');
    });
  });

  describe('isPaneActive', () => {
    it('should return false when session does not exist', () => {
      mockSpawnSync.mockReturnValue({ status: 1 }); // sessionExists returns false
      const manager = new TmuxManager('dure', '/project/root');

      const active = manager.isPaneActive('builder');

      expect(active).toBe(false);
    });

    it('should return true when pane has running non-shell process', () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0 }) // sessionExists
        .mockReturnValueOnce({ status: 0, stdout: '0:bash\n1:node\n2:bash\n3:bash' }); // list-panes
      const manager = new TmuxManager('dure', '/project/root');

      const active = manager.isPaneActive('builder'); // pane 1

      expect(active).toBe(true);
    });

    it('should return false when pane has shell process', () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0 }) // sessionExists
        .mockReturnValueOnce({ status: 0, stdout: '0:bash\n1:bash\n2:bash\n3:bash' }); // list-panes
      const manager = new TmuxManager('dure', '/project/root');

      const active = manager.isPaneActive('builder'); // pane 1

      expect(active).toBe(false);
    });

    it('should return false on error', () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0 }) // sessionExists
        .mockImplementationOnce(() => { throw new Error('check failed'); }); // list-panes throws
      const manager = new TmuxManager('dure', '/project/root');

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
      const manager = new TmuxManager('dure', '/project/root');

      manager.updatePaneBordersWithModels(modelSelection);

      // Should only call for sessionExists check
      expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    });

    it('should update pane borders when session exists', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

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
      const manager = new TmuxManager('dure', '/project/root');

      // Should not throw
      expect(() => manager.updatePaneBordersWithModels(modelSelection)).not.toThrow();
    });

    it('should include all agents in pane border format', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      manager.updatePaneBordersWithModels(modelSelection);

      // Find the set-option call
      const setOptionCall = mockSpawnSync.mock.calls.find(
        (call: any[]) => call[0] === 'tmux' && call[1]?.includes('set-option')
      );
      expect(setOptionCall).toBeDefined();

      const formatArg = setOptionCall?.[1]?.find((arg: string) => arg.includes('Refiner'));
      expect(formatArg).toContain('Refiner');
      expect(formatArg).toContain('Builder');
      expect(formatArg).toContain('Verifier');
      expect(formatArg).toContain('Gatekeeper');
    });
  });

  describe('waitForClaudeReady', () => {
    it('should return true when Claude ready indicator found', async () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0 }) // sessionExists for isPaneActive
        .mockReturnValueOnce({ status: 0, stdout: '0:node\n1:bash' }) // list-panes for isPaneActive
        .mockReturnValueOnce({ status: 0 }) // sessionExists for capturePane
        .mockReturnValueOnce({ status: 0, stdout: '> Type /help or ...\nTips:' }); // capture-pane output

      const manager = new TmuxManager('dure', '/project/root');
      const result = await manager.waitForClaudeReady('refiner', 1000, 100);

      expect(result).toBe(true);
    });

    it('should return false when timeout exceeded', async () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0 }) // sessionExists for isPaneActive
        .mockReturnValueOnce({ status: 0, stdout: '0:bash\n1:bash' }) // list-panes - no process running
        .mockReturnValue({ status: 0 }); // subsequent calls

      const manager = new TmuxManager('dure', '/project/root');
      const result = await manager.waitForClaudeReady('refiner', 200, 100);

      expect(result).toBe(false);
    }, 5000);

    it('should detect Claude by box drawing character', async () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0 }) // sessionExists for isPaneActive
        .mockReturnValueOnce({ status: 0, stdout: '0:node\n1:bash' }) // list-panes
        .mockReturnValueOnce({ status: 0 }) // sessionExists for capturePane
        .mockReturnValueOnce({ status: 0, stdout: '╭────────────────────╮' }); // UI element

      const manager = new TmuxManager('dure', '/project/root');
      const result = await manager.waitForClaudeReady('refiner', 1000, 100);

      expect(result).toBe(true);
    });

    it('should detect Claude by prompt character', async () => {
      mockSpawnSync
        .mockReturnValueOnce({ status: 0 }) // sessionExists for isPaneActive
        .mockReturnValueOnce({ status: 0, stdout: '0:node\n1:bash' }) // list-panes
        .mockReturnValueOnce({ status: 0 }) // sessionExists for capturePane
        .mockReturnValueOnce({ status: 0, stdout: 'Welcome\n> ' }); // prompt

      const manager = new TmuxManager('dure', '/project/root');
      const result = await manager.waitForClaudeReady('refiner', 1000, 100);

      expect(result).toBe(true);
    });
  });

  describe('startAgentHeadless', () => {
    it('should call startAgent with correct parameters', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      manager.startAgentHeadless('refiner', 'haiku', '/project/root/prompts/refiner.md', '/project/root/refiner');

      // Verify send-keys was called with claude command
      const sendKeysCall = mockSpawnSync.mock.calls.find(
        (call: any[]) => call[0] === 'tmux' &&
          call[1]?.some((arg: string) =>
            arg.includes('claude') &&
            arg.includes('-p') &&
            arg.includes('--output-format json')
          )
      );
      expect(sendKeysCall).toBeDefined();
    });
  });

  describe('restartAgentWithVCR', () => {
    it('should restart agent in headless mode with continuation prompt', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      manager.restartAgentWithVCR(
        'refiner',
        'haiku',
        '/project/root/prompts/refiner-vcr.md',
        '/project/root/refiner'
      );

      // Should call send-keys with claude command
      const claudeCall = mockSpawnSync.mock.calls.find(
        (call: any[]) => call[0] === 'tmux' &&
          call[1]?.some((arg: string) =>
            arg.includes('claude') &&
            arg.includes('haiku') &&
            arg.includes('-p') &&
            arg.includes('--output-format json')
          )
      );
      expect(claudeCall).toBeDefined();
    });

    it('should throw error for invalid agent name', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      expect(() => manager.restartAgentWithVCR(
        'invalid' as any,
        'haiku',
        '/project/root/prompts/invalid.md',
        '/project/root/invalid'
      )).toThrow('Invalid agent name');
    });

    it('should throw error for invalid model', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      expect(() => manager.restartAgentWithVCR(
        'refiner',
        'invalid' as any,
        '/project/root/prompts/refiner.md',
        '/project/root/refiner'
      )).toThrow('Invalid model');
    });
  });

  describe('sendKeys', () => {
    it('should send keys to correct pane', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      manager.sendKeys('builder', 'echo hello');

      // Should call send-keys with -l for literal and then Enter
      const literalCall = mockSpawnSync.mock.calls.find(
        (call: any[]) => call[0] === 'tmux' && call[1]?.includes('-l')
      );
      expect(literalCall).toBeDefined();

      const enterCall = mockSpawnSync.mock.calls.find(
        (call: any[]) => call[0] === 'tmux' && call[1]?.includes('Enter')
      );
      expect(enterCall).toBeDefined();
    });

    it('should target debug pane correctly', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      manager.sendKeys('debug', 'ls -la');

      const sendKeysCall = mockSpawnSync.mock.calls.find(
        (call: any[]) => call[0] === 'tmux' && call[1]?.[0] === 'send-keys'
      );
      expect(sendKeysCall).toBeDefined();
      // Debug is pane 4
      expect(sendKeysCall?.[1]).toContain('-t');
      expect(sendKeysCall?.[1]?.some((arg: string) => arg.includes('.4'))).toBe(true);
    });

    it('should target server pane correctly', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      manager.sendKeys('server', 'npm start');

      const sendKeysCall = mockSpawnSync.mock.calls.find(
        (call: any[]) => call[0] === 'tmux' && call[1]?.[0] === 'send-keys'
      );
      expect(sendKeysCall).toBeDefined();
      // Server is pane 5
      expect(sendKeysCall?.[1]).toContain('-t');
      expect(sendKeysCall?.[1]?.some((arg: string) => arg.includes('.5'))).toBe(true);
    });
  });

  describe('startAgent', () => {
    it('should start Claude in headless mode with correct model', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      manager.startAgent('refiner', 'haiku', '/project/root/prompts/refiner.md', '/project/root/refiner');

      // Should call send-keys with claude command including -p and --output-format json
      const claudeCall = mockSpawnSync.mock.calls.find(
        (call: any[]) => call[0] === 'tmux' &&
          call[1]?.some((arg: string) =>
            arg.includes('claude') &&
            arg.includes('haiku') &&
            arg.includes('-p') &&
            arg.includes('--output-format json')
          )
      );
      expect(claudeCall).toBeDefined();
    });

    it('should throw error for invalid agent name', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      expect(() => manager.startAgent('invalid' as any, 'haiku', '/project/root/prompts/invalid.md', '/project/root/invalid'))
        .toThrow('Invalid agent name');
    });

    it('should throw error for invalid model', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      expect(() => manager.startAgent('refiner', 'invalid' as any, '/project/root/prompts/refiner.md', '/project/root/refiner'))
        .toThrow('Invalid model');
    });

    it('should redirect output to output.json file', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      manager.startAgent('builder', 'sonnet', '/project/root/prompts/builder.md', '/project/root/builder');

      // Should include output redirection to output.json
      const claudeCall = mockSpawnSync.mock.calls.find(
        (call: any[]) => call[0] === 'tmux' &&
          call[1]?.some((arg: string) => arg.includes('output.json'))
      );
      expect(claudeCall).toBeDefined();
    });
  });

  describe('startServer', () => {
    it('should start server on specified port', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      manager.startServer(3000);

      // Should call send-keys with node command
      const serverCall = mockSpawnSync.mock.calls.find(
        (call: any[]) => call[0] === 'tmux' &&
          call[1]?.some((arg: string) => arg.includes('node') && arg.includes('3000'))
      );
      expect(serverCall).toBeDefined();
    });

    it('should throw error for invalid port', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      expect(() => manager.startServer(0)).toThrow('Invalid port');
      expect(() => manager.startServer(-1)).toThrow('Invalid port');
      expect(() => manager.startServer(65536)).toThrow('Invalid port');
      expect(() => manager.startServer(3.14)).toThrow('Invalid port');
    });
  });

  describe('showServerInfo', () => {
    it('should display server URLs in debug shell', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      manager.showServerInfo(3000);

      // Should call send-keys with server URLs
      const debugCall = mockSpawnSync.mock.calls.find(
        (call: any[]) => call[0] === 'tmux' &&
          call[1]?.some((arg: string) =>
            arg.includes('http://localhost:3000') &&
            arg.includes('api-docs')
          )
      );
      expect(debugCall).toBeDefined();
    });

    it('should throw error for invalid port', () => {
      mockSpawnSync.mockReturnValue({ status: 0 });
      const manager = new TmuxManager('dure', '/project/root');

      expect(() => manager.showServerInfo(0)).toThrow('Invalid port');
      expect(() => manager.showServerInfo(-1)).toThrow('Invalid port');
      expect(() => manager.showServerInfo(65536)).toThrow('Invalid port');
      expect(() => manager.showServerInfo(3.14)).toThrow('Invalid port');
    });
  });

  describe('listSessions', () => {
    it('should return sessions with matching prefix', () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: 'dure-run-001\ndure-run-002\nother-session',
      });

      const sessions = TmuxManager.listSessions('dure');

      expect(sessions).toContain('dure-run-001');
      expect(sessions).toContain('dure-run-002');
      expect(sessions).not.toContain('other-session');
    });

    it('should return empty array when no sessions', () => {
      mockSpawnSync.mockReturnValue({ status: 1 });

      const sessions = TmuxManager.listSessions('dure');

      expect(sessions).toEqual([]);
    });

    it('should return empty array on error', () => {
      // Save the original mock and restore it after the test
      const errorMock = vi.fn(() => {
        throw new Error('tmux error');
      });
      mockSpawnSync.mockImplementationOnce(errorMock);

      const sessions = TmuxManager.listSessions('dure');

      expect(sessions).toEqual([]);
    });
  });
});
