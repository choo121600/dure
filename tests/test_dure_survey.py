#!/usr/bin/env python3
"""Tests for dure-survey.py scaffold (i3.1.1) — JSON/exit contract, survey config defaults,
robust loaders, and the empty-project / malformed-front-matter edges.

Signals (closable-milestone i3.1.2, empty-epic i3.1.3) are tested in their own additions; this
file fixes the scaffold contract. Run: python3 tests/test_dure_survey.py   (exit 0 = all pass)
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SURVEY = os.path.join(REPO, "scripts", "dure-survey.py")

CONFIG_NO_SURVEY = """interview:
  ambiguity_threshold: 1.0
  min_rounds: 1
github:
  repo: null
  sync: gh
"""

CONFIG_SURVEY_INFO = CONFIG_NO_SURVEY + """survey:
  fail_on: info
"""

PASS = 0
FAIL = 0


def w(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def load_module():
    spec = importlib.util.spec_from_file_location("dure_survey", SURVEY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def run(root, *args):
    env = dict(os.environ, CLAUDE_PROJECT_DIR=root)
    p = subprocess.run([sys.executable, SURVEY, *args],
                       capture_output=True, text=True, env=env)
    try:
        return p.returncode, json.loads(p.stdout)
    except Exception:
        return p.returncode, {"_stdout": p.stdout, "_stderr": p.stderr}


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok   {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name}  -- {detail}")


def make_repo(base, config=CONFIG_NO_SURVEY, with_roadmap=True):
    d = os.path.join(base, ".dure")
    subs = ["specs", "interview-logs", "sync"]
    if with_roadmap:
        subs += ["roadmap/milestones", "roadmap/epics", "roadmap/issues"]
    for sub in subs:
        os.makedirs(os.path.join(d, sub), exist_ok=True)
    w(os.path.join(d, "config.yml"), config)
    open(os.path.join(d, "active"), "w").close()
    return base


def main():
    mod = load_module()

    # ---- contract on the committed repo: scaffold has no signals -> zero findings, exit 0 ----
    ec, d = run(REPO)
    check("committed: exit=0", ec == 0, (ec, d))
    check("committed: status=pass", d.get("status") == "pass", d)
    check("committed: JSON shape {status,counts,findings}",
          set(["status", "counts", "findings"]).issubset(d.keys()), list(d.keys()))
    check("committed: counts.findings is int", isinstance(d.get("counts", {}).get("findings"), int), d)
    check("committed: zero findings (no signals yet)", d.get("counts", {}).get("findings") == 0, d)
    check("committed: findings is a list", isinstance(d.get("findings"), list), d)

    # ---- config: defaults applied when no survey section ----
    with tempfile.TemporaryDirectory() as t:
        make_repo(t, config=CONFIG_NO_SURVEY)
        ec, d = run(t, "--debug-config")
        check("config default fail_on=error", d.get("survey", {}).get("fail_on") == "error", d)
        check("--debug-config exit=0", ec == 0, ec)

    # ---- config: survey section override ----
    with tempfile.TemporaryDirectory() as t:
        make_repo(t, config=CONFIG_SURVEY_INFO)
        _, d = run(t, "--debug-config")
        check("config override fail_on=info", d.get("survey", {}).get("fail_on") == "info", d)

    # ---- empty/new project: .dure present but no roadmap dir -> 0 findings, exit 0 ----
    with tempfile.TemporaryDirectory() as t:
        make_repo(t, with_roadmap=False)
        ec, d = run(t)
        check("empty-project exit=0", ec == 0, (ec, d))
        check("empty-project status=pass", d.get("status") == "pass", d)
        check("empty-project zero findings", d.get("counts", {}).get("findings") == 0, d)

    # ---- completely bare dir (no .dure at all): must not crash ----
    with tempfile.TemporaryDirectory() as t:
        ec, d = run(t)
        check("bare-dir exit=0", ec == 0, (ec, d))
        check("bare-dir status=pass (not error)", d.get("status") == "pass", d)

    # ---- malformed front matter: the item is silently skipped, run does not crash ----
    with tempfile.TemporaryDirectory() as t:
        make_repo(t)
        # valid milestone + an issue whose YAML front matter is broken (unclosed flow seq)
        w(os.path.join(t, ".dure", "roadmap", "milestones", "m1.md"),
          "---\nid: m1\nslug: m1\ntype: milestone\ntitle: M1\nstatus: doing\n---\nx\n")
        w(os.path.join(t, ".dure", "roadmap", "issues", "i1.md"),
          "---\nid: i1\nlabels: [unclosed, broken\nstatus: : :\n---\nx\n")
        ec, d = run(t)
        check("malformed-fm exit=0 (no crash)", ec == 0, (ec, d))
        check("malformed-fm status=pass (no error, no integrity finding)",
              d.get("status") == "pass", d)
        check("malformed-fm zero findings", d.get("counts", {}).get("findings") == 0, d)

    # ---- unit: compute_exit honors fail_on threshold ----
    check("compute_exit info<error -> 0", mod.compute_exit([{"severity": "info"}], "error") == 0)
    check("compute_exit info>=info -> 1", mod.compute_exit([{"severity": "info"}], "info") == 1)
    check("compute_exit empty -> 0", mod.compute_exit([], "error") == 0)
    check("compute_exit warning>=error -> 0", mod.compute_exit([{"severity": "warning"}], "error") == 0)
    check("compute_exit error>=error -> 1", mod.compute_exit([{"severity": "error"}], "error") == 1)

    # ---- unit: build_report shape ----
    rep = mod.build_report([{"check": "x", "severity": "info"}], 0)
    check("build_report status=pass when exit 0", rep["status"] == "pass", rep)
    check("build_report counts findings=1", rep["counts"]["findings"] == 1, rep)
    check("build_report counts info=1", rep["counts"].get("info") == 1, rep)
    check("build_report status=fail when exit 1",
          mod.build_report([{"check": "x", "severity": "error"}], 1)["status"] == "fail")

    # ---- unit: loaders ----
    with tempfile.TemporaryDirectory() as t:
        items = mod.load_items(t)  # no .dure at all
        check("load_items bare -> empty dicts",
              items == {"milestones": {}, "epics": {}, "issues": {}}, items)
    with tempfile.TemporaryDirectory() as t:
        bad = os.path.join(t, "bad.md")
        w(bad, "---\nid: i1\nlabels: [unclosed\nstatus: : :\n---\nx\n")
        check("_read_front_matter malformed -> {}", mod._read_front_matter(bad) == {})
        good = os.path.join(t, "good.md")
        w(good, "---\nid: m1\nstatus: done\n---\nx\n")
        fm = mod._read_front_matter(good)
        check("_read_front_matter valid -> id", fm.get("id") == "m1", fm)

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
