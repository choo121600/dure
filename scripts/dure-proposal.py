#!/usr/bin/env python3
"""dure-proposal.py — deterministic direction-proposal validator (E3.2 first feature).

Spec: .dure/specs/dure-direction.md. Validates a `.dure/directions/<slug>.md` document is
structurally complete and gate-ready before it may drive `/dure:plan`. **Validate only**: emits to
stdout and MUST NOT write anywhere under `.dure/`. Disjoint from doctor/audit/survey/status.

This is the scaffold (issue i3.2.1): the CLI + JSON/exit contract, the document parser, and the
STRUCTURAL presence checks. Every check is presence/non-emptiness — no check asserts "testable" or
"valid"; semantic judgement is delegated to the embedded gate (the critic), validated in i3.2.2
(`direction:gate-not-pass`).

Usage : dure-proposal.py <path-to-direction-doc>
Output: JSON {status, violations:[{check, message}]}.
Exit  : 0 = no violations · 1 = >=1 violation · 2 = internal error (e.g. unreadable path).
"""
import argparse
import json
import os
import re
import sys

try:
    import yaml
    HAVE_YAML = True
except Exception:  # noqa: BLE001
    HAVE_YAML = False

FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.S)
H2_RE = re.compile(r"^##\s+(.*?)\s*$")
H3_RE = re.compile(r"^###\s+(.*?)\s*$")
FENCE_RE = re.compile(r"^\s*```")
# "- <title> | acceptance: <text>"  (markdown body, so colon-space is fine here)
CANDIDATE_RE = re.compile(r"^\s*-\s+(?P<title>.+?)\s*\|\s*acceptance:\s*(?P<acc>.*)$", re.I)
LABELED_RE = lambda label: re.compile(r"^\s*(?:\*\*)?" + label + r"(?:\*\*)?\s*:\s*(.*)$", re.I)
CRITIQUE_RE = LABELED_RE("critique")
RATIONALE_RE = LABELED_RE("rationale")


def split_front_matter(text):
    """Return (front_matter_dict_or_None, body_text). None means the FM block is absent/unparseable."""
    m = FM_RE.match(text)
    if not m:
        return None, text
    block, body = m.group(1), text[m.end():]
    if HAVE_YAML:
        try:
            data = yaml.safe_load(block)
            return (data if isinstance(data, dict) else None), body
        except Exception:  # noqa: BLE001
            return None, body
    # minimal fallback: key: value lines only (enough for slug/kind)
    data = {}
    for raw in block.splitlines():
        mm = re.match(r"^([\w.-]+):\s*(.*)$", re.sub(r"\s+#.*$", "", raw))
        if mm:
            data[mm.group(1)] = mm.group(2).strip().strip('"').strip("'")
    return (data or None), body


def _iter_unfenced(lines):
    """Yield (line, in_fence). Lines inside (and the delimiters of) a ``` code fence are flagged
    in_fence=True so they are NEVER interpreted as structure — the schema *requires* a fenced gate
    block, and proposals routinely contain code examples (red-team B1)."""
    in_fence = False
    for line in lines:
        if FENCE_RE.match(line):
            yield line, True          # the ``` delimiter is never structural
            in_fence = not in_fence
        else:
            yield line, in_fence


def split_sections(body):
    """Split body into {heading_lower: [lines]} keyed by level-2 (## ) headings, fence-aware.
    Fenced lines are retained as section *content* but never start a new section."""
    sections, cur = {}, None
    for line, fenced in _iter_unfenced(body.splitlines()):
        if not fenced and H2_RE.match(line):
            cur = H2_RE.match(line).group(1).strip().lower()
            sections[cur] = []
        elif cur is not None:
            sections[cur].append(line)
    return sections


def _nonempty(lines):
    return bool("\n".join(lines).strip())


def _option_blocks(lines):
    """Split an Options section's lines into {option_title: [block lines]} by level-3 (### ) headings,
    fence-aware (a ### inside a code fence is not an option boundary)."""
    blocks, cur = {}, None
    for line, fenced in _iter_unfenced(lines):
        if not fenced and H3_RE.match(line):
            cur = H3_RE.match(line).group(1).strip()
            blocks[cur] = []
        elif cur is not None:
            blocks[cur].append(line)
    return blocks


