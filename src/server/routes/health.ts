import { Router, Request, Response } from 'express';
import { existsSync, accessSync, constants, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { TmuxManager } from '../../core/tmux-manager.js';
import type { Orchestrator } from '../../core/orchestrator.js';
import { InterruptRecovery, InterruptedRun } from '../../core/interrupt-recovery.js';
import type { Phase, RunState } from '../../types/index.js';

/**
 * Health check result for individual components
 */
export interface HealthCheckResult {
  status: 'pass' | 'fail';
  message?: string;
  latency_ms?: number;
}

/**
 * Full health check response
 */
export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    orchestrator: HealthCheckResult;
    tmux: HealthCheckResult;
    fileSystem: HealthCheckResult;
  };
}

/**
 * Simple liveness response
 */
export interface LivenessResponse {
  status: 'ok';
  timestamp: string;
}

/**
 * Readiness response
 */
export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    orchestrator: boolean;
    fileSystem: boolean;
  };
}

/**
 * Interrupted runs response
 */
export interface InterruptedRunsResponse {
  count: number;
  runs: InterruptedRun[];
  timestamp: string;
}

/**
 * Component health status
 */
export interface ComponentHealth {
  status: 'up' | 'down' | 'degraded';
  message?: string;
  lastCheck: string;
  latency_ms?: number;
}

/**
 * Current run information
 */
export interface CurrentRunInfo {
  runId: string;
  phase: Phase;
  iteration: number;
  startedAt: string;
  agents: {
    refiner: string;
    builder: string;
    verifier: string;
    gatekeeper: string;
  };
}

/**
 * Health metrics summary
 */
export interface HealthMetrics {
  totalRuns?: number;
  successfulRuns?: number;
  failedRuns?: number;
  averageRunDuration?: number;
}

/**
 * Detailed health response
 */
export interface HealthDetailsResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: string;
  components: {
    fileSystem: ComponentHealth;
    tmux: ComponentHealth;
    orchestrator: ComponentHealth;
  };
  currentRun?: CurrentRunInfo;
  interruptedRuns?: number;
  config?: {
    maxIterations: number;
    sessionPrefix: string;
    projectRoot: string;
  };
}

// Track server start time for uptime calculation
const serverStartTime = Date.now();

// Get version from package.json (loaded once)
let packageVersion = '0.0.0';
try {
  // In production, package.json is at the dist root
  const packagePath = join(process.cwd(), 'package.json');
  if (existsSync(packagePath)) {
    const pkg = await import(packagePath, { with: { type: 'json' } });
    packageVersion = pkg.default?.version || '0.0.0';
  }
} catch {
  // Fallback to unknown version
}

/**
 * Check orchestrator health
 */
function checkOrchestrator(orchestrator: Orchestrator): HealthCheckResult {
  const start = Date.now();
  try {
    const runId = orchestrator.getCurrentRunId();
    return {
      status: 'pass',
      message: runId ? `Active run: ${runId}` : 'No active run',
      latency_ms: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : 'Unknown error',
      latency_ms: Date.now() - start,
    };
  }
}

/**
 * Check tmux availability
 */
function checkTmux(sessionPrefix: string): HealthCheckResult {
  const start = Date.now();
  try {
    const sessions = TmuxManager.listSessions(sessionPrefix);
    return {
      status: 'pass',
      message: sessions.length > 0 ? `Active sessions: ${sessions.length}` : 'tmux available, no active sessions',
      latency_ms: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : 'tmux not available',
      latency_ms: Date.now() - start,
    };
  }
}

/**
 * Check file system write access
 */
function checkFileSystem(projectRoot: string): HealthCheckResult {
  const start = Date.now();
  const dureDir = join(projectRoot, '.dure');
  const testFile = join(dureDir, '.health-check-test');

  try {
    // Check if .dure directory exists
    if (!existsSync(dureDir)) {
      return {
        status: 'fail',
        message: '.dure directory does not exist',
        latency_ms: Date.now() - start,
      };
    }

    // Check write access by creating and deleting a test file
    writeFileSync(testFile, 'health-check', 'utf-8');
    unlinkSync(testFile);

    return {
      status: 'pass',
      message: 'File system writable',
      latency_ms: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'fail',
      message: error instanceof Error ? error.message : 'File system not writable',
      latency_ms: Date.now() - start,
    };
  }
}

/**
 * Determine overall health status based on individual checks
 */
function determineOverallStatus(checks: HealthResponse['checks']): 'healthy' | 'degraded' | 'unhealthy' {
  const results = Object.values(checks);
  const failCount = results.filter((r) => r.status === 'fail').length;

  if (failCount === 0) {
    return 'healthy';
  } else if (failCount === results.length) {
    return 'unhealthy';
  } else {
    return 'degraded';
  }
}

/**
 * Create health check router
 *
 * @param projectRoot - Project root directory
 * @param orchestrator - Orchestrator instance
 * @param sessionPrefix - tmux session prefix (default: 'dure')
 */
