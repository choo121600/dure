# CLI Commands

Describes all commands and options for the Dure CLI.

## Installation

```bash
# Global installation via npm
npm install -g dure

# Or local installation
npm install dure

# Or use npx (without installation)
npx dure [command]
```

## dure start

Starts Dure with TUI dashboard (default), web dashboard, or tmux attach mode.

### Basic Usage

```bash
dure start [options]
```

### Options

| Option | Short Form | Default | Description |
|--------|------------|---------|-------------|
| `--port <number>` | `-p` | 3873 | Web server port |
| `--web` | - | false | Open web dashboard instead of TUI |
| `--attach` | - | false | Attach to tmux session (legacy mode) |
| `--no-browser` | - | false | Disable automatic browser opening (with `--web`) |
| `--config <path>` | `-c` | `.dure/config` | Configuration file path |
| `--log-level <level>` | `-l` | `info` | Log level (debug/info/warn/error) |

### Examples

```bash
# Default execution (TUI dashboard)
dure start

# Open web dashboard in browser
dure start --web

# Attach to tmux session
dure start --attach

# Change port
dure start --port 3001

# Web dashboard without auto browser
dure start --web --no-browser

# Debug logs
dure start --log-level debug
```

### Execution Modes

#### 1. TUI Dashboard (Default)

```bash
dure start
```

기본 실행 모드입니다. 터미널에 Ink 기반 TUI 대시보드가 표시됩니다.

```
┌────────────────────────────────────────┐
│ Dure Dashboard          run-xxx        │
├────────────────────────────────────────┤
│ Phase: BUILD              Progress: 45%│
│ ┌──────────────────────────────────┐   │
│ │ Agent: Builder                   │   │
│ │ Status: Running                  │   │
│ │ Output: Implementing feature...  │   │
│ └──────────────────────────────────┘   │
│                                        │
│ [q] Quit  [f] Fullscreen  [Tab] Switch │
└────────────────────────────────────────┘
```

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `q` | TUI 종료 (Dure는 백그라운드에서 계속 실행) |
| `f` | 풀스크린 모드 토글 |
| `Tab` | 패널 간 이동 |
| `↑/↓` | 출력 스크롤 |

#### 2. Web Dashboard Mode

```bash
dure start --web
```

웹 브라우저에서 대시보드를 엽니다. 원격 접속이나 팀 협업에 유용합니다.

#### 3. Tmux Attach Mode (Legacy)

```bash
dure start --attach
```

tmux 세션에 직접 연결합니다. 에이전트 패널을 직접 확인해야 할 때 사용합니다.

- `Ctrl+B, D`: tmux 세션에서 분리

### Behavior

1. Create `.dure/` folder if it doesn't exist
2. Create configuration files with defaults if they don't exist
3. Create tmux session (pane structure)
4. Start web server (port 3873)
5. Launch UI based on mode:
   - Default: TUI dashboard
   - `--web`: Open browser
   - `--attach`: Attach to tmux

### Output

```
🎼 Dure
Project: /path/to/project

Initializing configuration...
Creating tmux session...
Starting server on port 3873...

✓ Dure is running
  Server: http://localhost:3873

```

## dure monitor

실행 중인 Run을 모니터링합니다. TUI 또는 웹 대시보드로 실시간 진행 상황을 확인할 수 있습니다.

### Basic Usage

```bash
dure monitor [run-id] [options]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `run-id` | No | 모니터링할 Run ID (생략 시 최신 run 사용) |

### Options

| Option | Short Form | Default | Description |
|--------|------------|---------|-------------|
| `--web` | - | false | 웹 대시보드로 열기 |
| `--port <number>` | `-p` | 3873 | 웹 서버 포트 |

### Examples

```bash
# 최신 run의 TUI 모니터
dure monitor

# 특정 run의 TUI 모니터
dure monitor run-2024-01-26-143022

# 최신 run을 웹 대시보드로 모니터
dure monitor --web

# 특정 run을 웹 대시보드로 모니터
dure monitor run-2024-01-26-143022 --web