def _first_labeled(lines, rx):
    """First non-fenced line matching `rx`, returning its trailing text (stripped) or None."""
    for line, fenced in _iter_unfenced(lines):
        if fenced:
            continue
        m = rx.match(line)
        if m:
            return m.group(1).strip()
    return None


STRUCTURAL_CHECKS = [
    "direction:frontmatter", "direction:problem-missing", "direction:options-too-few",
    "direction:option-critique-missing", "direction:chosen-missing", "direction:rationale-missing",
    "direction:candidate-issue-missing", "direction:acceptance-missing",
]


def validate_structure(fm, sections):
    """Structural presence checks only (i3.2.1). Returns list of {check, message}."""
    v = []

    def emit(check, message):
        v.append({"check": check, "message": message})

    # direction:frontmatter — parses + has slug + kind: direction
    if not fm or not fm.get("slug") or fm.get("kind") != "direction":
        emit("direction:frontmatter",
             "front matter must parse and carry 'slug' and 'kind: direction'")

    # direction:problem-missing
    problem = sections.get("problem") or sections.get("problem / motivation") \
        or sections.get("problem/motivation") or sections.get("motivation")
    if problem is None or not _nonempty(problem):
        emit("direction:problem-missing", "a non-empty '## Problem' section is required")

    # direction:options-too-few / option-critique-missing
    options = sections.get("options")
    blocks = _option_blocks(options) if options else {}
    if len(blocks) < 2:
        emit("direction:options-too-few",
             f"at least 2 '### <option>' blocks are required under '## Options' (found {len(blocks)})")
    for name, blines in blocks.items():
        crit = _first_labeled(blines, CRITIQUE_RE)
        if not crit:
            emit("direction:option-critique-missing",
                 f"option '{name}' has no non-empty 'Critique:' line")

    # direction:chosen-missing / rationale-missing
    chosen = sections.get("chosen") or sections.get("chosen direction")
    if chosen is None:
        emit("direction:chosen-missing", "a '## Chosen' section naming the chosen option is required")
    else:
        names = [ln.strip() for ln in chosen
                 if ln.strip() and not RATIONALE_RE.match(ln)]
        if not names:
            emit("direction:chosen-missing", "the '## Chosen' section names no option")
        rationale = _first_labeled(chosen, RATIONALE_RE)
        if not rationale:
            emit("direction:rationale-missing", "the chosen direction has no non-empty 'Rationale:' line")

    # direction:candidate-issue-missing / acceptance-missing
    cand = sections.get("candidate issues") or sections.get("candidate-issues") or sections.get("issues")
    matches = [CANDIDATE_RE.match(ln) for ln, fenced in _iter_unfenced(cand or []) if not fenced]
    matches = [m for m in matches if m]
    if len(matches) < 1:
        emit("direction:candidate-issue-missing",
             "at least 1 '- <title> | acceptance: <text>' candidate-issue sketch is required")
    for m in matches:
        if not m.group("acc").strip():
            emit("direction:acceptance-missing",
                 f"candidate issue '{m.group('title').strip()}' has an empty acceptance string")

    return v


def build_report(violations):
    return {"status": "fail" if violations else "pass", "violations": violations}


def main():
    ap = argparse.ArgumentParser(
        description="Validate a .dure/directions/<slug>.md direction proposal (validate-only).")
    ap.add_argument("path", help="path to the direction document")
    args = ap.parse_args()
    try:
        with open(args.path, encoding="utf-8") as f:
            text = f.read()
        fm, body = split_front_matter(text)
        sections = split_sections(body)
        violations = validate_structure(fm, sections)
        report = build_report(violations)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        sys.exit(1 if violations else 0)
    except (OSError, UnicodeDecodeError) as e:
        print(json.dumps({"status": "error", "message": str(e), "violations": []},
                         ensure_ascii=False, indent=2))
        sys.exit(2)


if __name__ == "__main__":
    main()
