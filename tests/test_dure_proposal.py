#!/usr/bin/env python3
"""Tests for dure-proposal.py scaffold (i3.2.1) — JSON/exit contract, the direction-doc parser,
the structural presence checks, and the no-`.dure/`-writes guarantee.

The embedded-gate check (direction:gate-not-pass, i3.2.2) and the disjointness test (i3.2.3) live in
their own additions. Run: python3 tests/test_dure_proposal.py   (exit 0 = all pass)
"""
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
PROPOSAL = os.path.join(REPO, "scripts", "dure-proposal.py")

PASS = 0
FAIL = 0


def w(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def load_module():
    spec = importlib.util.spec_from_file_location("dure_proposal", PROPOSAL)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def build_doc(fm=True, slug="ex", kind="direction", problem="A real problem worth solving.",
              options=2, drop_critique=False, chosen="Option A", rationale="Deterministic core wins.",
              candidates=2, empty_acceptance=False,
              gate='{"gate": "PASS", "run_level_max": 0.5, "threshold": 1.0, "failed": []}'):
    parts = []
    if fm:
        lines = []
        if slug is not None:
            lines.append(f"slug: {slug}")
        if kind is not None:
            lines.append(f"kind: {kind}")
        lines.append("status: converged")
        parts.append("---\n" + "\n".join(lines) + "\n---\n")
    parts.append("# Example direction\n")
    if problem is not None:
        parts.append("## Problem\n" + problem + "\n")
    parts.append("## Options")
    for i in range(options):
        name = chr(ord("A") + i)
        parts.append(f"### Option {name}")
        parts.append("Some description of the option.")
        last = (i == options - 1)
        if not (drop_critique and last):
            parts.append(f"Critique: option {name} carries risk {name}.")
        parts.append("")
    if chosen is not None:
        block = "## Chosen\n" + chosen + "\n"
        if rationale is not None:
            block += f"Rationale: {rationale}\n"
        parts.append(block)
    parts.append("## Candidate issues")
    for i in range(candidates):
        acc = "" if empty_acceptance else f"issue {i} emits JSON and exits 0/1/2"
        parts.append(f"- issue {i} | acceptance: {acc}")
    parts.append("")
    if gate is not None:
        parts.append("## Gate\n```json\n" + gate + "\n```\n")
    return "\n".join(parts)


def run(path):
    p = subprocess.run([sys.executable, PROPOSAL, path], capture_output=True, text=True)
    try:
        return p.returncode, json.loads(p.stdout)
    except Exception:
        return p.returncode, {"_stdout": p.stdout, "_stderr": p.stderr}


def vset(d):
    return sorted(set(v["check"] for v in d.get("violations", [])))


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok   {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name}  -- {detail}")


def write_and_run(doc):
    with tempfile.TemporaryDirectory() as t:
        p = os.path.join(t, "d.md")
        w(p, doc)
        return run(p)


def snapshot(root):
    snap = {}
    for dp, _dn, fns in os.walk(root):
        for fn in sorted(fns):
            p = os.path.join(dp, fn)
            with open(p, "rb") as f:
                snap[os.path.relpath(p, root)] = hashlib.sha256(f.read()).hexdigest()
    return snap


def main():
    mod = load_module()

    # ---- valid doc: pass, zero violations, exit 0 ----
    ec, d = write_and_run(build_doc())
    check("valid: exit 0", ec == 0, (ec, d))
    check("valid: status pass", d.get("status") == "pass", d)
    check("valid: zero violations", d.get("violations") == [], d)
    check("valid: JSON shape {status, violations}",
          set(["status", "violations"]).issubset(d.keys()), list(d.keys()))

    # ---- B2 guard: no structural check name asserts 'testable' or 'valid' ----
    check("B2: no check name contains 'testable'/'valid'",
          all("testable" not in c and "valid" not in c for c in mod.STRUCTURAL_CHECKS),
          mod.STRUCTURAL_CHECKS)

    # Each single-mutation doc must fire EXACTLY its one violation class (==, not membership),
    # so an over-firing regression (spurious extra violation) is caught (red-team N1).
    cases = [
        ("no front matter", build_doc(fm=False), "direction:frontmatter"),
        ("wrong kind", build_doc(kind="spec"), "direction:frontmatter"),
        ("missing slug", build_doc(slug=None), "direction:frontmatter"),
        ("no Problem section", build_doc(problem=None), "direction:problem-missing"),
        ("empty Problem", build_doc(problem=""), "direction:problem-missing"),
        ("one option", build_doc(options=1), "direction:options-too-few"),
        ("option without critique", build_doc(drop_critique=True), "direction:option-critique-missing"),
        ("no Chosen", build_doc(chosen=None), "direction:chosen-missing"),
        ("Chosen with only a Rationale (no name)", build_doc(chosen=""), "direction:chosen-missing"),
        ("no Rationale", build_doc(rationale=None), "direction:rationale-missing"),
        ("zero candidate issues", build_doc(candidates=0), "direction:candidate-issue-missing"),
        ("empty acceptance", build_doc(empty_acceptance=True), "direction:acceptance-missing"),
    ]
    for label, doc, expected in cases:
        got = vset(write_and_run(doc)[1])
        check(f"{label} -> exactly [{expected}]", got == [expected], got)

    # ---- B1 regression: code fences are NOT parsed as structure ----
    # FALSE-POSITIVE guard: a VALID doc whose Option A description embeds a fenced block containing a
    # '## ' line must NOT be torn apart (without fence-awareness this orphans Option B / Chosen /
    # Candidate sections and fires bogus violations).
    doc = build_doc().replace(
        "Some description of the option.",
        "Some description of the option.\n```yaml\n## not-a-heading: true\nkey: val\n```", 1)
    ec, d = write_and_run(doc)
    check("fence: a '## ' line inside an option's code fence does NOT break a valid doc",
          ec == 0 and d["status"] == "pass" and d["violations"] == [], (ec, d))

    # the required ## Gate fenced JSON (with no extra structure) also must not trip anything
    ec, d = write_and_run(build_doc())
    check("fence: the required gate ```json block leaves a valid doc clean", ec == 0 and d["violations"] == [], (ec, d))

    # a BROKEN doc whose only 2nd option lives inside a fence must still fire options-too-few
    doc = build_doc(options=1)
    doc = doc.replace("## Options",
                      "## Options\n```text\n### Option B\nCritique: fenced, not real.\n```", 1)
    check("fence: a 2nd option hidden in a fence does NOT satisfy options-too-few",
          vset(write_and_run(doc)[1]) == ["direction:options-too-few"], vset(write_and_run(doc)[1]))

    # a BROKEN doc whose only candidate issue is inside a fence must fire candidate-issue-missing
    doc = build_doc(candidates=0)
    doc = doc.replace("## Candidate issues",
                      "## Candidate issues\n```text\n- fenced | acceptance: not real\n```", 1)
    check("fence: a candidate issue hidden in a fence does NOT satisfy candidate-issue-missing",
          "direction:candidate-issue-missing" in vset(write_and_run(doc)[1]), vset(write_and_run(doc)[1]))

    # ---- any violation exits 1 ----
    ec, _ = write_and_run(build_doc(problem=None))
    check("a violation -> exit 1", ec == 1, ec)

    # ---- unreadable / missing path -> error, exit 2 ----
    with tempfile.TemporaryDirectory() as t:
        ec, d = run(os.path.join(t, "does-not-exist.md"))
        check("missing path -> exit 2", ec == 2, ec)
        check("missing path -> status error", d.get("status") == "error", d)

    # ---- AC-d: the validator writes NOTHING anywhere under .dure/ ----
    with tempfile.TemporaryDirectory() as t:
        dure = os.path.join(t, ".dure")
        w(os.path.join(dure, "directions", "ex.md"), build_doc())
        w(os.path.join(dure, "directions", "bad.md"), build_doc(problem=None))
        w(os.path.join(dure, "config.yml"), "interview:\n  min_rounds: 1\n")
        w(os.path.join(dure, "roadmap", "milestones", "m1.md"),
          "---\nid: m1\ntype: milestone\ntitle: M\nstatus: done\n---\nx\n")
        before = snapshot(dure)
        run(os.path.join(dure, "directions", "ex.md"))    # valid
        run(os.path.join(dure, "directions", "ex.md"))    # twice
        run(os.path.join(dure, "directions", "bad.md"))   # invalid
        after = snapshot(dure)
        check("AC-d: entire .dure/ tree byte-identical before/after (valid + invalid runs)",
              before == after and len(before) == 4, (len(before), before == after))

    # ---- unit: parser splits sections and option blocks ----
    fm, body = mod.split_front_matter(build_doc())
    check("unit: front matter parsed (kind=direction)", fm and fm.get("kind") == "direction", fm)
    secs = mod.split_sections(body)
    check("unit: sections include problem/options/chosen/candidate issues",
          {"problem", "options", "chosen", "candidate issues"}.issubset(secs.keys()), sorted(secs))
    check("unit: two option blocks parsed", len(mod._option_blocks(secs["options"])) == 2,
          list(mod._option_blocks(secs["options"])))

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
