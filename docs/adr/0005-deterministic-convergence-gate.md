# ADR-0005: Deterministic convergence gate with an anti-gaming guard

- Status: Accepted
- Date: 2026-06-24
- Deciders: project owner
- Related: spec §4.4; critique C3; ADR-0004

## Context

The convergence stop condition relies on the model's self-assessed ambiguity scores. If the
model alone decides "converged," it has an incentive to lower scores to finish faster. A pure
self-declaration is not trustworthy as a gate.

## Decision

Convergence MUST be decided by deterministic code (`scripts/dure-gate.py`), not by model
declaration. The model supplies honest scores and an independent critic sign-off; the script
computes the weighted ambiguity and evaluates the stop conditions. The gate MUST require all of:

1. Run-level (weakest component) weighted ambiguity ≤ `ambiguity_threshold`.
2. `redteam-critic` sign-off = `pass` for every active component (defaults to `fail` when unsure).
3. Zero blocking open questions.
4. `round ≥ min_rounds` AND zero new ambiguity in the previous round.

The spec MUST NOT be crystallized unless the gate returns `PASS` (exit 0).

## Consequences

- Removes the "self-declare convergence" failure mode; the arithmetic and conditions are auditable.
- Requires the model to emit a structured scores payload each round and log the gate result.
- Thresholds/weights are configurable in `.dure/config.yml` without changing code.
