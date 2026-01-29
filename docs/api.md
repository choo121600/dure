# Dure - API and Event Specification

## CLI Commands

```bash
dure start                    # Start project
dure start --port 3001        # Specify port
dure start --no-browser       # Disable automatic browser opening
dure status                   # Current run status
dure logs                     # Real-time logs
dure stop                     # Stop run
dure history                  # Past run list
dure recover                  # Check interrupted run list
dure recover [run-id]         # Recover specific run
dure recover --auto           # Auto recovery mode
```

## ACE Web Server Page Structure

```
/                       # Dashboard (current status, recent runs)
/settings               # Per-agent settings
/run/new                # Start new run (briefing input)
/run/:id                # Run details (real-time progress)
/run/:id/crp/:crpId     # CRP response page
/run/:id/mrp            # MRP review page
/history                # Past runs list
```

UI implementation: `src/server/public/`

## Event Types

| Event | Trigger | Severity | Action |
|-------|---------|----------|--------|
| `agent.started` | Agent execution started | info | Status update, UI refresh |
| `agent.completed` | done.flag created | info | Start next agent, UI refresh |
| `agent.failed` | error.flag or crash | error | Stop, notification, human intervention request |
| `agent.timeout` | Time limit exceeded | warning | Warning, choose retry or stop |
| `crp.created` | CRP file created | warning | Human input required notification |
| `vcr.created` | VCR file created | info | Restart corresponding agent |
| `mrp.created` | MRP directory created | success | Completion notification, review request |
| `iteration.started` | Retry started | info | Status update |
| `iteration.exhausted` | max_iterations reached | error | Stop, human intervention request |

## Notification Channels

- **WebSocket (required)**: Real-time UI push, reconnection and state synchronization
- **Terminal Bell (optional)**: `\a`, `config.global.terminal_bell: true`
- **System Notification (optional)**: macOS `osascript`, Linux `notify-send`
- **File Log (required)**: Record all events in `events.log`

## WebSocket Events

### Orchestrator Events (Legacy)

**Server→Client:**
- `agent.started`, `agent.completed`, `agent.failed`, `agent.timeout`
- `crp.created`, `phase.changed`, `run.completed`, `run.failed`

**Client→Server:**
- `retry.agent`, `stop.run`, `extend.timeout`, `vcr.submit`

### Dashboard Socket Events

Dashboard uses Socket.io with namespace `/dashboard` for real-time monitoring.

> For detailed Socket.io event reference, see [Socket Events Reference](./api/socket-events.md).

#### Server→Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `dashboard:update` | `DashboardData` | Full dashboard state update |
| `dashboard:crp` | `DashboardCRP` | Human judgment required |
| `dashboard:stage-change` | `{ previousStage, newStage }` | Stage transition |
| `dashboard:agent-status-change` | `{ agent, previousStatus, newStatus }` | Agent status transition |
| `dashboard:error` | `{ error: string }` | Error message |
| `dashboard:subscribed` | `{ runId: string }` | Subscription confirmed |
| `dashboard:unsubscribed` | - | Unsubscription confirmed |

#### Client→Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `dashboard:subscribe` | `runId: string` | Subscribe to run updates |
| `dashboard:unsubscribe` | - | Unsubscribe from current run |
| `dashboard:crp-response` | `CRPResponse` | Submit CRP decision |
| `dashboard:request-update` | - | Request manual state refresh |

#### DashboardData Type

```typescript
interface DashboardData {
  runId: string;
  stage: DashboardStage;
  agents: {
    refiner: DashboardAgentData;
    builder: DashboardAgentData;
    verifier: DashboardAgentData;
    gatekeeper: DashboardAgentData;
  };
  usage: DashboardUsage;
  crp?: DashboardCRP;
  progress: DashboardProgress;
}

type DashboardStage =
  | 'REFINE' | 'BUILD' | 'VERIFY' | 'GATE'
  | 'DONE' | 'FAILED' | 'WAITING_HUMAN';

interface DashboardAgentData {
  status: 'idle' | 'running' | 'done' | 'error';
  output: string;
  startedAt?: Date;
  finishedAt?: Date;
}

interface DashboardCRP {
  agent: AgentName;
  question: string;
  options: string[];
}

interface CRPResponse {
  crpId: string;
  decision: string;
  rationale?: string;
}
```

