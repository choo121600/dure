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
         ├─ MINOR_FAIL → Apply fix → VERIFY retry (max 2)
         ├─ FAIL → BUILD retry
         └─ NEEDS_HUMAN → CRP (human response)
```

## Tech Stack

- CLI: Node.js + Commander.js
- TUI: Ink (React for CLI)
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
| [docs/architecture/dashboard-system.md](docs/architecture/dashboard-system.md) | Dashboard data provider, TUI/Web architecture, event flow |
| [docs/agents.md](docs/agents.md) | Detailed agent definitions, I/O, behavioral rules |
| [docs/data-formats.md](docs/data-formats.md) | state.json, CRP, VCR, MRP formats, config files |
| [docs/api.md](docs/api.md) | CLI commands, web server API, WebSocket events, notification system |
| [docs/api/socket-events.md](docs/api/socket-events.md) | Socket.io event reference for dashboard |
| [docs/guide/monitoring-dashboard.md](docs/guide/monitoring-dashboard.md) | TUI and Web dashboard usage guide |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Implementation priorities, tech stack, success criteria |

## Implementation Locations

- CLI: `src/cli/`
  - Mission commands: `src/cli/commands/mission-*.ts`
- TUI: `src/tui/ink/`
  - Kanban board: `src/tui/ink/components/Kanban.tsx`
- Core logic: `src/core/`
  - Orchestrator: `src/core/orchestrator.ts`
  - Dashboard data: `src/core/dashboard-data-provider.ts`
  - State manager: `src/core/state-manager.ts`
  - Tmux manager: `src/core/tmux-manager.ts`
  - File watcher: `src/core/file-watcher.ts`
  - Mission manager: `src/core/mission-manager.ts`
  - Planning pipeline: `src/core/planning-pipeline.ts`
  - Kanban state: `src/core/kanban-state-manager.ts`
- Agent prompts: `src/agents/prompt-generator.ts`
- Web server: `src/server/`
  - Dashboard API: `src/server/dashboard/`
  - Mission API: `src/server/dashboard/mission-routes.ts`
- Type definitions: `src/types/`
  - Mission types: `src/types/mission.ts`

## Available Skills & Agents

Custom skills and agents generated for this project via `dure init --smart`.

### Skills
| Skill | When to Use |
|-------|-------------|
| /new-agent | Create a new Dure agent with typed state, event handlers, and test setup. Use when the user asks to add a new agent type, create a custom agent, or extend the agent pipeline with a new processing stage. |
| /new-command | Generate a new CLI command with Commander.js following existing patterns. Use when user asks to create a command, add CLI functionality, or implement a new dure subcommand. |
| /add-event | Add a new typed event to the orchestrator event system with factory and type guards. Use when user asks to add a new event type, create an event, or extend the event system with new event handling. |
| /new-manager | Create a new core manager class following Result<T,E> pattern with tests. Use when user asks to create a manager, add a core service class, or implement a new system component. |

### Agents
| Agent | Tier | Model | When to Use |
|-------|------|-------|-------------|
| reviewer | standard | sonnet | Reviews code changes for quality, patterns consistency, and Dure architecture alignment. Use proactively after code changes to verify correctness, security, and maintainability. |
| reviewer-quick | quick | haiku | Fast code review for simple changes and style checks. Use for quick sanity checks on small changes (< 100 lines), CI/CD automated checks, and style validation. |
| tester | standard | sonnet | Generates Vitest unit tests using project test helpers and patterns. Analyzes test failures and improves test coverage. Use when you need to write new tests, debug failing tests, or enhance test quality. |
| tester-quick | quick | haiku | Quickly generates basic tests for simple functions and runs quick test validation checks. Use for simple functions, quick sanity tests, and CI/CD checks. |
| security | standard | sonnet | Analyzes code for security vulnerabilities with focus on command injection, path traversal, and tmux safety. Use for security audits, pre-release checks, and security-critical code review. |
| refactorer | standard | sonnet | Refactors code to use Result<T,E> pattern, branded types, and typed events. Use proactively when reviewing or modifying core code that handles errors, IDs, or events. |
| documenter | standard | sonnet | Generates documentation for Dure components following docs/ structure. Use when adding new features, updating APIs, or improving documentation clarity. |

> Generated by `dure init --smart`. See `.claude/skills/` and `.claude/agents/` for complete documentation.
