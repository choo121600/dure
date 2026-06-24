# Deep Interview Playbook (dure engine, detailed)

> The methodology body referenced by `SKILL.md`. This is the implementation guidance for spec §4.
> Engine = **this instruction (prompt) + subagents + `dure-gate.py` (deterministic gate) + file state**.

## Principles
- Every score is an **honest self-assessment** (0 = clear … 5 = pitch black). You MUST NOT lower it just to finish faster.
- **The model does not declare convergence.** `dure-gate.py` decides via arithmetic and conditions (anti-gaming guard).
- No unsupported assertions. Speculation MUST be marked as distinct from evidence.
- The assistant conducts the interview in the **user's language**, but all crystallized artifacts (spec, interview log) MUST be written in English.

## Round procedure (repeat until convergence)

### 1. Evidence (grounding-scout)
Use `Task` to launch the `grounding-scout` subagent so it reads code, structure, and existing
issues **bounded by the request keywords** (no full read of a huge repo, C9). Returns: `read[]`, `findings[]`, `candidates[]`.
→ Record the files read and the candidate answers in the interview log's "Evidence" section.

### 2. Scoring (component × dimension)
For each component, self-assess six dimensions from 0–5:
`problem, scope, acceptance, constraints, edge, stakeholders` (weights in config.yml §4.2).

### 3. Questions (target the weakest dimension)
Pick the component/dimension with the highest weighted ambiguity and ask **1–4** questions.
- Present **structured choices** via `AskUserQuestion`, but attach a grounding/research **candidate answer**
  to each option together with its evidence. Free-form responses are also allowed.
- If you have a recommended option, place it first and append "(recommended)".

### 4. Red-team (redteam-critic) — required every round
Use `Task` to launch `redteam-critic` and have it **break** the requirements. Returns: `attacks[]`,
`assumptions[]`, `missing_edges[]`, `simpler_alternatives[]`, `signoff[]`.
- `signoff[]` is `pass|fail` for whether each component's acceptance criteria are *testable*. **This is gate cond2.**
→ Record the cross-examination and sign-off in the interview log's "Red-team" section.

### 5. Research (research-scout) — when the user does not know / delegates
Use `Task` to launch `research-scout`, receive sourced candidate answers, and present them to the user.
If there is no response for a long time, propose a conservative default as an auto-answer.

### 6. Convergence decision (dure-gate.py) — deterministic
Assemble this round's scores and sign-offs as JSON and feed them to the gate:

```bash
echo '{ "round": N,
  "components": [ {"name":"C1","scores":{"problem":..,"scope":..,"acceptance":..,
                   "constraints":..,"edge":..,"stakeholders":..},
                   "testable_signoff":"pass|fail"} ],
  "new_ambiguity_last_round": <number of new ambiguities in the previous round>,
  "blocking_open_questions": <number of blocking open questions> }' \
| "${CLAUDE_PLUGIN_ROOT}/scripts/dure-gate.py"
```

- Proceed to §7 only when the exit code is **0 (PASS)** and the output is `gate=PASS`.
- On **1 (BLOCK)**, take the condition pointed to by `failed[]` (usually the weakest dimension or an unsigned-off
  component) as the target for the next round.
- Record the gate's input JSON and its result verbatim in the interview log (for auditability).

## Stop conditions (enforced by the gate, spec §4.4)
1. Run-level (weakest component) weighted ambiguity ≤ `ambiguity_threshold`
2. **All components' critic sign-off = pass** ← a guard that cannot be opened by self-declaration
3. Blocking open questions = 0
4. round ≥ `min_rounds` AND new ambiguities in the previous round = 0

## Crystallize (only after PASS)
1. Use `templates/spec.md` to write `.dure/specs/<slug>.md` (decisions, scope, testable AC).
2. Change the interview log frontmatter to `status: converged`.
3. Record `<slug>` in `.dure/active`.
4. Give the user a summary plus a pointer to `/dure:plan`.

## Resume (§4.6)
On startup, scan `.dure/interview-logs/`. If there is a log with `status: in-progress`, ask whether to
continue that slug instead of starting a new interview. When continuing, start from the last round's scores.