# 다른 포트에서 웹 대시보드 열기
dure monitor --web --port 3001
```

### TUI Mode (Default)

```bash
dure monitor
```

터미널에서 직접 실행 상태를 모니터링합니다.

**TUI Layout:**
```
┌─ Header ─────────────────────────────────┐
│ Run ID: run-xxx    Phase: BUILD          │
├─ Agent Panel ────────────────────────────┤
│ [Refiner]  ✓ Done                        │
│ [Builder]  ● Running (45%)               │
│ [Verifier] ○ Pending                     │
│ [Gatekeeper] ○ Pending                   │
├─ Output View ────────────────────────────┤
│ > Building component...                  │
│ > Created file: src/feature.ts           │
│ > Running tests...                       │
├─ Status Bar ─────────────────────────────┤
│ [q] Quit [f] Fullscreen [Tab] Switch     │
└──────────────────────────────────────────┘
```

**Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `q` | TUI 종료 |
| `f` | 풀스크린 토글 |
| `Tab` | 패널 간 이동 |
| `↑/↓` | 출력 스크롤 |
| `Enter` | CRP 응답 입력 (프롬프트 시) |

### Web Mode

```bash
dure monitor --web
```

브라우저에서 대시보드를 엽니다. 다음 상황에 유용합니다:
- 원격 서버에서 실행 중인 Run 모니터링 (SSH 포워딩)
- 팀원과 URL 공유
- 여러 Run을 탭으로 관리

**URL Format:**
```
http://localhost:{port}/run/{run-id}
```

### Use Cases

| 상황 | 추천 모드 |
|------|----------|
| 로컬 개발 | TUI (빠른 피드백) |
| 원격 서버 | Web (SSH 포워딩) |
| 팀 협업 | Web (공유 URL) |
| CI/CD | Neither (headless) |

### Output

**TUI Mode:**
```
🖥️  Opening TUI dashboard...
Run: run-2024-01-26-143022

[TUI 화면 표시]
```

**Web Mode:**
```
🌐 Opening web dashboard...
Run: run-2024-01-26-143022
URL: http://localhost:3873/run/run-2024-01-26-143022

✓ Browser opened
```

## dure status

Check the status of the currently running Run.

### Basic Usage

```bash
dure status [options]
```

### Options

| Option | Short Form | Default | Description |
|--------|------------|---------|-------------|
| `--json` | - | false | Output in JSON format |
| `--watch` | `-w` | false | Real-time monitoring (refresh every second) |

### Examples

```bash
# Check current status
dure status

# JSON format
dure status --json

# Real-time monitoring
dure status --watch
```

### Output (Normal)

```
Current Run: run-20240126-143022
Phase: build (iteration 1/3)
Status: running
Started: 2024-01-26 14:30:22 (5 minutes ago)

Agents:
  ✓ Refiner    completed  (35s)   $0.002
  ● Builder    running    (2:15)  $0.058
  ○ Verifier   pending
  ○ Gatekeeper pending

Usage:
  Input tokens:  17,400
  Output tokens: 5,000
  Total cost:    $0.060

Pending CRP: None
```

### Output (JSON)

```json
{
  "run_id": "run-20240126-143022",
  "phase": "build",
  "iteration": 1,
  "max_iterations": 3,
  "status": "running",
  "started_at": "2024-01-26T14:30:22Z",
  "elapsed_ms": 300000,
  "agents": {
    "refiner": {
      "status": "completed",
      "duration_ms": 35000,
      "cost_usd": 0.002
    },
    "builder": {
      "status": "running",
      "elapsed_ms": 135000,
      "cost_usd": 0.058
    },
    "verifier": {
      "status": "pending"
    },
    "gatekeeper": {
      "status": "pending"
    }
  },
  "usage": {
    "total_input_tokens": 17400,
    "total_output_tokens": 5000,
    "total_cost_usd": 0.060
  },
  "pending_crp": null
}
```

### Output (No Run)

```
No active run

Use 'dure start' to begin
```

## dure stop

Stop the currently running Run.

### Basic Usage

```bash
dure stop [options]
```

### Options

| Option | Short Form | Default | Description |
|--------|------------|---------|-------------|
| `--force` | `-f` | false | Force termination (without waiting for agent response) |

### Examples

```bash
# Normal termination
dure stop

# Force termination
dure stop --force
```

### Behavior

1. Send termination signal to currently running agent
2. Wait for agent completion (max 30 seconds)
3. Terminate tmux session
4. Stop web server

### Output

```
Stopping run-20240126-143022...

✓ Builder stopped
✓ Tmux session killed
✓ Web server stopped

Run stopped successfully
```

## dure history

View past Run list.

### Basic Usage

```bash
dure history [options]
```

### Options

| Option | Short Form | Default | Description |
|--------|------------|---------|-------------|
| `--limit <number>` | `-n` | 10 | Number of Runs to display |
| `--filter <status>` | - | all | Filter (all/pass/fail/running) |
| `--json` | - | false | JSON format output |

### Examples

```bash
# Recent 10 Runs
dure history

# Recent 20 Runs
dure history --limit 20

# Show only PASS
dure history --filter pass

# Show only FAIL
dure history --filter fail

# JSON format
dure history --json
```

### Output

```
Recent Runs:

run-20240126-150000  ✓ PASS   $0.124  10 min ago   "Add rate limiter"
run-20240126-143022  ✓ PASS   $0.095  2 hours ago  "Refactor UserService"
run-20240126-120000  ✗ FAIL   $0.082  5 hours ago  "Add authentication"
run-20240125-180000  ● RUN    $0.050  running      "Fix bug in API"
run-20240125-150000  ✓ PASS   $0.145  1 day ago    "Add user API"

