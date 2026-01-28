# File Structure

Detailed description of Dure's folder and file structure.

## Overall Structure

```
your-project/
├── src/                    # Project source code
├── package.json
├── .gitignore
│
└── .dure/            # Dure working directory
    ├── config/             # Configuration files
    │   ├── global.json
    │   ├── refiner.json
    │   ├── builder.json
    │   ├── verifier.json
    │   └── gatekeeper.json
    │
    └── runs/               # Execution records
        └── run-{timestamp}/
            ├── state.json
            ├── events.log
            ├── briefing/
            ├── builder/
            ├── verifier/
            ├── gatekeeper/
            ├── crp/
            ├── vcr/
            ├── mrp/
            └── prompts/
```

## .dure/config/

Configuration files are stored here. Automatically created on `dure start`.

### global.json

Global settings:

```json
{
  "max_iterations": 3,
  "tmux_session_prefix": "dure",
  "web_port": 3000,
  "log_level": "info",
  "timeouts": {
    "refiner": 300000,
    "builder": 600000,
    "verifier": 300000,
    "gatekeeper": 300000
  },
  "timeout_action": "warn",
  "notifications": {
    "terminal_bell": true,
    "system_notify": false
  },
  "auto_retry": {
    "enabled": true,
    "max_attempts": 2,
    "recoverable_errors": ["crash", "timeout", "validation"]
  }
}
```

### refiner.json, builder.json, verifier.json, gatekeeper.json

Settings for each agent. See [Configuration Files](/api/configuration.md) for details.

## .dure/runs/

All Run execution records are stored here.

### Run Directory Naming Convention

```
run-{timestamp}

Examples:
run-20240126-143022
run-20240126-150000
```

Timestamp format: `YYYYMMDD-HHMMSS` (UTC)

## Run Directory Structure

```
run-{timestamp}/
├── state.json              # Current state (always exists)
├── events.log              # Event log (always exists)
│
├── briefing/               # Briefing related (Phase 0)
│   ├── raw.md
│   ├── refined.md
│   ├── clarifications.json
│   └── log.md
│
├── builder/                # Builder related (Phase 1)
│   ├── output/
│   │   └── files.json
│   ├── log.md
│   ├── done.flag
│   └── error.flag          (only on error)
│
├── verifier/               # Verifier related (Phase 2)
│   ├── tests/
│   │   └── *.test.ts
│   ├── results.json
│   ├── log.md
│   ├── done.flag
│   └── error.flag          (only on error)
│
├── gatekeeper/             # Gatekeeper related (Phase 3)
│   ├── review.md
│   ├── verdict.json
│   └── log.md
│
├── crp/                    # Consultation Request Pack
│   ├── crp-001.json
│   ├── crp-002.json
│   └── ...
│
├── vcr/                    # Version Controlled Resolution
│   ├── vcr-001.json
│   ├── vcr-002.json
│   └── ...
│
├── mrp/                    # Merge-Readiness Pack (on PASS)
│   ├── summary.md
│   ├── code/
│   │   └── ...
│   ├── tests/
│   │   └── ...
│   └── evidence.json
│
└── prompts/                # Agent prompt files
    ├── refiner.md
    ├── builder.md
    ├── verifier.md
    └── gatekeeper.md
```

## Key File Descriptions

### state.json

**Location:** `.dure/runs/{run_id}/state.json`

**Purpose:** Store the current state of the Run

**Structure:**

```json
{
  "run_id": "run-20240126-143022",
  "phase": "build",
  "iteration": 1,
  "max_iterations": 3,
  "started_at": "2024-01-26T14:30:22Z",
  "updated_at": "2024-01-26T14:32:15Z",
  "agents": {
    "refiner": {
      "status": "completed",
      "started_at": "2024-01-26T14:30:25Z",
      "completed_at": "2024-01-26T14:31:00Z",
      "error": null,
      "usage": {
        "input_tokens": 2100,
        "output_tokens": 800,
        "cost_usd": 0.002
      }
    },
    "builder": {
      "status": "running",
      "started_at": "2024-01-26T14:31:05Z",
      "completed_at": null,
      "error": null,
      "timeout_at": "2024-01-26T14:41:05Z",
      "usage": null
    }
  },
  "usage": {
    "total_input_tokens": 2100,
    "total_output_tokens": 800,
    "total_cost_usd": 0.002
  },
  "pending_crp": null,
  "errors": [],
  "history": [
    {
      "phase": "refine",
      "result": "completed",
      "timestamp": "2024-01-26T14:31:00Z",
      "duration_ms": 35000
    }
  ]
}
```

**Update Timing:**
- On agent start/completion
- On phase transition
- On CRP/VCR creation
- On error occurrence

### events.log

**Location:** `.dure/runs/{run_id}/events.log`

**Purpose:** Record all events in chronological order

**Format:** One event per line

```
2024-01-26T14:30:22Z [INFO] run.started run_id=run-20240126-143022
2024-01-26T14:30:25Z [INFO] agent.started agent=refiner
2024-01-26T14:31:00Z [INFO] agent.completed agent=refiner duration_ms=35000
2024-01-26T14:31:00Z [INFO] phase.changed from=refine to=build
2024-01-26T14:31:05Z [INFO] agent.started agent=builder
2024-01-26T14:35:00Z [ERROR] agent.failed agent=builder error_type=crash message="Unexpected token"
2024-01-26T14:35:00Z [INFO] agent.retry agent=builder attempt=1
```

**Log Levels:**
- `INFO` - General events
- `WARN` - Warnings (timeouts, etc.)
- `ERROR` - Errors

### briefing/raw.md

**Location:** `.dure/runs/{run_id}/briefing/raw.md`

**Purpose:** Original Briefing written by human

