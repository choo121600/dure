---
slug: dure-survey
title: dure-survey — state survey / discovery engine (M3 entry)
status: converged          # in-progress | converged
threshold: 1.0
created_round: 0
---

# dure-survey — Interview Convergence Ledger

> dure interviewing dure (dogfooding — the full interview→plan→sync loop, applied to M3's first feature).
> Converged in 3 scored rounds; the deterministic gate (`dure-gate.py`) decided convergence. Interview ran
> in the user's language; this artifact is English (ADR-0007).

## Components
- C1 `dure-survey` — a deterministic, report-only state survey that surfaces forward-looking planning
  signals (first feature of M3 — the discovery engine)

## Round 0 — Decomposition + evidence
- Request: M3 "strategic planning". Key insight: dure ALREADY owns deep-interview / red-team / gate /
  crystallize (M1), so M3's genuinely new capability is **proactive discovery** — read current state and
  surface "what is needed next" as falsifiable signals; the proposal→converge half reuses the M1 pipeline.
- **Evidence (grounding-scout)**: ran `dure-audit` (0 findings) + `dure-status` (overall 9/9 done, m2 at
  100% issue completion but milestone `status: doing`); read `roadmap.md` (header declares prose
  intentionally broader than canonical per-item files), `spec.md` §3.1, and the doctor/audit/status
  scripts (ownership boundaries + union membership convention). Real signals observed on dure itself:
  roadmap drift, a milestone that looks closable, future milestones existing only as prose.

## Round 1 — Score + targeted questions
- Decisions fixed via structured choice: first feature = **deterministic state signal survey**
  (`dure-survey.py`); verification guards = all three (deterministic core / redteam sign-off / reduce-to-issues),
  the latter two scoped to the future proposal layer (E3.2).
- Initial candidate signals: `closable-milestone`, `empty-epic`, `planless-narrative`.

## Round 2 — Red-team (gate BLOCK)
- **redteam-critic** `signoff: fail`, verified against the repo, with blockers:
  (B1) `planless-narrative` is a false-positive machine BY DESIGN — `roadmap.md` is intentionally broader
  than canonical (8–26 false positives on the committed repo); (B2) its canonical variant duplicates
  doctor's `ref:missing-backing`; (B3) `closable-milestone` oracle unpinned — "issues-only" fires a wrong
  positive on `m2` (epics `e2.2`/`e2.3` still `doing`) and duplicates `dure-status` completion%;
  (B5) the disjointness test must enumerate audit's **4 implemented** checks, not the stale 3-check spec.

```json
{"gate":"BLOCK","failed":[
  "cond1: run_level_max > threshold",
  "cond2: critic signoff missing -> ['dure-survey']",
  "cond3: blocking open question(s)",
  "cond4: new_ambiguity_last_round != 0"]}
```

## Round 3 — Resolve + re-sign-off (gate PASS)
- Revisions: **drop `planless-narrative`** (B1/B2); **pin `closable-milestone`** to milestone `status != done`
  AND descendant count > 0 (vacuous guard) AND every descendant epic AND issue `done` (reuses audit/status
  union membership) → m2 correctly does NOT fire; **pin `empty-epic`** to empty child-issue membership
  (mutually exclusive with doctor's `ref:missing-backing` by construction); AC-c enumerates audit's 4
  implemented classes + doctor + status; fixtures (not the live board) are the PRIMARY AC, committed-repo
  `=0` is a secondary smoke test; malformed front matter → silent skip (status unknown ≠ done).
- **redteam-critic** re-review: recomputed all predicates from real front matter — `closable-milestone=0`
  and `empty-epic=0` CONFIRMED on the committed repo; empty-epic ⊥ doctor CONFIRMED (refutation failed);
  disjoint from doctor/audit/status. 3 non-blocking notes (fixtures primary, verify malformed-FM guard in
  impl, stalled-epic rightly deferred). `signoff: pass`.

```json
{"gate":"PASS","run_level_max":0.571,"run_level_mean":0.571,"min_rounds":1,"round":3,
 "per_component":[{"name":"dure-survey","weighted_ambiguity":0.571,"testable_signoff":"pass"}],
 "failed":[]}
```

## Stop-condition check (gate-enforced, parent spec §4.4)
| Condition | Status |
|---|---|
| 1. Run-level weighted ambiguity ≤ threshold | ✅ 0.571 ≤ 1.0 |
| 2. Critic testable sign-off = pass | ✅ pass |
| 3. Zero blocking open questions | ✅ 0 |
| 4. round ≥ min_rounds AND zero new ambiguity | ✅ round 3, new 0 |

→ **Converged.** Spec FIXED → [`specs/dure-survey.md`](../specs/dure-survey.md). Next: `/dure:plan`.
