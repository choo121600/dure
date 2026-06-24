# Architecture Decision Records (ADRs)

This directory records architecturally significant decisions for **dure** using a lightweight
[MADR](https://adr.github.io/madr/)-style format. Each record is immutable once `Accepted`;
to change a decision, add a new ADR that supersedes the old one.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-deliver-as-in-process-claude-code-plugin.md) | Deliver dure as an in-process Claude Code plugin | Accepted |
| [0002](0002-operate-on-arbitrary-external-codebases.md) | Operate on arbitrary external codebases | Accepted |
| [0003](0003-hybrid-local-first-issue-backend.md) | Hybrid issue backend: local per-item files as source of truth | Accepted |
| [0004](0004-four-trait-deep-interview-engine.md) | Deep-interview engine with four traits beyond Huginn | Accepted |
| [0005](0005-deterministic-convergence-gate.md) | Deterministic convergence gate with an anti-gaming guard | Accepted |
| [0006](0006-gh-cli-primary-sync.md) | `gh` CLI primary for GitHub sync, MCP fallback | Accepted |
| [0007](0007-english-artifacts-localized-runtime.md) | English for committed artifacts; localized runtime | Accepted |

These ADRs are the authoritative record of the decisions summarized in
[`.dure/spec.md`](../../.dure/spec.md) §2.
