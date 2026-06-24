---
name: plan
description: dure decomposition — decompose the active fixed spec into milestone/epic/issue per-item files (source of truth), review them, and regenerate the index. Every issue gets a non-empty, testable acceptance criterion.
argument-hint: "[spec-slug]"
allowed-tools: Bash Read Grep Glob Write Task
disable-model-invocation: true
---

# /dure:plan — Issue Decomposition

Target spec: **$ARGUMENTS** (if empty, use the slug in `.dure/active`)

Goal: per [spec §5](../../.dure/spec.md), decompose a FIXED spec into milestone ⊃ epic ⊃ issue.
**Per-item files are the source of truth** (`.dure/roadmap/{milestones,epics,issues}/<id>.md`);
`index.md` is generated. The interview runs in the user's language; artifacts are English (ADR-0007).

## 0. Bootstrap + select spec
1. Run `${CLAUDE_PLUGIN_ROOT}/scripts/dure-bootstrap.sh` (idempotent).
2. Resolve the target spec: `$ARGUMENTS` > `.dure/active` > ask the user (in their language).
3. Read `.dure/specs/<slug>.md`.

## 1. Decompose
Produce per-item files with YAML front matter + body:
- **Milestone**: `id, slug, type: milestone, title, status: todo, github: null, epics: [<ids>]`.
- **Epic**: `+ milestone: <id>, issues: [<ids>]`.
- **Issue**: `+ milestone, epic, acceptance: [<testable criteria>]` (Gherkin Given/When/Then; INVEST).

**Stable IDs (I1.3.1/I1.3.3):** ids are derived deterministically from titles via
`${CLAUDE_PLUGIN_ROOT}/scripts/dure-slug.sh "<title>"` (ASCII kebab; hash fallback for non-ASCII),
disambiguated with a numeric suffix on collision. Re-running `/dure:plan` on the same spec MUST
reuse existing ids/slugs (read existing files first; do not renumber or overwrite unchanged content).

Every issue MUST have a non-empty, testable `acceptance` (spec AC3).

## 2. Review pass (I1.3.3)
`Task` the `redteam-critic` subagent over the draft decomposition to flag **missing**,
**duplicate**, or **oversized** issues and untestable acceptance criteria. Revise until clean.

## 3. Regenerate index + validate
1. `${CLAUDE_PLUGIN_ROOT}/scripts/dure-index.py` → regenerate `roadmap/index.md` from per-item files.
2. `${CLAUDE_PLUGIN_ROOT}/scripts/dure-doctor.py` → confirm integrity (status `pass`; warnings ok).

## 4. Summarize
Report the milestone/epic/issue tree and point the user to `/dure:sync` (push to GitHub) and
`/dure:status` (progress).

---
> **Implementation status (E1.3):** the index generator (`dure-index.py`) and integrity check
> (`dure-doctor.py`) are deterministic and tested. The decomposition itself (steps 1–2) is driven
> by these instructions; stable-id reuse on re-decomposition is enforced by reading existing files first.
