# Monitoring Dashboard Guide

Dure provides two interfaces for monitoring execution progress in real-time.

## Introduction

When you run a Dure task, you can monitor agent progress through:

| Interface | Location | Use Case |
|-----------|----------|----------|
| **TUI Dashboard** | Terminal | Local development (default) |
| **Web Dashboard** | Browser | Remote access, team sharing |

Both interfaces consume the same data from `DashboardDataProvider` and show real-time updates.

---

## TUI Dashboard

The TUI (Terminal User Interface) is the default monitoring interface, built with Ink (React for CLI).

### Starting the TUI

```bash
# Default: Start Dure with TUI
dure start

# Monitor latest run
dure monitor

# Monitor specific run
dure monitor run-2024-01-29-143022
```

### TUI Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Dure Dashboard              run-2024-01-29-143022           │
│ Stage: BUILD                Tokens: 12.5k    Cost: $0.045   │
├─────────────────────────────────────────────────────────────┤
│  [1] Refiner   ✓ Done                                       │
│  [2] Builder   ● Running (45%)                              │
│  [3] Verifier  ○ Pending                                    │
│  [4] Gatekeeper ○ Pending                                   │
├─────────────────────────────────────────────────────────────┤
│ Output: Builder                                             │
│ ─────────────────────────────────────────────────────────── │
│ > Reading refined.md...                                     │
│ > Creating src/features/rate-limiter.ts                     │
│ > Implementing middleware logic...                          │
│ > Running type check...                                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│ Progress: ████████████░░░░░░░░░░░░░░░░░░░░░░░░ 45%          │
├─────────────────────────────────────────────────────────────┤
│ [1-4] Switch agent  [q] Quit  [d] Detach                    │
└─────────────────────────────────────────────────────────────┘
```

**Layout Components:**

1. **Header** - Run ID, current stage, token usage, and cost
2. **Agent Panel** - Status of all four agents with visual indicators
3. **Output View** - Real-time output from the selected agent
4. **Progress Bar** - Overall execution progress
5. **Status Bar** - Available keyboard shortcuts

### Keyboard Shortcuts

| Key | Action | Description |
|-----|--------|-------------|
| `1` | Select Refiner | View Refiner agent output |
| `2` | Select Builder | View Builder agent output |
| `3` | Select Verifier | View Verifier agent output |
| `4` | Select Gatekeeper | View Gatekeeper agent output |
| `r` | Rerun | Manually rerun a failed agent |
| `q` | Quit | Exit TUI (execution continues in background) |
| `d` | Detach | Same as quit - detach from TUI |
| `Escape` | Close modal | Close CRP response modal |

?> The TUI automatically switches to the currently running agent.

### Agent Status Indicators

| Symbol | Status | Meaning |
|--------|--------|---------|
| `○` | Pending | Agent has not started yet |
| `●` | Running | Agent is currently executing |
| `✓` | Done | Agent completed successfully |
| `✗` | Error | Agent encountered an error |

### CRP Handling in TUI

When an agent requests human judgment (CRP), the TUI displays a modal prompt:

```
┌─────────────────────────────────────────────────────────────┐
│ CRP: Human Judgment Required                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Question: Which authentication method should we use?        │
│                                                             │
│ Options:                                                    │
│   [A] JWT tokens (stateless, scalable)                      │
│   [B] Session cookies (traditional, simple)                 │
│                                                             │
│ Recommendation: A                                           │
│                                                             │
│ Your choice: _                                              │
│                                                             │
│ [Enter] Submit  [Escape] Cancel                             │
└─────────────────────────────────────────────────────────────┘
```

Type your choice and press Enter to submit.

---

## Web Dashboard

The Web Dashboard provides a browser-based interface for monitoring.

### Starting Web Dashboard

```bash
# Start with web dashboard mode
dure start --web

# Monitor with web dashboard
dure monitor --web

# Custom port
dure monitor --web --port 3001

# Or run the server separately
dure server
```

### Features

- **Real-time Updates** - Live updates via Socket.io
- **CRP Response Form** - Respond to human judgment requests via web form
- **History View** - Browse past run history
- **Multi-user** - Multiple team members can view the same run

### Dashboard URL

Default URL: `http://localhost:3873`

For specific runs: `http://localhost:3873/run/{run-id}`

---

## Choosing Between TUI and Web

| Scenario | Recommended | Reason |
|----------|-------------|--------|
| Local development | TUI | Fast feedback, no browser needed |
| Remote server (SSH) | Web | SSH port forwarding, persistent view |
| Team collaboration | Web | Shareable URL |
| CI/CD | Neither | Use headless mode (`--no-tui`) |
| Quick debugging | TUI | Direct terminal output |
| Long-running tasks | Web | Can close terminal, reconnect later |

### Headless Mode

For CI/CD or automated scripts, run without any dashboard:

```bash
# Run without TUI (headless)
dure start --attach   # Just starts server, exits immediately
```

You can monitor later:

```bash
# Reconnect with TUI
dure monitor

# Or with web
dure monitor --web
```

---

## Advanced Features

### Detached Execution

Start a run and detach immediately:

```bash
# Start, then press 'q' to detach
dure start
# Press 'q' to quit TUI

# Later, reconnect
dure monitor
```

The agents continue running in the tmux session.

### Switching Between Interfaces

You can switch between TUI and Web at any time:

```bash
# Started with TUI, want web
# Press 'q' to exit TUI
dure monitor --web

# Started with web, want TUI
dure monitor
```

### Direct tmux Access

For advanced debugging, attach to the raw tmux session:

```bash
dure start --attach
```

Or manually:

```bash
tmux attach-session -t dure-{session-name}
```

**tmux Pane Layout:**

```
┌──────────┬──────────┬──────────┬──────────┐
│ Refiner  │ Builder  │ Verifier │Gatekeeper│
│ (pane 0) │ (pane 1) │ (pane 2) │ (pane 3) │
├──────────┴──────────┴──────────┴──────────┤
│              Debug Shell (pane 4)          │
├────────────────────────────────────────────┤
│              Server (pane 5)               │
└────────────────────────────────────────────┘
```

**tmux Shortcuts:**
- `Ctrl-b` + arrow keys: Move between panes
- `Ctrl-b` + `d`: Detach from session
- `Ctrl-b` + `q`: Show pane numbers

---

## Troubleshooting

### TUI Not Displaying

**Cause:** Terminal is not a TTY (e.g., piped output, CI environment)

**Solution:** Use `--web` or `--attach` instead:

```bash
dure start --web
```

### TUI Display Corrupted

**Cause:** Terminal window too small

**Solution:** Resize terminal window or use web dashboard

### Cannot Connect to Web Dashboard

**Cause:** Server not running or port conflict

**Solution:**

```bash
# Check if server is running
curl http://localhost:3873/health

# Try different port
dure start --web --port 3001
```

---

## Related Documents

- [Dashboard System Architecture](/architecture/dashboard-system.md) - Technical implementation details
- [Getting Started](/guide/getting-started.md) - First-time setup guide
- [Troubleshooting](/guide/troubleshooting.md) - Common issues and solutions
- [CLI Reference](/api/cli.md) - Complete CLI documentation
