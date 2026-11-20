#!/usr/bin/env python3
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
PLAN = ROOT / ".github/routing-plan.json"

if not PLAN.exists():
    sys.exit("ERROR: Routing plan missing. Run discovery first.")

plan = json.loads(PLAN.read_text())
results = []

def record(name, passed, detail):
    results.append({
        "check": name,
        "passed": bool(passed),
        "detail": detail
    })
    print(f"{'PASS' if passed else 'FAIL'}: {name} — {detail}")

routes = plan.get("routing_targets", [])
policy = plan.get("policy", {})

record("routing plan present", True, str(PLAN.relative_to(ROOT)))
record(
    "build-only policy",
    policy.get("deployment_authorized") is False,
    "Deployment remains unauthorized"
)

worker = ROOT / "worker/index.js"
html = ROOT / "src/index.html"

record("Worker entrypoint", worker.is_file(), "worker/index.js")
record("Static client entrypoint", html.is_file(), "src/index.html")

node = shutil.which("node")
record("Node availability", bool(node), node or "Node not found")

syntax_files = [
    "worker/index.js",
    "src/engine/core.js",
    "src/engine/math4d.js",
]

if node:
    for relative in syntax_files:
        file = ROOT / relative
        if not file.is_file():
            record(f"JavaScript syntax: {relative}", False, "File missing")
            continue

        result = subprocess.run(
            [node, "--check", str(file)],
            capture_output=True,
            text=True
        )
        detail = result.stderr.strip() or result.stdout.strip() or "Syntax accepted"
        record(f"JavaScript syntax: {relative}", result.returncode == 0, detail)

if "CLOUDFLARE_WORKER" not in routes:
    record("Worker routing target", False, "Worker route missing")
else:
    record("Worker routing target", True, "Worker adapter selected")

if "STATIC_CLIENT" not in routes:
    record("Static routing target", False, "Static route missing")
else:
    record("Static routing target", True, "Static adapter selected")

passed = all(item["passed"] for item in results)

report = {
    "schema_version": "1.0.0",
    "repository": ROOT.name,
    "stage": "BUILD_VALIDATION",
    "adapter": "CLOUDFLARE_WORKER_AND_STATIC_CLIENT",
    "deployment_performed": False,
    "passed": passed,
    "results": results
}

out = ROOT / ".github/build-report.json"
out.write_text(json.dumps(report, indent=2) + "\n")

print("\n=== BUILD VALIDATION SUMMARY ===")
print(f"Result: {'PASS' if passed else 'FAIL'}")
print(f"Checks: {len(results)}")
print(f"Report: {out.relative_to(ROOT)}")
print("Deployment: NOT PERFORMED")

if not passed:
    sys.exit(1)