Total: 5 runs
```

### Output (JSON)

```json
{
  "runs": [
    {
      "run_id": "run-20240126-150000",
      "status": "completed",
      "verdict": "PASS",
      "cost_usd": 0.124,
      "started_at": "2024-01-26T15:00:00Z",
      "completed_at": "2024-01-26T15:10:00Z",
      "duration_ms": 600000,
      "briefing_title": "Add rate limiter"
    },
    ...
  ],
  "total": 5
}
```

## dure logs

View Run logs in real-time.

### Basic Usage

```bash
dure logs [run_id] [options]
```

### Options

| Option | Short Form | Default | Description |
|--------|------------|---------|-------------|
| `--follow` | `-f` | false | Follow logs in real-time (tail -f) |
| `--agent <name>` | `-a` | all | Show only specific agent logs |
| `--lines <number>` | `-n` | 100 | Number of lines to display |

### Examples

```bash
# Current Run logs
dure logs

# Specific Run logs
dure logs run-20240126-143022

# Real-time follow
dure logs --follow

# Builder logs only
dure logs --agent builder

# Recent 50 lines
dure logs --lines 50
```

### Output

```
=== Events Log (run-20240126-143022) ===

2024-01-26T14:30:22Z [INFO] run.started run_id=run-20240126-143022
2024-01-26T14:30:25Z [INFO] agent.started agent=refiner
2024-01-26T14:31:00Z [INFO] agent.completed agent=refiner duration_ms=35000
2024-01-26T14:31:00Z [INFO] phase.changed from=refine to=build
2024-01-26T14:31:05Z [INFO] agent.started agent=builder
2024-01-26T14:32:30Z [INFO] usage.updated agent=builder input=15300 output=4200
...
```

## dure clean

Clean up old Runs.

### Basic Usage

```bash
dure clean [options]
```

### Options

| Option | Short Form | Default | Description |
|--------|------------|---------|-------------|
| `--days <number>` | `-d` | 30 | Delete Runs older than N days |
| `--status <status>` | - | - | Delete only specific status (fail/pass) |
| `--dry-run` | - | false | Show list only without actual deletion |
| `--force` | `-f` | false | Delete without confirmation |

### Examples

```bash
# Delete Runs older than 30 days (interactive)
dure clean

# Delete Runs older than 7 days
dure clean --days 7

# Delete only FAIL Runs
dure clean --status fail

# Dry run (no actual deletion)
dure clean --dry-run

# Delete without confirmation
dure clean --force
```

### Output

```
Runs to be deleted:

run-20240101-120000  FAIL  30 days ago  1.2 MB
run-20240105-150000  FAIL  25 days ago  850 KB
run-20240110-180000  PASS  20 days ago  1.5 MB

Total: 3 runs (3.5 MB)

Delete these runs? (y/N):
```

## dure delete

Delete a specific Run.

### Basic Usage

```bash
dure delete <run_id> [options]
```

### Options

| Option | Short Form | Default | Description |
|--------|------------|---------|-------------|
| `--force` | `-f` | false | Delete without confirmation |

### Examples

```bash
# Delete specific Run
dure delete run-20240126-143022

# Delete without confirmation
dure delete run-20240126-143022 --force
```

### Output

```
Run: run-20240126-143022
Status: PASS
Size: 1.2 MB

Delete this run? (y/N):
```

## dure config

View or modify settings.

### Basic Usage

```bash
dure config [command] [options]
```

### Subcommands

#### show

View settings:

```bash
# All settings
dure config show

# Specific agent settings
dure config show refiner
dure config show builder

# JSON format
dure config show --json
```

#### set

Change settings:

```bash
# Global settings
dure config set global.max_iterations 5

# Change agent model
dure config set builder.model opus

# Change timeout
dure config set global.timeouts.builder 900000
```

#### reset

Reset settings:

```bash
# Reset all
dure config reset

# Reset specific agent only
dure config reset builder
```

## dure version

View version information:

```bash
dure version
# dure v0.1.0
```

Or:

```bash
dure --version
# dure v0.1.0
```

## dure help

View help:

```bash
# All commands list
dure help

# Specific command help
dure help start
dure help status
```

## Environment Variables

Dure supports the following environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DURE_PORT` | Web server port | 3873 |
| `DURE_LOG_LEVEL` | Log level | info |
| `DURE_CONFIG_DIR` | Configuration directory | .dure/config |

Example:

```bash
DURE_PORT=3001 dure start
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error |
| 3 | tmux error |
| 4 | Web server error |

## Next Steps

- [Configuration Files](/api/configuration.md) - Configuration file details
- [Web API](/api/web-api.md) - HTTP API endpoints
- [Troubleshooting](/guide/troubleshooting.md) - CLI troubleshooting
