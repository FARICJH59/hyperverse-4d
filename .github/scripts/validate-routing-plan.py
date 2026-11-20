#!/usr/bin/env python3
import json
import sys
from pathlib import Path

path = Path(sys.argv[1] if len(sys.argv) > 1 else ".github/routing-plan.json")
plan = json.loads(path.read_text())

checks = {
    "schema version": plan.get("schema_version") == "1.0.0",
    "worker route": "CLOUDFLARE_WORKER" in plan.get("routing_targets", []),
    "static route": "STATIC_CLIENT" in plan.get("routing_targets", []),
    "javascript detected": plan.get("project_types", {}).get("javascript") is True,
    "python not falsely detected": plan.get("project_types", {}).get("python") is False,
    "durable object binding": any(
        item.get("binding") == "SHARD"
        for item in plan.get("cloudflare_resources", {}).get("durable_objects", [])
    ),
    "deployment denied": plan.get("policy", {}).get("deployment_authorized") is False,
    "production mutation denied": plan.get("policy", {}).get("production_mutation_authorized") is False,
    "secrets access denied": plan.get("policy", {}).get("secrets_access_authorized") is False,
}

print("=== ROUTING PLAN VALIDATION ===")
failed = False

for name, passed in checks.items():
    print(f"{'PASS' if passed else 'FAIL'}: {name}")
    if not passed:
        failed = True

if failed:
    sys.exit(1)

print("\nAll routing-plan checks passed.")
