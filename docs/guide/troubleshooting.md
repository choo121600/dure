# Troubleshooting

Problems that may occur while using Dure and their solutions.

## Installation and Execution Issues

### "tmux is not installed"

**Symptom:**

```bash
Error: tmux is not installed
```

**Solution:**

<!-- tabs:start -->

#### **macOS**

```bash
brew install tmux
```

#### **Ubuntu/Debian**

```bash
sudo apt-get install tmux
```

#### **CentOS/RHEL**

```bash
sudo yum install tmux
```

<!-- tabs:end -->

### "claude command not found"

**Symptom:**

```bash
Error: claude command not found
Please install Claude CLI first
```

**Solution:**

1. Check if Claude CLI is installed:

```bash
which claude
```

2. If not found, install: [Claude CLI official documentation](https://docs.anthropic.com/claude/docs/claude-cli)

3. Check PATH:

```bash
echo $PATH | grep -o '/usr/local/bin'
```

### "Port 3873 is already in use"

**Symptom:**

```bash
Error: Port 3873 is already in use
```

**Solution:**

Start on a different port:

```bash
dure start --port 3001
```

Or terminate the process using port 3873:

```bash
# macOS/Linux
lsof -ti:3873 | xargs kill

# Or force terminate
lsof -ti:3873 | xargs kill -9
```

## Agent Execution Issues

### Agent Not Starting

**Symptom:**

Agent remains in `pending` state on dashboard

**Diagnosis:**

1. Check tmux session:

```bash
tmux list-sessions | grep dure
```

2. Attach to tmux session to check errors:

```bash
tmux attach-session -t dure-run-{timestamp}
```

3. Check agent pane:
   - Refiner: pane 0
   - Builder: pane 1
   - Verifier: pane 2
   - Gatekeeper: pane 3

**Solution:**

Usually a Claude CLI permission issue:

```bash
# Stop run
dure stop

# Restart
dure start
```

### Agent Stuck (timeout)

**Symptom:**

Agent remains in `running` state for a long time

**Default Timeouts:**

| Agent | Timeout |
|-------|---------|
| Refiner | 5 min |
| Builder | 10 min |
| Verifier | 5 min |
| Gatekeeper | 5 min |

**Diagnosis:**

1. Check elapsed time on dashboard
2. Attach to tmux session to check agent output:

```bash
tmux attach-session -t dure-run-{timestamp}
```

3. Check processes in pane 4 (Debug Shell):

```bash
# Move to pane 4 (Ctrl-b + arrow keys)
ps aux | grep claude
```

**Solution:**

**Option 1: Extend Timeout**

Click "Extend Timeout" on dashboard or:

```bash
# Modify .dure/config/global.json
{
  "timeouts": {
    "builder": 1200000  // 20 min
  }
}
```

**Option 2: Restart**

Click "Retry Agent" on dashboard or:

```bash
dure stop
dure start
```

### Agent Crash

**Symptom:**

Agent status changes to `failed`

**Diagnosis:**

1. Check error.flag:

```bash
cat .dure/runs/{run_id}/{agent}/error.flag
```

Example output:

```json
{
  "agent": "builder",
  "error_type": "crash",
  "message": "Unexpected token in JSON",
  "stack": "...",
  "recoverable": true
}
```

2. Check agent log:

```bash
cat .dure/runs/{run_id}/{agent}/log.md
```

**Solution:**

**Auto Retry:**

If `config.global.auto_retry.enabled: true`, it automatically retries up to 2 times.

**Manual Retry:**

Click "Retry Agent" on dashboard

**Root Cause Resolution:**

- **Out of memory**: Change model to Haiku
- **Permission error**: Check file permissions
- **JSON parsing error**: Check Briefing format

## CRP Related Issues

### CRP Generated Too Frequently

**Symptom:**

Refiner keeps generating CRPs and progress stalls

**Cause:**

Briefing contains ambiguous expressions

**Solution:**

Modify the following expressions in Briefing to be specific:

| Ambiguous Expression | Specific Alternative |
|---------------------|---------------------|
| "appropriately" | "60/minute" |
| "appropriate" | "8 characters or more" |
| "quickly" | "within 100ms" |

See [Briefing Writing Guide](/guide/writing-briefings.md)

### Agent Doesn't Restart After CRP Response

**Symptom:**

Agent remains in `waiting_human` state after writing VCR

**Diagnosis:**

1. Check VCR file:

```bash
ls -la .dure/runs/{run_id}/vcr/
```

2. Check VCR format:

```bash
cat .dure/runs/{run_id}/vcr/vcr-001.json
```

**Solution:**

Verify VCR file has correct format:

```json
{
  "vcr_id": "vcr-001",
  "crp_id": "crp-001",
  "decision": "A",
  "rationale": "reason",
  "applies_to_future": true
}
```

Resubmit from web UI or:

```bash
# Manually restart agent
tmux send-keys -t dure-run-{timestamp}:main.0 "/clear" Enter
```

## MRP Review Issues

### MRP Not Generated

**Symptom:**

Gatekeeper completed but no MRP

**Cause:**

Gatekeeper gave FAIL or NEEDS_HUMAN judgment

**Diagnosis:**

1. Check verdict.json:

```bash
cat .dure/runs/{run_id}/gatekeeper/verdict.json
```

2. Check review.md:

```bash
cat .dure/runs/{run_id}/gatekeeper/review.md
```

**Solution:**

**If FAIL:**

- Builder will automatically retry
- Manual intervention needed if `max_iterations` exceeded

**If NEEDS_HUMAN:**

- Respond to the CRP

### Code Not Applied to Project

**Symptom:**

Approved MRP but code is missing

**Cause:**

Dure does not automatically merge

**Solution:**

Manually apply MRP code to project:

```bash
# Check MRP code
ls .dure/runs/{run_id}/mrp/code/

# Copy
cp -r .dure/runs/{run_id}/mrp/code/* .
```

Or check Git diff:

```bash
diff -r .dure/runs/{run_id}/mrp/code/ .
```

?> Auto-merge feature planned for future versions

## Performance Issues

### Execution Too Slow

**Symptom:**

Each agent takes more than 5 minutes

**Cause:**

1. Large codebase
2. Using Opus model
3. Complex Briefing

**Solution:**

**1. Downgrade Model**

```bash
# .dure/config/builder.json
{
  "model": "haiku"  # Changed from sonnet
}
```

| Model | Speed | Quality | Cost |
|-------|-------|---------|------|
| Haiku | ⚡⚡⚡ | ⭐⭐ | 💰 |
| Sonnet | ⚡⚡ | ⭐⭐⭐ | 💰💰 |
| Opus | ⚡ | ⭐⭐⭐⭐ | 💰💰💰 |

**2. Simplify Briefing**

Split complex requirements into multiple Runs

**3. Shorten Timeout**

```json
// .dure/config/global.json
{
  "timeouts": {
    "refiner": 180000,  // 3 min
    "builder": 300000   // 5 min
  }
}
```

### Cost Too High

**Symptom:**

More than $1 per Run

**Diagnosis:**

Check Usage on dashboard:

```
Usage (this run):
  Refiner:    $0.001
  Builder:    $0.850  ← High
  Verifier:   $0.050
  Gatekeeper: $0.100
```

**Solution:**

**1. Optimize Models**

Only Builder uses Sonnet, others use Haiku:

```json
// builder.json
{ "model": "sonnet" }

// refiner.json, verifier.json, gatekeeper.json
{ "model": "haiku" }
```

**2. Limit Iterations**

```json
// global.json
{ "max_iterations": 2 }  // Reduced from default 3
```

**3. Improve Briefing Quality**

Clear Briefing → Fewer retries → Cost savings

## Filesystem Issues

### ".dure folder not found"

**Symptom:**

```bash
Error: .dure directory not found
```

**Cause:**

Running from wrong directory

**Solution:**

Run from project root:

```bash
cd /path/to/your-project
dure start
```

### "Permission denied"

**Symptom:**

```bash
Error: EACCES: permission denied, mkdir '.dure'
```

**Solution:**

Check directory permissions:

```bash
ls -la

# If no write permission
chmod u+w .
```

### Disk Space Insufficient

**Symptom:**

```bash
Error: ENOSPC: no space left on device
```

**Solution:**

Delete old Runs:

```bash
# Delete Runs older than 30 days
find .dure/runs -name "run-*" -mtime +30 -exec rm -rf {} \;

# Or manually
rm -rf .dure/runs/run-20240101-*
```

## tmux Issues

### Cannot Attach to tmux Session

**Symptom:**

```bash
tmux attach-session -t dure-run-{timestamp}
# error: no sessions
```

**Solution:**

1. Check session list:

```bash
tmux list-sessions
```

2. Use exact session name:

```bash
tmux list-sessions | grep dure
# dure-run-20240126-143022: 6 windows

tmux attach-session -t dure-run-20240126-143022
```

### Moving Between tmux Panes

Move between panes within tmux session:

```bash
# Prefix key: Ctrl-b

Ctrl-b + arrow keys    # Move pane
Ctrl-b + o            # Next pane
Ctrl-b + q            # Show pane numbers
Ctrl-b + q + number   # Move to specific pane
Ctrl-b + d            # Detach from session
```

### tmux Session Remains

**Symptom:**

tmux session remains after `dure stop`

**Solution:**

Manually terminate session:

```bash
tmux kill-session -t dure-run-{timestamp}

# Terminate all dure sessions
tmux list-sessions | grep dure | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
```

## Debugging Tips

### Check Logs

All events are recorded in `events.log`:

```bash
tail -f .dure/runs/{run_id}/events.log
```

Example output:

```
2024-01-26T14:30:22Z [INFO] run.started run_id=run-20240126-143022
2024-01-26T14:30:25Z [INFO] agent.started agent=refiner
2024-01-26T14:31:00Z [INFO] agent.completed agent=refiner duration_ms=35000
2024-01-26T14:31:05Z [INFO] agent.started agent=builder
2024-01-26T14:35:00Z [ERROR] agent.failed agent=builder error_type=crash
```

### Use Debug Shell

tmux pane 4 is the Debug Shell:

```bash
# Attach to tmux session
tmux attach-session -t dure-run-{timestamp}

# Move to pane 4 (Ctrl-b + q + 4)

# Check status
cat .dure/runs/{run_id}/state.json

# Check files
ls -la .dure/runs/{run_id}/builder/
cat .dure/runs/{run_id}/builder/log.md

# Check processes
ps aux | grep claude
```

### Verbose Logs

For more detailed logs:

```json
// .dure/config/global.json
{
  "log_level": "debug"  // Changed from "info"
}
```

## Getting Help

If the above methods don't resolve the issue:

1. **Create GitHub Issue**
   - https://github.com/choo121600/dure/issues
   - Include the following information:
     - Error message
     - `events.log` content
     - `state.json` content
     - Execution environment (OS, Node version, tmux version)

2. **Collect Debug Information**

```bash
# Environment info
node --version
tmux -V
claude --version

# Dure version
dure --version

# Collect logs
tar -czf debug-logs.tar.gz .dure/runs/{run_id}/
```

## Next Steps

- [Advanced Debugging](/advanced/debugging.md) - Detailed debugging techniques
- [FAQ](/misc/faq.md) - Frequently asked questions
- [GitHub Issues](https://github.com/choo121600/dure/issues) - Known issues
