---
name: direction
description: dure direction — gather survey/audit/status evidence, run a deep interview that converges a project direction, write a validated .dure/directions/<slug>.md proposal, and hand the chosen direction to /dure:plan. Report-only at the validator boundary; never writes the roadmap.
argument-hint: "[focus or question]"
allowed-tools: Bash Read Write Task AskUserQuestion
disable-model-invocation: true
---

# /dure:direction — Strategic direction proposal (M3, E3.2)

Goal: per [specs/dure-direction.md](../../.dure/specs/dure-direction.md), turn the project's current
state into a **critiqued direction proposal** and hand the chosen direction to `/dure:plan`. This is
M3's second half — the survey *discovers* signals, this skill *decides* a direction from them. The
interview runs in the user's language; artifacts stay English (ADR-0007).

## Boundary (MUST hold)
- The proposal doc (`.dure/directions/<slug>.md`) is a **non-canonical sketch**. This skill MUST NOT
  write `.dure/roadmap/` and MUST NOT create issues — `/dure:plan` re-derives the canonical roadmap
  (assigning stable ids, re-running the critic for real testability). The proposal is consumed, never synced.
- `${CLAUDE_PLUGIN_ROOT}/scripts/dure-proposal.py` is **validate-only** — it writes nothing.
- Gate-readiness is the reused `${CLAUDE_PLUGIN_ROOT}/scripts/dure-gate.py` PASS, embedded **verbatim**
  in the doc — never a hand-typed sign-off. Anti-gaming is inherited from the gate, never re-invented.

## Procedure
1. **Context** — run `${CLAUDE_PLUGIN_ROOT}/scripts/dure-context.sh` to confirm the target repo.
2. **Evidence (grounding)** — run the three read-only scanners and read their JSON:
   - `${CLAUDE_PLUGIN_ROOT}/scripts/dure-survey.py` (forward-looking planning signals),
   - `${CLAUDE_PLUGIN_ROOT}/scripts/dure-audit.py` (debt signals),
   - `${CLAUDE_PLUGIN_ROOT}/scripts/dure-status.py` (completion / blockers / conflicts).
   These are evidence, not commands — present them in the user's language.
3. **Converge a direction** — run the deep-interview loop (the `/dure:interview` methodology, §4 of the
   parent spec): decompose the question, gather evidence, score ambiguity, ask the weakest dimension,
   and **every round** spawn an independent `redteam-critic` (via Task) to try to break the candidate
   directions. Target *which direction to pursue*, framed by the evidence, with **≥2 critiqued options**.
4. **Gate** — when stop conditions are met, run `${CLAUDE_PLUGIN_ROOT}/scripts/dure-gate.py` with the
   final-round scores + the critic sign-off; keep iterating until it returns `gate: PASS`.
5. **Write the proposal** — write `.dure/directions/<slug>.md` with: a non-empty **Problem**, the
   **≥2 options each with a Critique**, the **Chosen** option + **Rationale**, a **Candidate issues**
   sketch (`- <title> | acceptance: <text>`, non-canonical), and the **verbatim gate PASS block** under
   `## Gate`.
6. **Validate** — run `${CLAUDE_PLUGIN_ROOT}/scripts/dure-proposal.py .dure/directions/<slug>.md`. If it
   reports any `direction:*` violation, fix the doc and re-validate until `status: pass`.
7. **Hand off** — offer to run `/dure:plan` on the chosen direction (which re-derives the canonical
   roadmap). Do not write the roadmap from this skill.

---
> **Implementation status:** orchestrates the tested `dure-survey`/`dure-audit`/`dure-status` evidence,
> the `dure-gate` convergence gate, and the `dure-proposal` validator. Auto-running the scanners on
> `SessionStart` is a possible later increment, kept out of this slice.
