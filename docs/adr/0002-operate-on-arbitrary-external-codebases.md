# ADR-0002: Operate on arbitrary external codebases

- Status: Accepted
- Date: 2026-06-24
- Deciders: project owner
- Related: spec §2 (D2)

## Context

dure is a tool that "attaches" to a project and acts as its PM. It must be usable from any
project folder, not tied to one specific repository or dure's own source tree.

## Decision

dure MUST be target-agnostic: running it from any directory makes dure the PM for *that*
project. All project state MUST live in a `.dure/` directory within the target repo. dure MUST
NOT assume a specific language, framework, or that the target is even a git repository.

## Consequences

- Maximizes reach; dure works on greenfield and brownfield, git and non-git targets.
- Forces external dependencies (e.g., issue tracker) to be optional and degrade gracefully
  (see ADR-0003, ADR-0006).
- Evidence gathering over a target MUST be bounded (keyword-scoped), since targets may be huge
  (critique C9).
