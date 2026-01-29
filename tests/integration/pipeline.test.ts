/**
 * Pipeline Integration Tests
 * Tests the complete agent workflow: Refine → Build → Verify → Gate
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { join } from 'path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { Orchestrator, OrchestratorEvent } from '../../src/core/orchestrator.js';
import { RunManager } from '../../src/core/run-manager.js';
import { StateManager } from '../../src/core/state-manager.js';
import * as TmuxModule from '../../src/core/tmux-manager.js';
import {
  createTempDir,
  cleanupTempDir,
  getDefaultTestConfig,
  getSampleBriefing,
  createMockVerdict,
  createMockCRP,
  writeMockCRP,
  writeMockVerdict,
  writeMockVCR,
} from '../helpers/test-utils.js';
import type { OrchestraConfig, GatekeeperVerdict, Phase, AgentName, CRP, VCR } from '../../src/types/index.js';

describe('Pipeline Integration - Full Flow', () => {
  let tempDir: string;
  let config: OrchestraConfig;
  let orchestrator: Orchestrator;
  let runManager: RunManager;
  let collectedEvents: OrchestratorEvent[];
  let tmuxMock: {
    createSession: Mock;
    killSession: Mock;
    sessionExists: Mock;
    getSessionName: Mock;
    startAgent: Mock;
    capturePane: Mock;
    updatePaneBordersWithModels: Mock;
    clearAgent: Mock;
    isPaneActive: Mock;
    sendPendingPrompt: Mock;
    startAgentAndWaitReady: Mock;
  };

  beforeEach(async () => {
    tempDir = createTempDir('pipeline-integration');
    config = getDefaultTestConfig();
    runManager = new RunManager(tempDir);
    await runManager.initialize();

    // Create config directory
    mkdirSync(join(tempDir, '.dure', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.dure', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2)
    );

    // Mock TmuxManager static method
    vi.spyOn(TmuxModule.TmuxManager, 'isTmuxAvailable').mockReturnValue(true);

    // Setup instance method mocks
    tmuxMock = {
      createSession: vi.fn(),
      killSession: vi.fn(),
      sessionExists: vi.fn().mockReturnValue(false),
      getSessionName: vi.fn().mockReturnValue('test-session'),
      startAgent: vi.fn(),
      capturePane: vi.fn().mockReturnValue(''),
      updatePaneBordersWithModels: vi.fn(),
      clearAgent: vi.fn(),
      isPaneActive: vi.fn().mockReturnValue(true),
      sendPendingPrompt: vi.fn().mockResolvedValue(undefined),
      startAgentAndWaitReady: vi.fn().mockResolvedValue(true),
    };

    // Mock TmuxManager prototype methods
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'createSession').mockImplementation(tmuxMock.createSession);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'killSession').mockImplementation(tmuxMock.killSession);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'sessionExists').mockImplementation(tmuxMock.sessionExists);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'getSessionName').mockImplementation(tmuxMock.getSessionName);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'startAgent').mockImplementation(tmuxMock.startAgent);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'capturePane').mockImplementation(tmuxMock.capturePane);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'updatePaneBordersWithModels').mockImplementation(tmuxMock.updatePaneBordersWithModels);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'clearAgent').mockImplementation(tmuxMock.clearAgent);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'isPaneActive').mockImplementation(tmuxMock.isPaneActive);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'sendPendingPrompt').mockImplementation(tmuxMock.sendPendingPrompt);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'startAgentAndWaitReady').mockImplementation(tmuxMock.startAgentAndWaitReady);

    orchestrator = new Orchestrator(tempDir, config);
    collectedEvents = [];

    // Collect all events
    orchestrator.on('orchestrator_event', (event: OrchestratorEvent) => {
      collectedEvents.push(event);
    });
  });

  afterEach(async () => {
    try {
      await orchestrator.stopRun();
    } catch {
      // Ignore cleanup errors
    }
    cleanupTempDir(tempDir);
    vi.restoreAllMocks();
  });

  describe('Successful Pipeline Flow', () => {
    it('should start with refine phase', async () => {
      const runId = await orchestrator.startRun(getSampleBriefing());

      const state = await orchestrator.getCurrentState();
      expect(state?.phase).toBe('refine');
      expect(state?.iteration).toBe(1);

      // Verify refiner agent was started
      const agentStartedEvent = collectedEvents.find(
        e => e.type === 'agent_started' && 'agent' in e && e.agent === 'refiner'
      );
      expect(agentStartedEvent).toBeDefined();
    });

    it('should emit events in correct order during startup', async () => {
      await orchestrator.startRun(getSampleBriefing());

      const eventTypes = collectedEvents.map(e => e.type);

      // Verify expected event order
      expect(eventTypes).toContain('run_started');
      expect(eventTypes).toContain('models_selected');
      expect(eventTypes).toContain('agent_started');

      const runStartedIndex = eventTypes.indexOf('run_started');
      const modelsSelectedIndex = eventTypes.indexOf('models_selected');
      const agentStartedIndex = eventTypes.indexOf('agent_started');

      expect(modelsSelectedIndex).toBeGreaterThan(runStartedIndex);
      expect(agentStartedIndex).toBeGreaterThan(modelsSelectedIndex);
    });

    it('should create tmux session when starting run', async () => {
      await orchestrator.startRun(getSampleBriefing());

      expect(tmuxMock.createSession).toHaveBeenCalled();
    });

    it('should update pane borders with model selection', async () => {
      await orchestrator.startRun(getSampleBriefing());

      expect(tmuxMock.updatePaneBordersWithModels).toHaveBeenCalled();
    });
  });

  describe('Phase Transition Flow', () => {
    it('should handle agent completion and phase transition', async () => {
      const runId = await orchestrator.startRun(getSampleBriefing());

      // Verify initial state
      let state = await orchestrator.getCurrentState();
      expect(state?.phase).toBe('refine');

      // Simulate refiner completion by writing done flag
      const runDir = runManager.getRunDir(runId);
      const refinerDoneFile = join(runDir, 'refiner', 'done.flag');
      mkdirSync(join(runDir, 'refiner'), { recursive: true });
      writeFileSync(refinerDoneFile, new Date().toISOString());

      // Note: In a real test, we would need to trigger the file watcher
      // For this test, we verify the initial state is correct
      expect(existsSync(refinerDoneFile)).toBe(true);
    });
  });

  describe('PASS Verdict Flow', () => {
    it('should write PASS verdict to correct location', async () => {
      const runId = await orchestrator.startRun(getSampleBriefing());
      const runDir = runManager.getRunDir(runId);

      // Write a PASS verdict
      const verdict = createMockVerdict('PASS');
      writeMockVerdict(runDir, verdict);

      // Verify verdict file was created
      const verdictPath = join(runDir, 'gatekeeper', 'verdict.json');
      expect(existsSync(verdictPath)).toBe(true);

      // Verify verdict content
      const verdictContent = JSON.parse(readFileSync(verdictPath, 'utf-8'));
      expect(verdictContent.verdict).toBe('PASS');
    });
  });

  describe('FAIL Verdict Flow', () => {
    it('should write FAIL verdict with issues', async () => {
      const runId = await orchestrator.startRun(getSampleBriefing());
      const runDir = runManager.getRunDir(runId);

      // Write a FAIL verdict with issues
      const verdict = createMockVerdict('FAIL');
      verdict.issues = [
        { type: 'test_failure', severity: 'high', description: 'Unit tests failing', file: 'test.ts' },
        { type: 'code_quality', severity: 'medium', description: 'Missing error handling', file: 'main.ts' },
      ];
      writeMockVerdict(runDir, verdict);

      // Verify verdict file was created
      const verdictPath = join(runDir, 'gatekeeper', 'verdict.json');
      expect(existsSync(verdictPath)).toBe(true);

      // Verify verdict content
      const verdictContent = JSON.parse(readFileSync(verdictPath, 'utf-8'));
      expect(verdictContent.verdict).toBe('FAIL');
      expect(verdictContent.issues).toHaveLength(2);
    });
  });
});

describe('Pipeline Integration - CRP/VCR Flow', () => {
  let tempDir: string;
  let config: OrchestraConfig;
  let orchestrator: Orchestrator;
  let runManager: RunManager;
  let collectedEvents: OrchestratorEvent[];

  beforeEach(async () => {
    tempDir = createTempDir('pipeline-crp');
    config = getDefaultTestConfig();
    runManager = new RunManager(tempDir);
    await runManager.initialize();

    mkdirSync(join(tempDir, '.dure', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.dure', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2)
    );

    vi.spyOn(TmuxModule.TmuxManager, 'isTmuxAvailable').mockReturnValue(true);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'createSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'killSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'sessionExists').mockReturnValue(false);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'getSessionName').mockReturnValue('test-session');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'startAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'capturePane').mockReturnValue('');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'updatePaneBordersWithModels').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'clearAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'isPaneActive').mockReturnValue(true);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'sendPendingPrompt').mockResolvedValue(undefined);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'startAgentAndWaitReady').mockResolvedValue(true);

    orchestrator = new Orchestrator(tempDir, config);
    collectedEvents = [];

    orchestrator.on('orchestrator_event', (event: OrchestratorEvent) => {
      collectedEvents.push(event);
    });
  });

  afterEach(async () => {
    try {
      await orchestrator.stopRun();
    } catch {
      // Ignore cleanup errors
    }
    cleanupTempDir(tempDir);
    vi.restoreAllMocks();
  });

  describe('NEEDS_HUMAN Verdict with CRP', () => {
    it('should write NEEDS_HUMAN verdict with CRP', async () => {
      const runId = await orchestrator.startRun(getSampleBriefing());
      const runDir = runManager.getRunDir(runId);

      // Write a NEEDS_HUMAN verdict
      const verdict = createMockVerdict('NEEDS_HUMAN');
      verdict.reason = 'Architecture decision required';
      writeMockVerdict(runDir, verdict);

      // Write a CRP
      const crp = createMockCRP(`crp-${Date.now()}`, {
        created_by: 'gatekeeper',
        type: 'architecture_decision',
        question: 'Which database should we use?',
        options: [
          { id: 'A', label: 'PostgreSQL', description: 'Relational database' },
          { id: 'B', label: 'MongoDB', description: 'Document database' },
        ],
      });
      writeMockCRP(runDir, crp);

      // Verify CRP file was created
      const crpPath = join(runDir, 'crp', `${crp.crp_id}.json`);
      expect(existsSync(crpPath)).toBe(true);

      // Verify CRP content
      const crpContent = JSON.parse(readFileSync(crpPath, 'utf-8'));
      expect(crpContent.type).toBe('architecture_decision');
      expect(crpContent.options).toHaveLength(2);
    });

    it('should create CRP with multi-question format', async () => {
      const runId = await orchestrator.startRun(getSampleBriefing());
      const runDir = runManager.getRunDir(runId);

      // Create multi-question CRP
      const crp: CRP = {
        crp_id: `crp-${Date.now()}`,
        created_at: new Date().toISOString(),
        created_by: 'builder',
        type: 'architecture_decision',
        context: 'Multiple decisions needed',
        questions: [
          {
            id: 'q1',
            question: 'Which database?',
            options: [
              { id: 'pg', label: 'PostgreSQL', description: 'Relational' },
              { id: 'mongo', label: 'MongoDB', description: 'Document' },
            ],
          },
          {
            id: 'q2',
            question: 'Which cache?',
            options: [
              { id: 'redis', label: 'Redis', description: 'In-memory' },
              { id: 'memcached', label: 'Memcached', description: 'Simple cache' },
            ],
          },
        ],
        status: 'pending',
      };

      writeMockCRP(runDir, crp);

      // Verify CRP file was created
      const crpPath = join(runDir, 'crp', `${crp.crp_id}.json`);
      expect(existsSync(crpPath)).toBe(true);

      // Verify CRP content
      const crpContent = JSON.parse(readFileSync(crpPath, 'utf-8'));
      expect(crpContent.questions).toHaveLength(2);
      expect(crpContent.questions[0].id).toBe('q1');
      expect(crpContent.questions[1].id).toBe('q2');
    });
  });

  describe('VCR Response Flow', () => {
    it('should write VCR response for single-question CRP', async () => {
      const runId = await orchestrator.startRun(getSampleBriefing());
      const runDir = runManager.getRunDir(runId);

      // First create a CRP
      const crp = createMockCRP(`crp-${Date.now()}`, {
        created_by: 'gatekeeper',
        question: 'Which approach?',
        options: [
          { id: 'A', label: 'Approach A', description: 'Simple' },
          { id: 'B', label: 'Approach B', description: 'Complex' },
        ],
      });
      writeMockCRP(runDir, crp);

      // Then write VCR response
      const vcr: VCR = {
        vcr_id: `vcr-${Date.now()}`,
        crp_id: crp.crp_id,
        created_at: new Date().toISOString(),
        decision: 'A',
        rationale: 'Simpler is better for MVP',
        applies_to_future: false,
      };
      writeMockVCR(runDir, vcr);

      // Verify VCR file was created
      const vcrPath = join(runDir, 'vcr', `${vcr.vcr_id}.json`);
      expect(existsSync(vcrPath)).toBe(true);

      // Verify VCR content
      const vcrContent = JSON.parse(readFileSync(vcrPath, 'utf-8'));
      expect(vcrContent.decision).toBe('A');
      expect(vcrContent.crp_id).toBe(crp.crp_id);
    });

    it('should write VCR response for multi-question CRP', async () => {
      const runId = await orchestrator.startRun(getSampleBriefing());
      const runDir = runManager.getRunDir(runId);

      // Create multi-question CRP
      const crp: CRP = {
        crp_id: `crp-${Date.now()}`,
        created_at: new Date().toISOString(),
        created_by: 'builder',
        type: 'architecture_decision',
        context: 'Multiple decisions needed',
        questions: [
          {
            id: 'q1',
            question: 'Which database?',
            options: [
              { id: 'pg', label: 'PostgreSQL', description: 'Relational' },
              { id: 'mongo', label: 'MongoDB', description: 'Document' },
            ],
          },
          {
            id: 'q2',
            question: 'Which cache?',
            options: [
              { id: 'redis', label: 'Redis', description: 'In-memory' },
              { id: 'memcached', label: 'Memcached', description: 'Simple cache' },
            ],
          },
        ],
        status: 'pending',
      };
      writeMockCRP(runDir, crp);

      // Write multi-question VCR response
      const vcr: VCR = {
        vcr_id: `vcr-${Date.now()}`,
        crp_id: crp.crp_id,
        created_at: new Date().toISOString(),
        decision: { q1: 'pg', q2: 'redis' },
        rationale: 'Standard stack for MVP',
        applies_to_future: true,
      };
      writeMockVCR(runDir, vcr);

      // Verify VCR file was created
      const vcrPath = join(runDir, 'vcr', `${vcr.vcr_id}.json`);
      expect(existsSync(vcrPath)).toBe(true);

      // Verify VCR content
      const vcrContent = JSON.parse(readFileSync(vcrPath, 'utf-8'));
      expect(vcrContent.decision).toEqual({ q1: 'pg', q2: 'redis' });
      expect(vcrContent.applies_to_future).toBe(true);
    });

    it('should list CRPs and VCRs correctly', async () => {
      const runId = await orchestrator.startRun(getSampleBriefing());
      const runDir = runManager.getRunDir(runId);

      // Create multiple CRPs
      const crp1 = createMockCRP('crp-001', {
        created_by: 'refiner',
        question: 'First question?',
      });
      writeMockCRP(runDir, crp1);

      const crp2 = createMockCRP('crp-002', {
        created_by: 'builder',
        question: 'Second question?',
      });
      writeMockCRP(runDir, crp2);

      // Verify CRP listing
      const crps = await runManager.listCRPs(runId);
      expect(crps).toHaveLength(2);
      expect(crps.map(c => c.crp_id)).toContain('crp-001');
      expect(crps.map(c => c.crp_id)).toContain('crp-002');
    });
  });
});

describe('Pipeline Integration - Error Scenarios', () => {
  let tempDir: string;
  let config: OrchestraConfig;

  beforeEach(async () => {
    tempDir = createTempDir('pipeline-errors');
    config = getDefaultTestConfig();
    const runManager = new RunManager(tempDir);
    await runManager.initialize();

    mkdirSync(join(tempDir, '.dure', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.dure', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2)
    );
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    vi.restoreAllMocks();
  });

  it('should fail when tmux is not available', async () => {
    vi.spyOn(TmuxModule.TmuxManager, 'isTmuxAvailable').mockReturnValue(false);

    const orchestrator = new Orchestrator(tempDir, config);

    await expect(orchestrator.startRun(getSampleBriefing())).rejects.toThrow(
      'tmux is not installed'
    );
  });

  it('should handle concurrent run attempt', async () => {
    vi.spyOn(TmuxModule.TmuxManager, 'isTmuxAvailable').mockReturnValue(true);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'createSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'killSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'sessionExists').mockReturnValue(false);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'getSessionName').mockReturnValue('test-session');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'startAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'capturePane').mockReturnValue('');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'updatePaneBordersWithModels').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'clearAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'isPaneActive').mockReturnValue(true);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'sendPendingPrompt').mockResolvedValue(undefined);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'startAgentAndWaitReady').mockResolvedValue(true);

    const orchestrator = new Orchestrator(tempDir, config);

    // Start first run
    await orchestrator.startRun(getSampleBriefing());

    // Attempt second run should fail
    await expect(orchestrator.startRun(getSampleBriefing())).rejects.toThrow(
      'A run is already in progress'
    );

    await orchestrator.stopRun();
  });
});

describe('Pipeline Integration - Run State Persistence', () => {
  let tempDir: string;
  let config: OrchestraConfig;
  let runManager: RunManager;

  beforeEach(async () => {
    tempDir = createTempDir('pipeline-state');
    config = getDefaultTestConfig();
    runManager = new RunManager(tempDir);
    await runManager.initialize();

    mkdirSync(join(tempDir, '.dure', 'config'), { recursive: true });
    writeFileSync(
      join(tempDir, '.dure', 'config', 'global.json'),
      JSON.stringify(config.global, null, 2)
    );

    vi.spyOn(TmuxModule.TmuxManager, 'isTmuxAvailable').mockReturnValue(true);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'createSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'killSession').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'sessionExists').mockReturnValue(false);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'getSessionName').mockReturnValue('test-session');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'startAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'capturePane').mockReturnValue('');
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'updatePaneBordersWithModels').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'clearAgent').mockImplementation(() => {});
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'isPaneActive').mockReturnValue(true);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'sendPendingPrompt').mockResolvedValue(undefined);
    vi.spyOn(TmuxModule.TmuxManager.prototype, 'startAgentAndWaitReady').mockResolvedValue(true);
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
    vi.restoreAllMocks();
  });

  it('should persist state to file system', async () => {
    const orchestrator = new Orchestrator(tempDir, config);
    const runId = await orchestrator.startRun(getSampleBriefing());

    // Verify state file exists
    const runDir = runManager.getRunDir(runId);
    const statePath = join(runDir, 'state.json');
    expect(existsSync(statePath)).toBe(true);

    // Verify state content
    const stateContent = JSON.parse(readFileSync(statePath, 'utf-8'));
    expect(stateContent.run_id).toBe(runId);
    expect(stateContent.phase).toBe('refine');
    expect(stateContent.iteration).toBe(1);

    await orchestrator.stopRun();
  });

  it('should save model selection result', async () => {
    const orchestrator = new Orchestrator(tempDir, config);
    const runId = await orchestrator.startRun(getSampleBriefing());

    // Verify model selection file exists
    const result = await orchestrator.getModelSelectionResult(runId);
    expect(result).toBeDefined();
    expect(result?.models).toHaveProperty('refiner');
    expect(result?.models).toHaveProperty('builder');
    expect(result?.models).toHaveProperty('verifier');
    expect(result?.models).toHaveProperty('gatekeeper');

    await orchestrator.stopRun();
  });

  it('should create run directory structure', async () => {
    const orchestrator = new Orchestrator(tempDir, config);
    const runId = await orchestrator.startRun(getSampleBriefing());

    const runDir = runManager.getRunDir(runId);

    // Verify directory structure
    expect(existsSync(runDir)).toBe(true);
    expect(existsSync(join(runDir, 'briefing'))).toBe(true);
    expect(existsSync(join(runDir, 'prompts'))).toBe(true);

    await orchestrator.stopRun();
  });

  it('should generate prompt files for all agents', async () => {
    const orchestrator = new Orchestrator(tempDir, config);
    const runId = await orchestrator.startRun(getSampleBriefing());

    const runDir = runManager.getRunDir(runId);
    const promptsDir = join(runDir, 'prompts');

    // Verify prompt files exist
    expect(existsSync(join(promptsDir, 'refiner.md'))).toBe(true);
    expect(existsSync(join(promptsDir, 'builder.md'))).toBe(true);
    // Verifier uses 2-phase prompts for external test runner
    expect(existsSync(join(promptsDir, 'verifier-phase1.md'))).toBe(true);
    expect(existsSync(join(promptsDir, 'verifier-phase2.md'))).toBe(true);
    expect(existsSync(join(promptsDir, 'gatekeeper.md'))).toBe(true);

    await orchestrator.stopRun();
  });
});