**Creation Time:** At Run start (content submitted from web UI)

**Example:**

```markdown
# Rate Limiter Middleware Implementation

## Requirements
- Implement as Express.js middleware
- IP-based request limiting
- Limit to 60 requests per minute
```

### briefing/refined.md

**Location:** `.dure/runs/{run_id}/briefing/refined.md`

**Purpose:** Briefing reviewed/improved by Refiner

**Creation Time:** On Refiner completion

**Differences:**
- Ambiguous expressions → specific values
- Added missing constraints
- Clarified requirements

### done.flag

**Location:**
- `.dure/runs/{run_id}/builder/done.flag`
- `.dure/runs/{run_id}/verifier/done.flag`

**Purpose:** Agent completion signal

**Content:** Empty (file existence itself is the signal)

**Creation Time:** On agent task completion

**Detection Method:**

```typescript
// Detected by File Watcher
chokidar
  .watch('.dure/runs/{run_id}/builder/')
  .on('add', (path) => {
    if (path.endsWith('done.flag')) {
      orchestrator.startNextAgent();
    }
  });
```

### error.flag

**Location:** `.dure/runs/{run_id}/{agent}/error.flag`

**Purpose:** Agent error information

**Creation Time:** On agent execution failure

**Structure:**

```json
{
  "agent": "builder",
  "error_type": "crash",
  "message": "Unexpected token in JSON at position 123",
  "stack": "Error: Unexpected token...\n  at ...",
  "timestamp": "2024-01-26T14:35:00Z",
  "recoverable": true
}
```

### CRP Files

**Location:** `.dure/runs/{run_id}/crp/crp-{n}.json`

**Purpose:** Human judgment request

**Naming Convention:** `crp-001.json`, `crp-002.json`, ...

**Structure:** See [CRP Response Guide](/guide/responding-to-crp.md)

### VCR Files

**Location:** `.dure/runs/{run_id}/vcr/vcr-{n}.json`

**Purpose:** Human decision record

**Naming Convention:** `vcr-001.json` (response to corresponding `crp-001.json`)

**Structure:** See [CRP Response Guide](/guide/responding-to-crp.md)

### MRP Directory

**Location:** `.dure/runs/{run_id}/mrp/`

**Purpose:** Final deliverable package

**Creation Time:** On Gatekeeper PASS verdict

**Structure:** See [MRP Review Guide](/guide/reviewing-mrp.md)

## File Creation Order

### Normal Flow (Phase 0 → 3)

```
1. Run Start
   - state.json
   - events.log
   - briefing/raw.md
   - prompts/*.md

2. Refiner (Phase 0)
   - briefing/refined.md
   - briefing/clarifications.json
   - briefing/log.md

3. Builder (Phase 1)
   - builder/output/files.json
   - builder/log.md
   - builder/done.flag

4. Verifier (Phase 2)
   - verifier/tests/*.test.ts
   - verifier/results.json
   - verifier/log.md
   - verifier/done.flag

5. Gatekeeper (Phase 3)
   - gatekeeper/review.md
   - gatekeeper/verdict.json
   - gatekeeper/log.md
   - (if PASS) mrp/
```

### When CRP Occurs

```
1. Agent creates CRP
   - crp/crp-001.json
   - state.json updated (pending_crp: "crp-001")

2. Human responds
   - vcr/vcr-001.json
   - state.json updated (pending_crp: null)

3. Agent restarts
   - Existing log file overwritten
```

### On Retry (iteration)

```
1. Gatekeeper FAIL verdict
   - gatekeeper/verdict.json (verdict: "FAIL")
   - gatekeeper/review.md (feedback)

2. Builder restarts (iteration 2)
   - builder/log.md overwritten
   - builder/output/files.json overwritten
   - builder/done.flag recreated

3. Verifier re-runs
   - verifier/results.json overwritten
   - ...
```

## Disk Usage

### Expected Size

| Component | Size (average) |
|-----------|----------------|
| state.json | ~5 KB |
| events.log | ~10-50 KB |
| briefing/*.md | ~5-20 KB |
| builder/log.md | ~10-100 KB |
| verifier/tests/ | ~10-100 KB |
| MRP | ~50-500 KB |
| **Total per Run** | **~100 KB - 1 MB** |

### Cleanup Methods

Delete old Runs:

```bash
# Delete Runs older than 30 days
find .dure/runs -name "run-*" -mtime +30 -exec rm -rf {} \;

# Delete specific Run
rm -rf .dure/runs/run-20240126-143022

# Delete all failed Runs
for dir in .dure/runs/run-*; do
  verdict=$(jq -r '.verdict' "$dir/gatekeeper/verdict.json" 2>/dev/null)
  if [ "$verdict" = "FAIL" ]; then
    rm -rf "$dir"
  fi
done
```

## Git Management

### Recommended .gitignore Settings

```gitignore
# Dure - Ignore execution records
.dure/runs/

# Dure - Commit settings (share with team)
!.dure/config/
```

Or ignore everything:

```gitignore
# Dure
.dure/
```

### Preserving Execution Records

Archive important Runs separately:

```bash
# Archive specific Run
tar -czf run-20240126-143022.tar.gz \
  .dure/runs/run-20240126-143022

# Archive all PASS Runs
for dir in .dure/runs/run-*; do
  verdict=$(jq -r '.verdict' "$dir/gatekeeper/verdict.json" 2>/dev/null)
  if [ "$verdict" = "PASS" ]; then
    tar -czf "$(basename $dir).tar.gz" "$dir"
  fi
done
```

## Next Steps

- [Data Formats](/architecture/data-formats.md) - Detailed file format specifications
- [Execution Flow](/architecture/execution-flow.md) - File creation timing
- [Configuration Files](/api/configuration.md) - Config file details
