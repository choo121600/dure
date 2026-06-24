# ADR-0007: English for committed artifacts; localized runtime

- Status: Accepted
- Date: 2026-06-24
- Deciders: project owner
- Related: README; all skills/agents

## Context

dure is a distributable Claude Code plugin that may be shared via a marketplace and receive
external contributions. Its early artifacts were authored in Korean. The owner asked to align
with global standards. Two distinct layers exist: committed source/docs, and the runtime
interview a user interacts with.

## Decision

All **committed artifacts** (documentation, code, comments, skill/agent prompts, identifiers,
commit messages) MUST be in **English**, and identifiers/slugs MUST be ASCII `kebab-case`.
The **runtime interview** MUST respond to the user in the **user's language** (it is localized,
not English-only). Crystallized artifacts (spec, interview log) produced at runtime MUST be
written in English.

Adopted supporting standards: RFC 2119 keywords in normative text, ADRs for architectural
decisions, testable/Gherkin-style acceptance criteria, Conventional Commits, and SemVer.

## Consequences

- The plugin is readable and contributable internationally; the owner's runtime experience stays
  in their own language.
- Requires a one-time rewrite of existing Korean artifacts (done at adoption time).
- A non-ASCII title at runtime is slugified to ASCII, with a stable hash fallback when needed.
