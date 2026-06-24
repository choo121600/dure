---
slug: {{SLUG}}
title: {{TITLE}}
status: in-progress        # in-progress | converged   ← resume decision key (§4.6)
threshold: 1.0
created_round: 0
---

# {{TITLE}} — Interview Convergence Ledger

> Per-round ledger of scores, evidence, red-team findings, and decisions for the dure deep interview.
> When it reaches `status: converged`, the spec is frozen. While `in-progress`, a re-invocation of
> `/dure:interview` resumes it.

## Components
- C1 …

## Round N
<!-- Each round records a human-readable narrative plus the gate input JSON (below). -->

- **Evidence (grounding-scout)**: files read [...], derived candidate answers [...]
- **Red-team (redteam-critic)**: cross-examination [...], sign-off [...]
- **Decision**: …

```json
{
  "round": 1,
  "components": [
    {"name": "C1", "scores": {"problem":2,"scope":2,"acceptance":3,"constraints":1,"edge":2,"stakeholders":1},
     "testable_signoff": "fail"}
  ],
  "new_ambiguity_last_round": 0,
  "blocking_open_questions": 1
}
```
> Feed the JSON above to `dure-gate.py` via stdin and record the resulting PASS/BLOCK decision.

## Gate Result (latest)
- gate: BLOCK · run_level_max: … · failed: [...]