export function createHealthRouter(
  projectRoot: string,
  orchestrator: Orchestrator,
  sessionPrefix = 'dure'
): Router {
  const router = Router();

  /**
   * GET /health - Full health check
   *
   * Returns detailed health information including:
   * - Overall status (healthy/degraded/unhealthy)
   * - Individual component checks
   * - Server uptime and version
   *
   * Response codes:
   * - 200: healthy or degraded
   * - 503: unhealthy
   */
  router.get('/', (_req: Request, res: Response) => {
    const checks = {
      orchestrator: checkOrchestrator(orchestrator),
      tmux: checkTmux(sessionPrefix),
      fileSystem: checkFileSystem(projectRoot),
    };

    const status = determineOverallStatus(checks);
    const response: HealthResponse = {
      status,
      timestamp: new Date().toISOString(),
      version: packageVersion,
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      checks,
    };

    const httpStatus = status === 'unhealthy' ? 503 : 200;
    res.status(httpStatus).json(response);
  });

  /**
   * GET /health/live - Liveness probe
   *
   * Simple check that the server is responding.
   * Used by Kubernetes liveness probe.
   *
   * Always returns 200 if the server is running.
   */
  router.get('/live', (_req: Request, res: Response) => {
    const response: LivenessResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
    res.status(200).json(response);
  });

  /**
   * GET /health/ready - Readiness probe
   *
   * Check if the server is ready to accept traffic.
   * Used by Kubernetes readiness probe.
   *
   * Checks:
   * - Orchestrator is accessible
   * - File system is writable
   *
   * Response codes:
   * - 200: ready
   * - 503: not ready
   */
  router.get('/ready', (_req: Request, res: Response) => {
    const orchestratorCheck = checkOrchestrator(orchestrator);
    const fileSystemCheck = checkFileSystem(projectRoot);

    const isReady = orchestratorCheck.status === 'pass' && fileSystemCheck.status === 'pass';

    const response: ReadinessResponse = {
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        orchestrator: orchestratorCheck.status === 'pass',
        fileSystem: fileSystemCheck.status === 'pass',
      },
    };

    res.status(isReady ? 200 : 503).json(response);
  });

  /**
   * GET /health/interrupted - List interrupted runs
   *
   * Returns a list of runs that were interrupted and may need recovery.
   * Useful for monitoring and operational visibility.
   */
  router.get('/interrupted', async (_req: Request, res: Response) => {
    try {
      const recovery = new InterruptRecovery(projectRoot, {
        tmuxSessionPrefix: sessionPrefix,
      });

      const runs = await recovery.detectInterruptedRuns();

      const response: InterruptedRunsResponse = {
        count: runs.length,
        runs,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to detect interrupted runs',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * GET /health/details - Detailed health information
   *
   * Returns comprehensive health information including:
   * - Component-level health status
   * - Current run information (if any)
   * - Configuration details
   * - Interrupted runs count
   *
   * Always returns 200 with status field indicating health
   * (allows monitoring systems to parse response even when unhealthy)
   */
  router.get('/details', async (_req: Request, res: Response) => {
    const timestamp = new Date().toISOString();

    // Check components
    const orchestratorCheck = checkOrchestrator(orchestrator);
    const tmuxCheck = checkTmux(sessionPrefix);
    const fileSystemCheck = checkFileSystem(projectRoot);

    // Build component health
    const components: HealthDetailsResponse['components'] = {
      orchestrator: {
        status: orchestratorCheck.status === 'pass' ? 'up' : 'down',
        message: orchestratorCheck.message,
        lastCheck: timestamp,
        latency_ms: orchestratorCheck.latency_ms,
      },
      tmux: {
        status: tmuxCheck.status === 'pass' ? 'up' : 'down',
        message: tmuxCheck.message,
        lastCheck: timestamp,
        latency_ms: tmuxCheck.latency_ms,
      },
      fileSystem: {
        status: fileSystemCheck.status === 'pass' ? 'up' : 'down',
        message: fileSystemCheck.message,
        lastCheck: timestamp,
        latency_ms: fileSystemCheck.latency_ms,
      },
    };

    // Determine overall status
    const checks = {
      orchestrator: orchestratorCheck,
      tmux: tmuxCheck,
      fileSystem: fileSystemCheck,
    };
    const overallStatus = determineOverallStatus(checks);

    // Get current run info if available
    let currentRun: CurrentRunInfo | undefined;
    try {
      const state = await orchestrator.getCurrentState();
      if (state && orchestrator.getIsRunning()) {
        currentRun = {
          runId: state.run_id,
          phase: state.phase,
          iteration: state.iteration,
          startedAt: state.started_at,
          agents: {
            refiner: state.agents.refiner.status,
            builder: state.agents.builder.status,
            verifier: state.agents.verifier.status,
            gatekeeper: state.agents.gatekeeper.status,
          },
        };
      }
    } catch {
      // Ignore errors getting current run
    }

    // Get interrupted runs count
    let interruptedRuns: number | undefined;
    try {
      const recovery = new InterruptRecovery(projectRoot, {
        tmuxSessionPrefix: sessionPrefix,
      });
      const runs = await recovery.detectInterruptedRuns();
      interruptedRuns = runs.length;
    } catch {
      // Ignore errors detecting interrupted runs
    }

    const response: HealthDetailsResponse = {
      status: overallStatus,
      version: packageVersion,
      uptime: Math.floor((Date.now() - serverStartTime) / 1000),
      timestamp,
      components,
      currentRun,
      interruptedRuns,
      config: {
        maxIterations: 10, // TODO: Get from actual config if available
        sessionPrefix,
        projectRoot,
      },
    };

    // Always return 200, status field indicates health
    res.status(200).json(response);
  });

  return router;
}
