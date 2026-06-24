---
name: sync
description: dure sync — idempotently mirror the local roadmap to GitHub Issues/Milestones. plan/apply separation; structure pushed, status pulled, conflicts reported. gh CLI first.
argument-hint: ""
allowed-tools: Bash Read
disable-model-invocation: true
---

# /dure:sync — GitHub Sync

Goal: per [spec §5.3](../../.dure/spec.md), idempotently mirror the local roadmap ↔ GitHub.

## Rules
- Tool: `gh` CLI first (`config.yml: github.sync`); GitHub MCP MAY be a fallback.
- **Structure = local → GitHub push**: milestone → Milestone, epic → tracking Issue (label `epic`),
  issue → Issue (assigned to its milestone, label `epic:<epic-id>`).
- **Status = GitHub → local pull**: written to `.dure/sync/github-status.json` for `/dure:status`.
- Idempotency key: local `id` ↔ GitHub number, cached in `.dure/sync/github-map.json`. Already-mapped
  items MUST NOT be recreated.
- Offline / not connected: report and skip; local state is untouched.

## Procedure
1. **Plan (safe, no writes):** `${CLAUDE_PLUGIN_ROOT}/scripts/dure-sync.py`
   → prints `{mode:"plan", create:{...}, summary:{...}}`. Show the user what WOULD be created.
2. **Confirm with the user** (in their language) before any GitHub write.
3. **Apply:** `${CLAUDE_PLUGIN_ROOT}/scripts/dure-sync.py --apply`
   → creates the planned items via `gh`, updates `github-map.json`, pulls status. Re-running is a no-op
   for already-synced items (idempotent).
4. Report created items + any conflicts (`/dure:status` surfaces local↔GitHub conflicts).

---
> **Implementation status (E1.4):** plan logic is deterministic and tested
> (`tests/test_dure_sync.py`); `--apply` performs real GitHub writes via `gh` and is opt-in.
