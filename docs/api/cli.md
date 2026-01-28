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

Starts Dure.

### Basic Usage

```bash
dure start [options]
```

### Options

| Option | Short Form | Default | Description |
|--------|------------|---------|-------------|
| `--port <number>` | `-p` | 3000 | Web server port |
| `--no-browser` | - | false | Disable automatic browser opening |
| `--config <path>` | `-c` | `.dure/config` | Configuration file path |
| `--log-level <level>` | `-l` | `info` | Log level (debug/info/warn/error) |

### Examples

```bash
# Default execution
dure start

# Change port
dure start --port 3001

# Disable automatic browser opening
dure start --no-browser

# Debug logs
dure start --log-level debug

# Combined
dure start -p 3001 --no-browser
```

### Behavior

1. Create `.dure/` folder if it doesn't exist
2. Create configuration files with defaults if they don't exist
3. Create tmux session (pane structure)
4. Start web server (port 3000)
5. Open browser (depending on options)

### Output

```
🎼 Dure starting...

✓ Configuration initialized
✓ Tmux session created (dure-run-20240126-143022)
✓ Web server started at http://localhost:3000

Opening browser...

Press Ctrl+C to stop
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
| `DURE_PORT` | Web server port | 3000 |
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
