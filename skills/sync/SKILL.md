---
name: sync
description: dure sync — idempotently synchronize the local roadmap with GitHub Issues/Milestones. Push structure, pull status, report conflicts. Prefer the gh CLI.
argument-hint: ""
allowed-tools: Bash Read Write
disable-model-invocation: true
---

# /dure:sync — GitHub Synchronization

Goal: Following [spec §5.3](../../.dure/spec.md), **idempotently** synchronize the local
roadmap ↔ GitHub.

## Rules
- Tooling: prefer the `gh` CLI; if unavailable, fall back to the github MCP
  (`config.yml: github.sync`).
- **Structure = local → GitHub push**: milestone → Milestone, epic → tracking issue
  (label `epic`), issue → Issue.
- **Status = GitHub → local pull**: closed/labels/assignee.
- Mapping key: item `id` ↔ GH number, cached in `.dure/sync/github-map.json`
  (this guarantees idempotency).
- On **conflict** (both sides changed divergently), the sync MUST NOT auto-merge; it MUST
  **detect and report** instead.
- If GitHub is not connected or you are offline, skip push/pull and report that fact clearly
  (the local state remains valid).

## Procedure
1. Check availability with `gh auth status`. Verify `config.yml: github.repo` (if absent,
   infer from the remote or ask the user). When asking the user, communicate in the user's
   language; keep all artifacts in English.
2. Load `github-map.json` → create only new items, update existing ones (MUST NOT create
   duplicates).
3. Pull status → update local frontmatter `status`/`github`, and report the list of conflicts.

---
> **Implementation status (E1.1 scaffold):** Rules and procedure defined. The gh adapter and
> idempotent mapping MUST be implemented **in E1.4**.
