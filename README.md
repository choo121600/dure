# dure

> A PM agent that attaches to a single project and leads it — a Claude Code plugin.

**dure** is named after the *dure*, a traditional Korean cooperative-labor community.
dure attaches to any codebase to act as its **expert project PM**: it converges requirements
through a deep interview → decomposes them into milestones/epics/issues → and tracks progress.
The brain is Claude Code.

## What it does

1. **Deep interview → issue decomposition** *(v1)* — turn a vague one-liner into fixed
   requirements by interviewing until understanding converges *quantitatively*, then decompose
   into milestones/epics/issues. (Local-first source of truth + GitHub sync.)
2. **Full audit** *(later)* — scan an existing project for debt, bugs, and structural problems.
3. **Strategic planning** *(later)* — self-discover what the project will need next and distill a
   plan through deep interview + rigorous critique.

> **Language:** committed artifacts (code, docs, identifiers) are English; the runtime interview
> responds in the **user's language**. See [ADR-0007](docs/adr/0007-english-artifacts-localized-runtime.md).

## Usage (target shape, v1)

```bash
cd ~/any-project
claude --plugin-dir /path/to/dure
> /dure:interview "I want to add refunds to the payments module"
# → dure converges via evidence-grounded questions + red-team critique + candidate answers
# → requirements fixed → .dure/specs/<slug>.md
> /dure:plan        # spec → milestones/epics/issues (.dure/roadmap/)
> /dure:sync        # local → GitHub Issues/Milestones
> /dure:status      # progress tracking / report
```

## Locked decisions

See [`.dure/spec.md`](.dure/spec.md) §2 and the records under [`docs/adr/`](docs/adr/).
Convergence is logged in [`.dure/interview-log.md`](.dure/interview-log.md); the build plan is in
[`.dure/roadmap.md`](.dure/roadmap.md).

| Decision | Value |
|---|---|
| Identity | Fully independent project (no odin-loop dependency) |
| Managed targets | Any external codebase |
| Engine | Claude Code as the brain (v1 in-process plugin; wrapper path kept open) |
| Interface | Claude Code plugin first (full-screen TUI is a later milestone) |
| Issue backend | Hybrid — local per-item files (source of truth) + GitHub sync (`gh` CLI first) |
| v1 vertical slice | Deep interview → issue decomposition + progress tracking |

> Install path (plugin marketplace vs. git clone) is undecided (OQ4) — non-blocking for v1.

## Plugin structure

```
.claude-plugin/plugin.json   # manifest
skills/                      # /dure:* slash commands
  interview/SKILL.md         # /dure:interview — deep interview
  plan/SKILL.md              # /dure:plan      — issue decomposition
  sync/SKILL.md              # /dure:sync      — GitHub sync
  status/SKILL.md            # /dure:status    — progress report
agents/                      # interview subagents
  grounding-scout.md         # evidence gathering (trait ①)
  redteam-critic.md          # red-team + gate sign-off (traits ②/④)
  research-scout.md          # auto-research (trait ③)
scripts/                     # deterministic utilities
  dure-bootstrap.sh          # idempotent .dure/ bootstrap
  dure-context.sh            # target repo detection
  dure-gate.py               # deterministic convergence gate
  dure-slug.sh               # stable ASCII slug
hooks/hooks.json             # SessionStart: make scripts executable
docs/adr/                    # architecture decision records
.dure/                       # dure's own PM state (dogfooding)
```

## Development / local testing

```bash
# Load this repo as a plugin for testing
claude --plugin-dir /Users/yeonguk/Project/dure
# Inside the session:
/plugin validate          # validate manifest + frontmatter
/dure:interview "..."      # deep interview
/agents                    # confirm the 3 subagents
/reload-plugins            # pick up edits
```

## Status

🚧 **Building M1.** E1.1 (plugin scaffold) is complete. E1.2 (deep-interview engine) is in place
and **validated end-to-end** by dogfooding: dure interviewed a real requirement (`dure-doctor`),
the deterministic gate blocked on a failed red-team sign-off, then passed once resolved, and
crystallized [`.dure/specs/dure-doctor.md`](.dure/specs/dure-doctor.md).

First feature shipped via the engine: **`dure-doctor`** — a `.dure/` integrity validator
([`scripts/dure-doctor.py`](scripts/dure-doctor.py), tests in
[`tests/test_dure_doctor.py`](tests/test_dure_doctor.py), 32 checks green). See
[`.dure/roadmap.md`](.dure/roadmap.md).