## Dashboard REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/runs/:runId` | Get run state |
| GET | `/api/runs/:runId/crp` | Get pending CRPs |
| POST | `/api/runs/:runId/vcr` | Submit VCR response |

## Error Handling

**Error Types:**
- `crash` (recoverable): Abnormal process termination
- `timeout` (recoverable): Time exceeded
- `validation` (recoverable): Output format error
- `permission` (unrecoverable): File/command permission error
- `resource` (unrecoverable): Memory/disk shortage

**Agent status values:**
`pending`, `running`, `completed`, `failed`, `timeout`, `waiting_human`

## Timeout Handling

| Agent | Default |
|-------|---------|
| Refiner | 5 min (300000ms) |
| Builder | 10 min (600000ms) |
| Verifier | 5 min (300000ms) |
| Gatekeeper | 5 min (300000ms) |

**timeout_action options:** `warn`, `retry`, `stop`

## events.log Format

```
{timestamp} [{level}] {event_type} {key=value pairs}
```

Example:
```
2024-01-15T14:30:22Z [INFO] run.started run_id=run-20240115-143022
2024-01-15T14:30:25Z [INFO] agent.started agent=refiner
2024-01-15T14:31:00Z [INFO] agent.completed agent=refiner duration_ms=35000
```

## Health Check Endpoints

Endpoints for monitoring server status in production environments. Compatible with Kubernetes liveness/readiness probes.

### GET /health

Returns overall system status.

**Response example:**
```json
{
  "status": "healthy",
  "timestamp": "2026-01-27T10:30:00Z",
  "version": "0.1.0",
  "uptime": 3600,
  "checks": {
    "orchestrator": { "status": "pass", "message": "Running", "latency_ms": 2 },
    "tmux": { "status": "pass", "message": "Session active" },
    "fileSystem": { "status": "pass", "message": "Writable", "latency_ms": 5 }
  }
}
```

**Status values:**
- `healthy`: All checks passed
- `degraded`: Some checks failed (service available)
- `unhealthy`: Core checks failed

### GET /health/live

Check only if server is responsive (for Kubernetes liveness probe).

**Response:**
```json
{ "status": "ok", "timestamp": "2026-01-27T10:30:00Z" }
```

### GET /health/ready

Check if all dependencies are ready (for Kubernetes readiness probe).

**Response (200 OK):**
```json
{
  "status": "ready",
  "timestamp": "2026-01-27T10:30:00Z",
  "checks": {
    "fileSystem": { "status": "pass" },
    "config": { "status": "pass" }
  }
}
```

**Response (503 Service Unavailable):**
```json
{
  "status": "not_ready",
  "timestamp": "2026-01-27T10:30:00Z",
  "checks": {
    "fileSystem": { "status": "fail", "message": "Directory not writable" }
  }
}
```

### GET /health/interrupted

Returns list of interrupted runs.

**Response:**
```json
{
  "count": 2,
  "runs": [
    {
      "runId": "run-20260127-093015",
      "phase": "build",
      "lastAgent": "builder",
      "interruptedAt": "2026-01-27T09:35:00Z",
      "canResume": true,
      "resumeStrategy": "restart_agent"
    }
  ],
  "timestamp": "2026-01-27T10:30:00Z"
}
```

## Usage Tracking

Usage tracking is built into the headless execution mode. When agents run with `--output-format json`, Claude Code outputs a JSON response that includes detailed usage information:

```json
{
  "total_cost_usd": 0.04555975,
  "usage": {
    "input_tokens": 2,
    "cache_creation_input_tokens": 6133,
    "cache_read_input_tokens": 13837,
    "output_tokens": 12
  }
}
```

This data is automatically extracted when each agent completes, providing accurate per-agent usage tracking without external dependencies.

Implementation: `src/core/usage-tracker.ts`
