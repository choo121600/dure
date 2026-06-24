---
name: status
description: dure progress report — aggregate per-item roadmap status into per-milestone completion, blockers, and local↔GitHub conflicts.
argument-hint: "[milestone-id]"
allowed-tools: Bash Read
disable-model-invocation: true
---

# /dure:status — Progress Report

Scope: **$ARGUMENTS** (if empty, all milestones)

Goal: per [spec §5.3 / E1.5](../../.dure/spec.md), aggregate local item status (and any pulled
GitHub status) into a progress report.

## Procedure
1. Run `${CLAUDE_PLUGIN_ROOT}/scripts/dure-context.sh` to confirm context and the active spec.
2. Run `${CLAUDE_PLUGIN_ROOT}/scripts/dure-status.py` — it returns JSON:
   `{overall, milestones[{id,title,total,completion,counts}], blockers[], conflicts[]}`.
   Completion is computed from issues (done / total); conflicts come from
   `.dure/sync/github-status.json` when present (written by `/dure:sync`'s pull).
3. Render the report **in the user's language** (artifacts stay English): per-milestone
   completion %, status counts, the blocker list, and any local↔GitHub conflicts. If a
   `milestone-id` argument was given, filter to that milestone.

---
> **Implementation status (E1.5):** `dure-status.py` is deterministic and tested
> (completion math + conflict detection). The GitHub side of conflicts activates once
> `/dure:sync` (E1.4) writes `sync/github-status.json`.
