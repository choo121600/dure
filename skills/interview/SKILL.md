---
name: interview
description: dure deep interview — interview a vague requirement until understanding converges quantitatively, then crystallize it into .dure/specs/<slug>.md. Four traits — evidence-grounded, red-team, auto-research, quantitative convergence gate.
argument-hint: "<one-line requirement>"
allowed-tools: Bash Read Grep Glob Task Write AskUserQuestion
disable-model-invocation: true
---

# /dure:interview — Deep Interview

Request: **$ARGUMENTS**

Goal: interview the request using the methodology in [playbook.md](playbook.md) (spec §4), and
crystallize `.dure/specs/<slug>.md` + `.dure/interview-logs/<slug>.md` **only after** the stop
conditions (§4.4) are met.

> **Language:** conduct the interview in the **user's language**; write all artifacts (spec, log)
> in **English** (ADR-0007).

## 0. Bootstrap + context (E1.1)
1. Run `${CLAUDE_PLUGIN_ROOT}/scripts/dure-bootstrap.sh` → ensure `.dure/` (idempotent).
2. Run `${CLAUDE_PLUGIN_ROOT}/scripts/dure-context.sh` → detect git/non-git · greenfield/brownfield.
3. **Resume check (§4.6):** if `.dure/interview-logs/` contains a log with `status: in-progress`,
   ask the user (in their language) whether to continue it instead of starting a new interview.
4. Compute the slug for a new interview: `${CLAUDE_PLUGIN_ROOT}/scripts/dure-slug.sh "$ARGUMENTS"`.
   Initialize the log from `templates/interview-log.md`.

## 1. Convergence loop (see [playbook.md](playbook.md), spec §4)
Decompose the request into components, then repeat until the gate passes:

1. **Evidence** — `Task` the `grounding-scout` subagent to read code/issues within keyword scope
   → evidence + candidate answers. (trait ①; bound the scope for large repos, C9)
2. **Score** — self-assess each component × dimension (§4.2) honestly (0–5). You MUST NOT lower
   scores to finish faster.
3. **Ask** — target the weakest dimension with 1–4 questions via `AskUserQuestion` (structured
   choices + free-form), attaching cited candidate answers. Put any recommendation first.
4. **Red-team** — `Task` the `redteam-critic` subagent; it MUST inject ≥1 requirement-breaking
   cross-examination and return a `pass|fail` testable sign-off per component.
5. **Research** — when the user defers, `Task` the `research-scout` subagent for sourced candidates.
6. **Record** — append the round (evidence files · scores · red-team · decisions) to the log.

## 2. Convergence gate (§4.4) — deterministic, MUST NOT self-declare
Build this round's payload and feed it to the gate:

```bash
echo '{ "round": N,
  "components": [ {"name":"C1",
    "scores":{"problem":..,"scope":..,"acceptance":..,"constraints":..,"edge":..,"stakeholders":..},
    "testable_signoff":"pass|fail"} ],
  "new_ambiguity_last_round": <n>, "blocking_open_questions": <n> }' \
| "${CLAUDE_PLUGIN_ROOT}/scripts/dure-gate.py"
```

- Proceed to §3 ONLY when the exit code is `0` and the output is `gate=PASS`.
- On `BLOCK`, take the conditions in `failed[]` as the next round's target.
- Record the gate input JSON and its result verbatim in the log (auditability, AC2).

## 3. Crystallize (only after PASS)
1. Write `.dure/specs/<slug>.md` from `templates/spec.md` (decisions, scope, testable AC) — in English.
2. Set the interview log front matter to `status: converged`.
3. Write `<slug>` into `.dure/active`.
4. Summarize for the user (in their language) and point them to `/dure:plan`.

---
> **Implementation status (E1.2):** the deterministic gate (`dure-gate.py`), slug helper, playbook,
> and templates are in place. Subagent orchestration (`grounding-scout` / `redteam-critic` /
> `research-scout`) MUST be driven via `Task` as above; if a subagent is unavailable, perform that
> step in the main context and state so in the log.
