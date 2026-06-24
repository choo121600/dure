---
name: status
description: dure progress report — merge the local roadmap with GitHub status to report per-milestone completion rate, blockers, and conflicts.
argument-hint: "[milestone-id]"
allowed-tools: Bash Read
disable-model-invocation: true
---

# /dure:status — Progress Report

Scope: **$ARGUMENTS** (if empty, all milestones)

Goal: Following [spec §5.3 / E1.5](../../.dure/spec.md), merge local item status with GitHub
status to report progress.

## Procedure
1. Confirm context and the active spec with `${CLAUDE_PLUGIN_ROOT}/scripts/dure-context.sh`.
2. Aggregate item status (todo/doing/done/blocked) from `.dure/roadmap/`.
3. If `.dure/sync/github-map.json` exists, merge GitHub status (mark conflicts).
4. Report: per-milestone completion rate, blocker list, and local ↔ GitHub conflicts.

When reporting to the user, communicate in the user's language; keep all artifacts in English.

---
> **Implementation status (E1.1 scaffold):** Procedure defined. The status merge and report
> aggregation MUST be implemented **in E1.5**.
