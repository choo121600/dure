---
name: survey
description: dure survey — run the deterministic state survey and surface forward-looking planning signals (closable milestones, empty epics) as evidence for /dure:interview and /dure:plan. Report-only; never creates issues.
argument-hint: ""
allowed-tools: Bash Read
disable-model-invocation: true
---

# /dure:survey — State Survey (M3 discovery engine)

Goal: per [specs/dure-survey.md](../../.dure/specs/dure-survey.md), run the deterministic state
survey and present its forward-looking planning signals as **evidence** for direction-setting. The
report runs in the user's language; artifacts stay English (ADR-0007).

## Boundary (MUST hold)
- **Report-only.** This skill MUST NOT write to `.dure/roadmap/` and MUST NOT create issues.
  Signals are evidence; the user (or `/dure:interview` / `/dure:plan`) decides what becomes work.
- Disjoint from the other scanners: `dure-doctor` owns integrity (schema/hierarchy/orphans),
  `dure-audit` owns debt signals, `dure-status` owns completion — `dure-survey` owns *forward-looking*
  planning signals (what action is now available).

## Procedure
1. Run `${CLAUDE_PLUGIN_ROOT}/scripts/dure-context.sh` to confirm the target repo.
2. Run `${CLAUDE_PLUGIN_ROOT}/scripts/dure-survey.py`
   → JSON `{status, counts, findings:[{check, severity, id, message}]}`.
3. Present the findings **in the user's language**, grouped by `check`
   (`closable-milestone`, `empty-epic`), each with its `id` and message. Lead with the counts
   summary. If `findings` is empty, say so plainly.
4. Offer next actions **without auto-acting**:
   - for a `closable-milestone`, confirm its descendants and close the milestone (a status update,
     not new work),
   - for an `empty-epic`, feed it into `/dure:interview "<epic>"` to decompose it, or drop it,
   - note signals to fold into `/dure:plan`.
   Let the user choose; do not create issues or edit the roadmap.

---
> **Implementation status:** wraps the tested `scripts/dure-survey.py` (2 signals: closable-milestone,
> empty-epic). The subjective direction-proposal layer (`/dure:direction`, behind a redteam sign-off
> gate) is a later M3 increment, kept out of this report-only slice.
