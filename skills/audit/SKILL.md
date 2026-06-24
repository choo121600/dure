---
name: audit
description: dure audit — run the deterministic repo scanner and surface findings (debt / missing-test / progress-consistency signals) as evidence for /dure:interview and /dure:plan. Report-only; never creates issues.
argument-hint: ""
allowed-tools: Bash Read
disable-model-invocation: true
---

# /dure:audit — Repo Audit

Goal: per [specs/dure-audit.md](../../.dure/specs/dure-audit.md), run the deterministic audit and
present its findings as **evidence** for planning. The interview/report runs in the user's language;
artifacts stay English (ADR-0007).

## Boundary (MUST hold)
- **Report-only.** This skill MUST NOT write to `.dure/roadmap/` and MUST NOT create issues.
  Findings are evidence; the user (or `/dure:interview` / `/dure:plan`) decides what becomes work.
- Disjoint from `dure-doctor`: doctor owns integrity (schema/hierarchy/orphans); audit owns
  debt / missing-test / progress-consistency signals.

## Procedure
1. Run `${CLAUDE_PLUGIN_ROOT}/scripts/dure-context.sh` to confirm the target repo.
2. Run `${CLAUDE_PLUGIN_ROOT}/scripts/dure-audit.py`
   → JSON `{status, counts, findings:[{check, severity, file?, line?, id?, message}]}`.
3. Present the findings **in the user's language**, grouped by `check` then `severity`
   (`error` > `warning` > `info`), each with its `file:line` or `id`. Lead with the counts summary.
   If `findings` is empty, say so plainly.
4. Offer next actions **without auto-acting**:
   - feed a selected finding into `/dure:interview "<finding>"` as grounding evidence,
   - run `${CLAUDE_PLUGIN_ROOT}/scripts/dure-audit.py --suggest` to get **draft** issue stubs
     (title + suggested acceptance) for warning-or-higher findings, which the user can hand to `/dure:plan`, or
   - note findings to fold into `/dure:plan`.
   Let the user choose; do not create issues or edit the roadmap.

---
> **Implementation status:** wraps the tested `scripts/dure-audit.py` (3 checks: todo-marker,
> untested-script, done-parent-undone-child). Auto-running on `SessionStart` or feeding findings
> straight into `/dure:plan` are possible later increments, kept out of this report-only slice.
