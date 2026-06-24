# ADR-0003: Hybrid issue backend — local per-item files as source of truth

- Status: Accepted
- Date: 2026-06-24
- Deciders: project owner
- Related: spec §2 (D5), §5; critique C6

## Context

dure must create and track milestones/epics/issues for "any codebase" (ADR-0002). Binding the
issue tracker to GitHub would exclude offline, private, or non-GitHub projects. A single
`roadmap.md` file is easy to read but makes stable IDs and idempotent sync hard.

## Decision

The issue backend MUST be hybrid and **local-first**. Per-item markdown files at
`.dure/roadmap/{milestones,epics,issues}/<id>.md` are the **source of truth**; each carries a
stable `id`. `roadmap/index.md` is a **generated** summary and is NOT the source of truth.
GitHub is a mirror synchronized on demand (see ADR-0006). dure MUST function fully with no
GitHub connection.

## Consequences

- Stable IDs enable idempotent GitHub sync and granular diffs/conflict detection.
- Slightly more files than a single roadmap document.
- The generated index can drift if hand-edited; it MUST be treated as derived output only.
