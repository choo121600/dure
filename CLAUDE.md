# Dure

> Named after the Korean tradition of "Dure" (cooperative farming),
> where villagers work together with distinct roles toward a shared goal.

> **Input your intent, four agents execute sequentially,
> and humans only review evidence and make decisions - an engineering system**

An **MVP** validation project for the "Agentic Software Engineering" paradigm.

## Core Principles

1. **Humans are decision nodes** - Decision makers, not workers
2. **Trajectory is a first-class artifact** - The path to the result matters more than the result itself
3. **Must be reproducible** - All executions are recorded in logs
4. **File-based coordination** - Inter-agent communication via filesystem

## Agents

| Agent | Role | Model |
|-------|------|-------|
| Refiner | Review and improve briefing | haiku |
| Builder | Code implementation | sonnet |
| Verifier | Test generation/execution, counterexample search | haiku |
| Gatekeeper | Code review, final verdict | sonnet |

## Execution Flow

```
REFINE → BUILD → VERIFY → GATE
                           │
         ├─ PASS → MRP (human review)
         ├─ FAIL → BUILD retry
         └─ NEEDS_HUMAN → CRP (human response)
```

## Tech Stack

- CLI: Node.js + Commander.js
- Web server: Express + Socket.io
- Agents: Claude Code CLI (headless)
- Process management: tmux
- State storage: JSON files

## Folder Structure

```
.dure/
├── config/          # Per-agent configuration
└── runs/
    └── run-{timestamp}/
        ├── state.json
        ├── briefing/    # raw.md, refined.md
        ├── builder/     # output/, done.flag
        ├── verifier/    # tests/, results.json
        ├── gatekeeper/  # verdict.json
        ├── crp/         # Human judgment requests
        ├── vcr/         # Human responses
        └── mrp/         # Final deliverables
```

## Detailed Documentation

| Document | Content |
|----------|---------|
| [docs/architecture.md](docs/architecture.md) | System architecture, execution flow, tmux configuration, agent execution spec |
| [docs/agents.md](docs/agents.md) | Detailed agent definitions, I/O, behavioral rules |
| [docs/data-formats.md](docs/data-formats.md) | state.json, CRP, VCR, MRP formats, config files |
| [docs/api.md](docs/api.md) | CLI commands, web server API, WebSocket events, notification system |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Implementation priorities, tech stack, success criteria |

## Implementation Locations

- CLI: `src/cli/`
- Core logic: `src/core/` (orchestrator, state-manager, tmux-manager, file-watcher)
- Agent prompts: `src/agents/prompt-generator.ts`
- Web server: `src/server/`
- Type definitions: `src/types/`
