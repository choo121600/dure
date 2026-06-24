# ADR-0001: Deliver dure as an in-process Claude Code plugin

- Status: Accepted
- Date: 2026-06-24
- Deciders: project owner
- Related: spec §2 (D1, D3, D4), §3.1; critique C1

## Context

dure is a standalone project (not built on or dependent on odin-loop). The agent "brain" is
Claude Code. An early framing called the engine a "Claude Code CLI wrapper" while also choosing
a "plugin" interface — these contradict: a plugin runs *inside* a Claude Code session, whereas a
wrapper would spawn `claude` as a subprocess and orchestrate it from outside. A deep, interactive
interview maps naturally onto Claude Code's existing conversation loop and UI.

## Decision

For v1, dure MUST be delivered as an **in-process Claude Code plugin** (skills + subagents +
hooks + small deterministic scripts). "Claude Code as the brain" replaces the "CLI wrapper"
framing. The core methodology logic MUST be kept separable from the interface so it can later be
re-hosted behind a subprocess wrapper or a standalone TUI (see M4) without a rewrite.

## Consequences

- Fastest path to a working PM loop; reuses Claude Code's conversation/UI primitives.
- Bounded by Claude Code's UI primitives (no custom full-screen dashboards until M4).
- The "engine" is prompt/skill instructions + subagent orchestration + file state, not a
  standalone executable (see ADR-0004, ADR-0005).
