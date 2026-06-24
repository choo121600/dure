# ADR-0006: `gh` CLI primary for GitHub sync, MCP fallback

- Status: Accepted
- Date: 2026-06-24
- Deciders: project owner
- Related: spec §5.2, §5.3; critique C11; ADR-0003

## Context

The hybrid backend (ADR-0003) syncs local roadmap items to GitHub. Two mechanisms are available:
the `gh` CLI (token-based) and an interactively-authenticated GitHub MCP server. MCP auth is
fragile in headless or distributed contexts.

## Decision

GitHub sync MUST use the `gh` CLI as the primary mechanism; the GitHub MCP server MAY be used as
a fallback when available (`config.yml: github.sync`). Sync MUST be idempotent via a stable
`id` ↔ GitHub-number map (`.dure/sync/github-map.json`). Structure flows local → GitHub (push);
status flows GitHub → local (pull); conflicting changes MUST be detected and reported, never
auto-merged. When GitHub is unavailable, sync MUST skip and report, leaving local intact.

## Consequences

- Robust in headless/CI and for distributed plugin users.
- Assumes `gh` is installed and authenticated for sync (degrades gracefully otherwise).
- Bidirectional flow requires conflict handling rather than a simple one-way push.
