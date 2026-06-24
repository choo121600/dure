#!/usr/bin/env python3
"""Tests for dure-audit.py.

Covers the scaffold (i2.1.1), each check (i2.1.2-4: todo-marker, untested-script,
done-parent-undone-child), and the formalized AC-a/b/c incl. dure-doctor ownership disjointness
(i2.1.5). Run: python3 tests/test_dure_audit.py   (exit 0 = all pass)
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
AUDIT = os.path.join(REPO, "scripts", "dure-audit.py")

# Load the hyphenated script as a module to unit-test its pure functions.
_spec = importlib.util.spec_from_file_location("dure_audit", AUDIT)
audit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit)

PASS = 0
FAIL = 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok   {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name}  -- {detail}")


def run(root, *args):
    env = dict(os.environ, CLAUDE_PROJECT_DIR=root)
    p = subprocess.run([sys.executable, AUDIT, *args], capture_output=True, text=True, env=env)
    try:
        return p.returncode, json.loads(p.stdout)
    except Exception:
        return p.returncode, {"_stdout": p.stdout, "_stderr": p.stderr}


def main():
    # --- unit: compute_exit (severity/fail_on logic) ---
    ce = audit.compute_exit
    check("empty findings -> 0", ce([], "error") == 0)
    check("warning < fail_on=error -> 0", ce([{"severity": "warning"}], "error") == 0)
    check("warning >= fail_on=warning -> 1", ce([{"severity": "warning"}], "warning") == 1)
    check("error >= fail_on=error -> 1", ce([{"severity": "error"}], "error") == 1)
    check("info >= fail_on=info -> 1", ce([{"severity": "info"}], "info") == 1)
    check("highest severity wins", ce([{"severity": "info"}, {"severity": "error"}], "warning") == 1)

    # --- unit: resolve_config defaults when no audit: section (committed repo's case) ---
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, ".dure"))
        with open(os.path.join(t, ".dure/config.yml"), "w") as f:
            f.write("interview:\n  min_rounds: 1\ngithub:\n  sync: gh\n")
        cfg = audit.resolve_config(t)
        check("default untested_allowlist=[dure-gate]", cfg["untested_allowlist"] == ["dure-gate"], cfg)
        check("default fail_on=error", cfg["fail_on"] == "error", cfg)

    # --- unit: resolve_config honors an audit: section ---
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, ".dure"))
        with open(os.path.join(t, ".dure/config.yml"), "w") as f:
            f.write("audit:\n  untested_allowlist: [foo, bar]\n  fail_on: warning\n")
        cfg = audit.resolve_config(t)
        check("override untested_allowlist", cfg["untested_allowlist"] == ["foo", "bar"], cfg)
        check("override fail_on=warning", cfg["fail_on"] == "warning", cfg)

    # --- unit: malformed/invalid audit values fall back to defaults ---
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, ".dure"))
        with open(os.path.join(t, ".dure/config.yml"), "w") as f:
            f.write("audit:\n  fail_on: bogus\n  untested_allowlist: notalist\n")
        cfg = audit.resolve_config(t)
        check("invalid fail_on -> default error", cfg["fail_on"] == "error", cfg)
        check("non-list allowlist -> default", cfg["untested_allowlist"] == ["dure-gate"], cfg)

    # --- unit: a raising check propagates (main() maps this to status=error/exit 2) ---
    def _boom(root, cfg):
        raise RuntimeError("boom")
    audit.CHECKS.append(_boom)
    try:
        raised = False
        try:
            audit.run_checks(".", {})
        except RuntimeError:
            raised = True
        check("run_checks propagates check exceptions", raised)
    finally:
        audit.CHECKS.pop()

    # --- integration: clean run, JSON shape, exit 0 (no checks registered yet) ---
    with tempfile.TemporaryDirectory() as t:
        ec, d = run(t)
        check("scaffold exit=0", ec == 0, ec)
        check("JSON shape {status,counts,findings}",
              all(k in d for k in ("status", "counts", "findings")), d)
        check("status=pass on clean", d.get("status") == "pass", d)
        check("findings empty for scaffold", d.get("findings") == [], d)

    # --- integration: --debug-config prints resolved defaults ---
    with tempfile.TemporaryDirectory() as t:
        ec, d = run(t, "--debug-config")
        check("debug-config exit=0", ec == 0, ec)
        check("debug-config shows defaults",
              d.get("audit", {}).get("fail_on") == "error", d)

    # --- integration: runs on the committed repo without error ---
    ec, d = run(REPO)
    check("runs on committed repo (exit 0, valid shape)",
          ec == 0 and "findings" in d, (ec, d))

    # --- check i2.1.2: todo-marker ---
    ec, d = run(REPO)
    repo_tm = [f for f in d["findings"] if f["check"] == "todo-marker"]
    check("todo-marker: 0 on committed repo (no real markers; self-source clean)", repo_tm == [], repo_tm)
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, "scripts"))
        with open(os.path.join(t, "scripts/x.py"), "w") as f:
            f.write("# " + "TO" + "DO: wire this up\nprint(1)\n")
        ec, d = run(t)
        tm = [f for f in d["findings"] if f["check"] == "todo-marker"]
        check("todo-marker: finds planted marker", len(tm) == 1, d["findings"])
        check("todo-marker: severity=info + file:line",
              bool(tm) and tm[0]["severity"] == "info"
              and tm[0]["file"] == "scripts/x.py" and tm[0]["line"] == 1, tm)
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, "scripts"))
        with open(os.path.join(t, "scripts/y.py"), "w") as f:
            f.write("status = 'todo'  # lowercase is not a marker\n")
        ec, d = run(t)
        check("todo-marker: lowercase 'todo' ignored (case-sensitive)",
              [f for f in d["findings"] if f["check"] == "todo-marker"] == [], d["findings"])

    # FIXME + nested subdir + multi-match + extension filtering
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, "scripts", "sub"))
        os.makedirs(os.path.join(t, "docs"))
        with open(os.path.join(t, "scripts/sub/z.py"), "w") as f:
            f.write("# " + "FIX" + "ME: nested\nx = 1  # " + "TO" + "DO: second line\n")
        with open(os.path.join(t, "docs/skip.toml"), "w") as f:
            f.write("# " + "TO" + "DO: ignored (extension not scanned)\n")
        ec, d = run(t)
        tm = [f for f in d["findings"] if f["check"] == "todo-marker"]
        check("todo-marker: FIXME + subdir + multi-match -> 2", len(tm) == 2, tm)
        check("todo-marker: nested subdir path reported",
              any(f["file"] == "scripts/sub/z.py" for f in tm), tm)
        check("todo-marker: non-SCAN_EXT (.toml) skipped",
              all(not f["file"].endswith(".toml") for f in tm), tm)

    # --- check i2.1.3: untested-script ---
    ec, d = run(REPO)
    us = [f for f in d["findings"] if f["check"] == "untested-script"]
    check("untested-script: 0 on committed repo (gate allowlisted, others tested)", us == [], us)
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, "scripts"))
        os.makedirs(os.path.join(t, "tests"))
        open(os.path.join(t, "scripts/dure-foo.py"), "w").close()
        ec, d = run(t)
        us = [f for f in d["findings"] if f["check"] == "untested-script"]
        check("untested-script: flags dure-foo.py (warning)",
              len(us) == 1 and us[0]["severity"] == "warning", us)
        check("untested-script: message names test_dure_foo.py",
              bool(us) and "test_dure_foo.py" in us[0]["message"], us)
    with tempfile.TemporaryDirectory() as t:  # allowlisted -> skipped
        os.makedirs(os.path.join(t, "scripts"))
        os.makedirs(os.path.join(t, ".dure"))
        open(os.path.join(t, "scripts/dure-foo.py"), "w").close()
        with open(os.path.join(t, ".dure/config.yml"), "w") as f:
            f.write("audit:\n  untested_allowlist: [dure-foo]\n")
        ec, d = run(t)
        check("untested-script: allowlist skips it",
              [f for f in d["findings"] if f["check"] == "untested-script"] == [], d["findings"])
    with tempfile.TemporaryDirectory() as t:  # hyphen->underscore mapping satisfies
        os.makedirs(os.path.join(t, "scripts"))
        os.makedirs(os.path.join(t, "tests"))
        open(os.path.join(t, "scripts/dure-foo-bar.py"), "w").close()
        open(os.path.join(t, "tests/test_dure_foo_bar.py"), "w").close()
        ec, d = run(t)
        check("untested-script: hyphen->underscore test satisfies",
              [f for f in d["findings"] if f["check"] == "untested-script"] == [], d["findings"])
    with tempfile.TemporaryDirectory() as t:  # .sh utilities are not flagged (only dure-*.py)
        os.makedirs(os.path.join(t, "scripts"))
        open(os.path.join(t, "scripts/dure-helper.sh"), "w").close()
        ec, d = run(t)
        check("untested-script: .sh utilities ignored",
              [f for f in d["findings"] if f["check"] == "untested-script"] == [], d["findings"])
    with tempfile.TemporaryDirectory() as t:  # allowlist tolerates the .py filename form
        os.makedirs(os.path.join(t, "scripts"))
        os.makedirs(os.path.join(t, ".dure"))
        open(os.path.join(t, "scripts/dure-foo.py"), "w").close()
        with open(os.path.join(t, ".dure/config.yml"), "w") as f:
            f.write("audit:\n  untested_allowlist: [dure-foo.py]\n")
        ec, d = run(t)
        check("untested-script: allowlist accepts .py form too",
              [f for f in d["findings"] if f["check"] == "untested-script"] == [], d["findings"])
    with tempfile.TemporaryDirectory() as t:  # no tests/ dir at all -> still flagged, no crash
        os.makedirs(os.path.join(t, "scripts"))
        open(os.path.join(t, "scripts/dure-foo.py"), "w").close()
        ec, d = run(t)
        check("untested-script: no tests/ dir -> flagged, no crash",
              len([f for f in d["findings"] if f["check"] == "untested-script"]) == 1, d["findings"])

    # --- check i2.1.4: done-parent-undone-child ---
    def mk_roadmap(t, m_status, e_status, i_status):
        rd = os.path.join(t, ".dure", "roadmap")
        for sub in ("milestones", "epics", "issues"):
            os.makedirs(os.path.join(rd, sub), exist_ok=True)
        with open(os.path.join(rd, "milestones/m1.md"), "w") as f:
            f.write(f"---\nid: m1\ntype: milestone\ntitle: M\nstatus: {m_status}\nepics: [e1]\n---\n")
        with open(os.path.join(rd, "epics/e1.md"), "w") as f:
            f.write(f"---\nid: e1\ntype: epic\ntitle: E\nstatus: {e_status}\nmilestone: m1\nissues: [i1]\n---\n")
        with open(os.path.join(rd, "issues/i1.md"), "w") as f:
            f.write(f"---\nid: i1\ntype: issue\ntitle: I\nstatus: {i_status}\nmilestone: m1\nepic: e1\n---\n")

    def dp_findings(d):
        return [f for f in d["findings"] if f["check"] == "done-parent-undone-child"]

    ec, d = run(REPO)
    check("done-parent: 0 on committed repo (no done parents)", dp_findings(d) == [], dp_findings(d))
    with tempfile.TemporaryDirectory() as t:  # milestone done, epic undone -> flag on m1
        mk_roadmap(t, "done", "todo", "todo")
        dp = dp_findings(run(t)[1])
        check("done-parent: milestone done + epic undone flagged on m1",
              any(f["id"] == "m1" and f["severity"] == "warning" for f in dp), dp)
    with tempfile.TemporaryDirectory() as t:  # epic done, issue undone -> flag on e1
        mk_roadmap(t, "doing", "done", "blocked")
        dp = dp_findings(run(t)[1])
        check("done-parent: epic done + issue undone flagged on e1",
              any(f["id"] == "e1" for f in dp), dp)
    with tempfile.TemporaryDirectory() as t:  # all done -> no finding
        mk_roadmap(t, "done", "done", "done")
        check("done-parent: all done -> none", dp_findings(run(t)[1]) == [], "expected none")
    with tempfile.TemporaryDirectory() as t:  # parent not done -> none (no false positive)
        mk_roadmap(t, "doing", "todo", "todo")
        check("done-parent: undone parent -> none", dp_findings(run(t)[1]) == [], "expected none")
    with tempfile.TemporaryDirectory() as t:  # done parent referencing a MISSING child -> not flagged (doctor's domain)
        rd = os.path.join(t, ".dure", "roadmap")
        os.makedirs(os.path.join(rd, "milestones"))
        os.makedirs(os.path.join(rd, "epics"))
        os.makedirs(os.path.join(rd, "issues"))
        with open(os.path.join(rd, "milestones/m1.md"), "w") as f:
            f.write("---\nid: m1\ntype: milestone\ntitle: M\nstatus: done\nepics: [eX]\n---\n")
        check("done-parent: missing child not flagged (disjoint from doctor)",
              dp_findings(run(t)[1]) == [], "expected none")

    # fallback front-matter parser handles block lists (no-PyYAML parity)
    _saved = audit.HAVE_YAML
    try:
        audit.HAVE_YAML = False
        with tempfile.TemporaryDirectory() as t:
            p = os.path.join(t, "m.md")
            with open(p, "w") as f:
                f.write("---\nid: m1\nepics:\n  - e1\n  - e2\nstatus: done\n---\nbody\n")
            fm = audit._read_front_matter(p)
            check("fallback parses block list", fm.get("epics") == ["e1", "e2"], fm)
            check("fallback parses scalar after block list", fm.get("status") == "done", fm)
    finally:
        audit.HAVE_YAML = _saved

    # === issue i2.1.5: formalized AC-a / AC-b / AC-c (incl. dure-doctor disjointness) ===
    DOCTOR = os.path.join(REPO, "scripts", "dure-doctor.py")

    # AC-a — exit-code contract: a warning is advisory (exit 0) by default; exit 1 when fail_on lowered.
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, "scripts"))
        os.makedirs(os.path.join(t, ".dure"))
        open(os.path.join(t, "scripts/dure-foo.py"), "w").close()  # -> untested-script (warning)
        ec0, d0 = run(t)
        check("AC-a: warning finding is advisory (exit 0) by default *despite* a finding",
              ec0 == 0 and d0["status"] == "pass" and len(d0["findings"]) == 1,
              (ec0, d0["status"], len(d0["findings"])))
        with open(os.path.join(t, ".dure/config.yml"), "w") as f:
            f.write("audit:\n  fail_on: warning\n")
        ec1, d1 = run(t)
        check("AC-a: lowering fail_on=warning flips exit to 1 (status fail)",
              ec1 == 1 and d1["status"] == "fail", (ec1, d1["status"]))

    # AC-b — zero false positives across ALL checks on the committed repo.
    ec, d = run(REPO)
    check("AC-b: committed repo -> 0 findings, status pass, exit 0",
          ec == 0 and d["status"] == "pass" and d["findings"] == [],
          (ec, d["status"], len(d["findings"])))

    # AC-c — audit's check-classes are disjoint from dure-doctor's.
    with tempfile.TemporaryDirectory() as t:  # one fixture triggering all three audit checks
        os.makedirs(os.path.join(t, "scripts"))
        os.makedirs(os.path.join(t, "docs"))
        rd = os.path.join(t, ".dure", "roadmap")
        for sub in ("milestones", "epics", "issues"):
            os.makedirs(os.path.join(rd, sub))
        open(os.path.join(t, "scripts/dure-foo.py"), "w").close()              # untested-script
        with open(os.path.join(t, "docs/note.md"), "w") as f:
            f.write("# " + "TO" + "DO: x\n")                                    # todo-marker
        with open(os.path.join(rd, "milestones/m1.md"), "w") as f:
            f.write("---\nid: m1\ntype: milestone\ntitle: M\nstatus: done\nepics: [e1]\n---\n")
        with open(os.path.join(rd, "epics/e1.md"), "w") as f:
            f.write("---\nid: e1\ntype: epic\ntitle: E\nstatus: todo\nmilestone: m1\n---\n")  # done-parent
        audit_classes = {f["check"] for f in run(t)[1]["findings"]}
    with tempfile.TemporaryDirectory() as t2:  # bare .dure provokes known doctor classes deterministically
        os.makedirs(os.path.join(t2, ".dure"))  # missing subdirs/config/active -> struct:*/config:*/active:*
        denv = dict(os.environ, CLAUDE_PROJECT_DIR=t2)
        dd = json.loads(subprocess.run([sys.executable, DOCTOR], capture_output=True, text=True, env=denv).stdout)
    doctor_classes = {v["check"] for v in dd.get("violations", [])} | {w["check"] for w in dd.get("warnings", [])}
    check("AC-c: audit emits exactly its three check-classes",
          audit_classes == {"todo-marker", "untested-script", "done-parent-undone-child"}, audit_classes)
    check("AC-c: audit and dure-doctor check-classes are disjoint",
          bool(audit_classes) and bool(doctor_classes) and audit_classes.isdisjoint(doctor_classes),
          (sorted(audit_classes), sorted(doctor_classes)))

    # === issue i2.2.2: --suggest (draft issue stubs from findings) ===
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, "scripts"))
        open(os.path.join(t, "scripts/dure-foo.py"), "w").close()  # untested-script (warning)
        _, d = run(t)
        check("no --suggest -> no suggestions key", "suggestions" not in d, list(d))
        _, ds = run(t, "--suggest")
        sug = ds.get("suggestions", [])
        check("--suggest: untested-script -> 1 suggestion",
              len(sug) == 1 and sug[0]["check"] == "untested-script", sug)
        check("--suggest: stub has title + non-empty acceptance",
              bool(sug) and "Add tests" in sug[0]["title"] and len(sug[0]["acceptance"]) >= 1, sug)
    with tempfile.TemporaryDirectory() as t:  # info-only findings are NOT suggested
        os.makedirs(os.path.join(t, "docs"))
        with open(os.path.join(t, "docs/n.md"), "w") as f:
            f.write("# " + "TO" + "DO: x\n")
        _, ds = run(t, "--suggest")
        check("--suggest: info findings not suggested", ds.get("suggestions") == [], ds.get("suggestions"))
    with tempfile.TemporaryDirectory() as t:  # done-parent -> reconcile stub
        mk_roadmap(t, "done", "todo", "todo")
        sug = run(t, "--suggest")[1].get("suggestions", [])
        check("--suggest: done-parent -> reconcile stub",
              any(s["check"] == "done-parent-undone-child" and "Reconcile" in s["title"] for s in sug), sug)
    _, ds = run(REPO, "--suggest")  # committed repo: no warning+ findings -> no suggestions
    check("--suggest: committed repo -> 0 suggestions", ds.get("suggestions") == [], ds.get("suggestions"))

    print(f"\n{PASS} passed, {FAIL} failed")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
