# Dure - Roadmap

## Implementation Priorities (MVP)

### Phase 1: Core Structure

1. **CLI Basics** - `dure start` command
2. **Folder Structure Creation** - `.dure/` initialization
3. **state.json Management** - State read/write
4. **tmux Session Creation** - Basic layout

### Phase 2: Agent Execution

1. **Refiner Implementation** - Briefing processing
2. **Builder Implementation** - Code generation
3. **Verifier Implementation** - Test generation/execution
4. **Gatekeeper Implementation** - Verdict logic

### Phase 3: Web Server

1. **Basic Server** - Express-based
2. **Dashboard** - Status display
3. **CRP Page** - Human response collection
4. **MRP Page** - Result review

### Phase 4: Integration

1. **Real-time State Sync** - WebSocket
2. **Settings UI** - Agent configuration
3. **History** - Past run lookup

## Tech Stack

| Component | Technology |
|---------|------|
| CLI | Node.js + Commander.js |
| Web Server | Express + Socket.io |
| Frontend | Vanilla JS (MVP) |
| Agent Execution | Claude Code CLI (headless) |
| Process Management | tmux |
| State Storage | JSON files |

## Exclusions (Outside MVP Scope)

- Fancy UI
- Auto-merge
- Cost optimization
- Cloud deployment
- Multi-user support
- Git integration automation

## Success Criteria

1. `dure start` → Web server starts
2. Briefing input → 4 agents execute sequentially
3. When CRP occurs → Response possible via web
4. Final MRP generated → Human can review
5. Entire process is recorded in logs
6. On phase transition → Web UI updates in real-time
7. On error/timeout → Notification and recovery options provided
8. All events are recorded in events.log
9. Per-agent token usage and costs are displayed in real-time on dashboard
