#!/usr/bin/env python3
"""dure-gate.py — deep-interview convergence gate (I1.2.1 scoring + I1.2.5 anti-gaming guard).

Fixes the *arithmetic and condition checks* of convergence in code. The model only submits
honest scores and a critic sign-off; it cannot pass merely by declaring "converged"
(spec §4.4, critique C3, ADR-0005).

stdin  : JSON
  {
    "round": 3,
    "components": [
      {"name": "...", "scores": {"problem":1,"scope":0,"acceptance":1,
                                  "constraints":0,"edge":1,"stakeholders":0},
       "testable_signoff": "pass"}            # redteam-critic sign-off (pass|fail)
    ],
    "new_ambiguity_last_round": 0,            # number of new ambiguities in the previous round
    "blocking_open_questions": 0
  }
config : <root>/.dure/config.yml  (dimension_weights, ambiguity_threshold, min_rounds)
stdout : JSON {gate, run_level_max, run_level_mean, per_component, failed[...]}
exit   : 0 PASS · 1 BLOCK · 2 error
"""
import json
import os
import re
import sys

DIMS = ["problem", "scope", "acceptance", "constraints", "edge", "stakeholders"]
DEFAULT_WEIGHTS = {"problem": 3, "scope": 3, "acceptance": 3,
                   "constraints": 2, "edge": 2, "stakeholders": 1}
DEFAULT_THRESHOLD = 1.0
DEFAULT_MIN_ROUNDS = 1


def load_config(root):
    """Minimal parse of weights/threshold/min_rounds from config.yml (no PyYAML dependency)."""
    weights = dict(DEFAULT_WEIGHTS)
    threshold, min_rounds = DEFAULT_THRESHOLD, DEFAULT_MIN_ROUNDS
    path = os.path.join(root, ".dure", "config.yml")
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.readlines()
    except OSError:
        return weights, threshold, min_rounds

    in_weights, weights_indent = False, -1
    for raw in lines:
        line = re.sub(r"\s+#.*$", "", raw.rstrip("\n"))  # strip comments
        if not line.strip():
            continue
        m = re.match(r"^(\s*)([\w.-]+):\s*(.*)$", line)
        if not m:
            continue
        indent, key, val = len(m.group(1)), m.group(2), m.group(3).strip()
        if key == "dimension_weights" and val == "":
            in_weights, weights_indent = True, indent
            continue
        if in_weights:
            if indent > weights_indent and key in DIMS and val != "":
                try:
                    weights[key] = float(val)
                except ValueError:
                    pass
                continue
            in_weights = False
        if key == "ambiguity_threshold" and val != "":
            try:
                threshold = float(val)
            except ValueError:
                pass
        elif key == "min_rounds" and val != "":
            try:
                min_rounds = int(float(val))
            except ValueError:
                pass
    return weights, threshold, min_rounds


def weighted_ambiguity(scores, weights):
    num = den = 0.0
    for d in DIMS:
        w = float(weights.get(d, 0))
        num += w * float(scores.get(d, 0))
        den += w
    return (num / den) if den else 0.0


def main():
    root = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
    try:
        payload = json.load(sys.stdin)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"error": f"bad json on stdin: {e}"}))
        sys.exit(2)

    weights, threshold, min_rounds = load_config(root)
    comps = payload.get("components", [])

    per = []
    for c in comps:
        wa = weighted_ambiguity(c.get("scores", {}), weights)
        per.append({
            "name": c.get("name", "?"),
            "weighted_ambiguity": round(wa, 3),
            "testable_signoff": c.get("testable_signoff", "fail"),
        })

    run_max = max((p["weighted_ambiguity"] for p in per), default=0.0)
    run_mean = round(sum(p["weighted_ambiguity"] for p in per) / len(per), 3) if per else 0.0
    rnd = int(payload.get("round", 0))
    new_amb = int(payload.get("new_ambiguity_last_round", 1))
    blocking = int(payload.get("blocking_open_questions", 1))

    failed = []
    # cond1 — run-level (weakest component) weighted ambiguity <= threshold
    if run_max > threshold:
        failed.append(f"cond1: run_level_max {run_max:.3f} > threshold {threshold}")
    # cond2 — every component has a critic 'testable' sign-off (the core anti-gaming guard)
    not_signed = [p["name"] for p in per if p["testable_signoff"] != "pass"]
    if not per:
        failed.append("cond2: no components to sign off")
    elif not_signed:
        failed.append(f"cond2: critic signoff missing -> {not_signed}")
    # cond3 — zero blocking open questions
    if blocking != 0:
        failed.append(f"cond3: {blocking} blocking open question(s)")
    # cond4 — minimum rounds & zero new ambiguity in the previous round
    if rnd < min_rounds:
        failed.append(f"cond4: round {rnd} < min_rounds {min_rounds}")
    if new_amb != 0:
        failed.append(f"cond4: new_ambiguity_last_round {new_amb} != 0")

    gate = "PASS" if not failed else "BLOCK"
    print(json.dumps({
        "gate": gate,
        "run_level_max": round(run_max, 3),
        "run_level_mean": run_mean,
        "threshold": threshold,
        "min_rounds": min_rounds,
        "round": rnd,
        "per_component": per,
        "failed": failed,
    }, ensure_ascii=False, indent=2))
    sys.exit(0 if gate == "PASS" else 1)


if __name__ == "__main__":
    main()
