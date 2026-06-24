---
slug: dure-doctor
title: dure-doctor — .dure/ integrity validator
status: converged          # in-progress | converged
threshold: 1.0
created_round: 0
---

# dure-doctor — Interview Convergence Ledger

> dure interviewing dure (dogfooding / E1.2 end-to-end validation). Converged in 3 scored rounds;
> the deterministic gate (`dure-gate.py`) decided convergence, not self-declaration.
> The interview ran in the user's language; this artifact is English (ADR-0007).

## Components
- C1 `dure-doctor` — a `.dure/` integrity validator

## Round 0 — Decomposition + evidence
- Request: "Add a `dure-doctor` check that validates a `.dure/` directory and reports integrity problems."
- **Evidence (grounding-scout)**: read `spec.md` §5–§6, `scripts/dure-bootstrap.sh`, `scripts/dure-context.sh`,
  `.dure/config.yml`, `scripts/dure-gate.py`, and `.dure/roadmap/{milestones,epics,issues}` samples.
  Derived a 19-point invariant checklist + front-matter schema + config schema, with file:line citations.

## Round 1 — Score + targeted questions
- Scores (problem 1, scope 3, acceptance 3, constraints 2, edge 2, stakeholders 1) → weighted **2.14 > 1.0**.
- Asked the 4 weakest-dimension questions (with evidence-grounded candidate answers). Decisions:
  Scope = **Comprehensive**, Form = **Python `dure-doctor.py`**, Output = **JSON + exit code**, Repair = **report-only + `--fix`**.

## Round 2 — Red-team (gate BLOCK)
- **redteam-critic** returned `signoff: fail` with 3 high-severity blockers:
  (1) check #18 index-regenerability + `--fix` regen depend on a nonexistent generator (E1.3) and would
  destroy the partial bootstrap index; (2) "stdlib yaml" is impossible and the regex parser misreads
  inline comments/`null`/block lists (PyYAML is actually present); (3) `github-map.json` behavior undefined
  when absent (the normal local-only state).
- Gate input scores (problem 0, scope 2, acceptance 2, constraints 2, edge 3, stakeholders 0),
  `signoff=fail`, `new_ambiguity_last_round=3`, `blocking_open_questions=3`.

```json
{"gate":"BLOCK","run_level_max":1.571,"failed":[
  "cond1: run_level_max 1.571 > threshold 1.0",
  "cond2: critic signoff missing -> ['dure-doctor']",
  "cond3: 3 blocking open question(s)",
  "cond4: new_ambiguity_last_round 3 != 0"]}
```

## Round 3 — Resolve + re-sign-off (gate PASS)
- Revisions: drop check #18 + `--fix` index regen (→ E1.3), add #18′ as warning; parser = PyYAML with
  documented regex fallback (strip comments / handle null / block lists); github-map checks conditional
  on file presence; error-vs-warning severities pinned; exit-code contract pinned (2/1/0); AC-a/b/c defined.
- **redteam-critic** re-review: all 3 prior blockers **resolved**, no new blocker, `signoff: pass`.
- Gate input scores (all 0 except edge 1), `signoff=pass`, `new_ambiguity_last_round=0`, `blocking_open_questions=0`.

```json
{"gate":"PASS","run_level_max":0.143,"min_rounds":1,"round":3,"failed":[]}
```

## Stop-condition check (gate-enforced, parent spec §4.4)
| Condition | Status |
|---|---|
| 1. Run-level weighted ambiguity ≤ threshold | ✅ 0.143 ≤ 1.0 |
| 2. Critic testable sign-off = pass | ✅ pass |
| 3. Zero blocking open questions | ✅ 0 |
| 4. round ≥ min_rounds AND zero new ambiguity | ✅ round 3, new 0 |

→ **Converged.** Spec FIXED → [`specs/dure-doctor.md`](../specs/dure-doctor.md). Next: `/dure:plan`.
