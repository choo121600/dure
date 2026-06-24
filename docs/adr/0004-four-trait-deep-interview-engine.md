# ADR-0004: Deep-interview engine with four traits beyond Huginn

- Status: Accepted
- Date: 2026-06-24
- Deciders: project owner
- Related: spec §2 (D7), §4; critique C2, C4

## Context

dure's differentiator is a requirements interview that goes "beyond Huginn" (the reference
deep-interview playbook). The owner specified four concrete traits. Because dure is an
in-process plugin (ADR-0001), the "engine" is realized as prompt/skill instructions plus
subagents plus file state, not as standalone algorithmic code.

## Decision

The deep-interview engine MUST exhibit all four traits, each realized via a dedicated subagent
where independence matters (spec §4.5):

1. **Evidence-grounded questions** — read real code/structure before asking (`grounding-scout`).
2. **Aggressive red-team critique** — break the requirements every round (`redteam-critic`).
3. **Auto-research candidate answers** — research sourced options when the user defers
   (`research-scout`).
4. **Quantitative convergence gate** — score ambiguity honestly and stop only when a guarded
   gate opens (see ADR-0005).

## Consequences

- Subagent separation yields genuinely independent evidence and critique (less self-censorship).
- More orchestration complexity than a single-prompt interview.
- Trait quality is observable: each round's log MUST record evidence files, red-team items,
  candidate-answer sources, and per-dimension scores.
