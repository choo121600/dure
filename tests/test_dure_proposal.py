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
DOCTOR = os.path.join(REPO, "scripts", "dure-doctor.py")
AUDIT = os.path.join(REPO, "scripts", "dure-audit.py")
SURVEY = os.path.join(REPO, "scripts", "dure-survey.py")

PASS = 0
FAIL = 0


def w(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def mkitem(base, kind, iid, status, **extra):
    """Write a roadmap per-item file (for the survey disjointness fixture)."""
    fm = [f"id: {iid}", f"slug: {iid}", f"type: {kind[:-1]}", f"title: {iid.upper()}",
          f"status: {status}", "github: null"]
    for k, v in extra.items():
        fm.append(f"{k}: {v}")
    w(os.path.join(base, ".dure", "roadmap", kind, f"{iid}.md"),
      "---\n" + "\n".join(fm) + "\n---\nbody\n")


def load_module():
    spec = importlib.util.spec_from_file_location("dure_proposal", PROPOSAL)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def build_doc(fm=True, slug="ex", kind="direction", problem="A real problem worth solving.",
              options=2, drop_critique=False, chosen="Option A", rationale="Deterministic core wins.",
              candidates=2, empty_acceptance=False,
              gate=('{"gate": "PASS", "run_level_max": 0.571, "threshold": 1.0, "round": 3, '
                    '"per_component": [{"name": "x", "weighted_ambiguity": 0.571, '
                    '"testable_signoff": "pass"}], "failed": []}')):
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

    # ============================ embedded-gate validation (i3.2.2) ============================
    # a real, full-shape PASS block (build_doc default) does NOT fire gate-not-pass
    check("gate: real full PASS block is accepted",
          "direction:gate-not-pass" not in vset(write_and_run(build_doc())[1]),
          vset(write_and_run(build_doc())[1]))

    GOOD = ('{"gate": "PASS", "run_level_max": 0.5, "threshold": 1.0, "round": 3, '
            '"per_component": [{"name": "x", "weighted_ambiguity": 0.5, "testable_signoff": "pass"}], '
            '"failed": []}')
    gate_cases = [
        ("bare stub {gate:PASS}", '{"gate": "PASS"}'),
        ("PASS but failed non-empty (inconsistent)",
         GOOD.replace('"failed": []', '"failed": ["cond1: x"]')),
        ("gate BLOCK", GOOD.replace('"gate": "PASS"', '"gate": "BLOCK"')),
        ("missing per_component",
         '{"gate": "PASS", "run_level_max": 0.5, "threshold": 1.0, "failed": []}'),
        ("per_component empty list",
         GOOD.replace('[{"name": "x", "weighted_ambiguity": 0.5, "testable_signoff": "pass"}]', "[]")),
        ("per_component lacks testable_signoff",
         GOOD.replace(', "testable_signoff": "pass"', "")),
        ("per_component lacks weighted_ambiguity",
         GOOD.replace('"weighted_ambiguity": 0.5, ', "")),
        ("per_component lacks name", GOOD.replace('"name": "x", ', "")),
        ("not JSON", "this is not json at all"),
        # PASS invariants a real gate run can never violate (red-team findings 1-2)
        ("testable_signoff fail under PASS",
         GOOD.replace('"testable_signoff": "pass"', '"testable_signoff": "fail"')),
        ("run_level_max above threshold under PASS",
         GOOD.replace('"run_level_max": 0.5', '"run_level_max": 5.0')
             .replace('"weighted_ambiguity": 0.5', '"weighted_ambiguity": 5.0')),
        ("run_level_max disagrees with component max",
         GOOD.replace('"run_level_max": 0.5', '"run_level_max": 0.9')),
    ]
    for label, gate in gate_cases:
        got = vset(write_and_run(build_doc(gate=gate))[1])
        check(f"gate: {label} -> direction:gate-not-pass", got == ["direction:gate-not-pass"], got)

    # a human-readable prose fence BEFORE the json block is tolerated (extractor scans all fences)
    doc = build_doc().replace("## Gate\n```json",
                              "## Gate\n```text\nhuman summary, not json\n```\n```json")
    ec, d = write_and_run(doc)
    check("gate: a prose fence before the json block is tolerated",
          ec == 0 and d["violations"] == [], (ec, d))

    # no ## Gate section at all -> gate-not-pass
    check("gate: missing ## Gate section -> gate-not-pass",
          vset(write_and_run(build_doc(gate=None))[1]) == ["direction:gate-not-pass"],
          vset(write_and_run(build_doc(gate=None))[1]))

    # ALL_CHECKS includes the gate class (used by the i3.2.3 disjointness test)
    check("ALL_CHECKS includes direction:gate-not-pass",
          "direction:gate-not-pass" in mod.ALL_CHECKS, mod.ALL_CHECKS)

    # ===================== AC-e: five-way ownership disjointness (i3.2.3) =====================
    def run_env_classes(script, root):
        env = dict(os.environ, CLAUDE_PROJECT_DIR=root)
        out = subprocess.run([sys.executable, script], capture_output=True, text=True, env=env).stdout
        try:
            data = json.loads(out)
        except Exception:
            return set()
        cs = {f.get("check") for f in data.get("findings", [])}
        cs |= {v.get("check") for v in data.get("violations", [])}
        cs |= {w.get("check") for w in data.get("warnings", [])}
        return {c for c in cs if c}

    # direction:* — enumerate the set the validator ACTUALLY emits across targeted fixtures,
    # and assert it equals the declared ALL_CHECKS (declared == emitted, no drift).
    emit_fixtures = [build_doc(fm=False), build_doc(problem=None), build_doc(options=1),
                     build_doc(drop_critique=True), build_doc(chosen=None), build_doc(rationale=None),
                     build_doc(candidates=0), build_doc(empty_acceptance=True),
                     build_doc(gate='{"gate": "PASS"}')]
    direction_classes = set()
    for doc in emit_fixtures:
        direction_classes |= set(vset(write_and_run(doc)[1]))
    check("AC-e: emitted direction:* == declared ALL_CHECKS",
          direction_classes == set(mod.ALL_CHECKS) and len(direction_classes) == 9,
          (sorted(direction_classes), sorted(mod.ALL_CHECKS)))
    check("AC-e: every direction class uses the 'direction:' namespace",
          all(c.startswith("direction:") for c in direction_classes), sorted(direction_classes))

    # audit's 4 implemented classes
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, "scripts"))
        os.makedirs(os.path.join(t, "docs"))
        for sub in ("milestones", "epics", "issues"):
            os.makedirs(os.path.join(t, ".dure", "roadmap", sub))
        os.makedirs(os.path.join(t, ".dure", "interview-logs"))
        open(os.path.join(t, "scripts/dure-foo.py"), "w").close()
        w(os.path.join(t, "docs/note.md"), "# " + "TO" + "DO: x\n")
        w(os.path.join(t, ".dure/roadmap/milestones/m1.md"),
          "---\nid: m1\ntype: milestone\ntitle: M\nstatus: done\nepics: [e1]\n---\n")
        w(os.path.join(t, ".dure/roadmap/epics/e1.md"),
          "---\nid: e1\ntype: epic\ntitle: E\nstatus: todo\nmilestone: m1\n---\n")
        w(os.path.join(t, ".dure/interview-logs/x.md"),
          "---\nslug: x\ntitle: X\nstatus: in-progress\n---\n")
        audit_classes = run_env_classes(AUDIT, t)

    # survey's 2 classes
    with tempfile.TemporaryDirectory() as t:
        for sub in ("milestones", "epics", "issues"):
            os.makedirs(os.path.join(t, ".dure", "roadmap", sub))
        mkitem(t, "milestones", "m1", "doing", epics="[e1]")
        mkitem(t, "epics", "e1", "done", milestone="m1", issues="[i1]")
        mkitem(t, "issues", "i1", "done", milestone="m1", epic="e1")
        mkitem(t, "milestones", "m2", "done", epics="[e2]")
        mkitem(t, "epics", "e2", "todo", milestone="m2")
        survey_classes = run_env_classes(SURVEY, t)

    # doctor's classes (bare .dure + a rich roadmap fixture)
    doctor_classes = set()
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, ".dure"))
        doctor_classes |= run_env_classes(DOCTOR, t)
    with tempfile.TemporaryDirectory() as t:
        for sub in ("milestones", "epics", "issues"):
            os.makedirs(os.path.join(t, ".dure", "roadmap", sub))
        os.makedirs(os.path.join(t, ".dure", "specs"))
        os.makedirs(os.path.join(t, ".dure", "interview-logs"))
        w(os.path.join(t, ".dure", "config.yml"), "interview:\n  min_rounds: 1\n")
        open(os.path.join(t, ".dure", "active"), "w").close()
        w(os.path.join(t, ".dure/roadmap/milestones/m1.md"),
          "---\nid: m1\nslug: m1\ntype: milestone\ntitle: M1\nstatus: doing\nepics: [e1, eX]\n---\nx\n")
        w(os.path.join(t, ".dure/roadmap/epics/e1.md"),
          "---\nid: e1\nslug: e1\ntype: epic\nstatus: todo\nmilestone: m1\n---\nx\n")
        doctor_classes |= run_env_classes(DOCTOR, t)

    STATUS_FIELDS = {"overall", "milestones", "blockers", "conflicts", "completion"}
    others = audit_classes | survey_classes | doctor_classes | STATUS_FIELDS
    check("AC-e: comparison sets are non-empty (no vacuous pass)",
          bool(direction_classes) and bool(audit_classes) and bool(survey_classes)
          and bool(doctor_classes), (len(audit_classes), len(survey_classes), len(doctor_classes)))
    check("AC-e: direction:* disjoint from doctor/audit/survey/status (five-way)",
          direction_classes.isdisjoint(others), sorted(direction_classes & others))
    check("AC-e: no other tool uses the 'direction:' namespace",
          not any(c.startswith("direction:") for c in others), sorted(c for c in others if c.startswith("direction:")))

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
