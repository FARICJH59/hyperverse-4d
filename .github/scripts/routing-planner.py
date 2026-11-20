#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path

try:
    import tomllib
except ImportError:
    tomllib = None

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
EXCLUDED = {".git", "node_modules", "vendor", ".venv", "dist", "build"}
files = []

for base, dirs, names in os.walk(ROOT):
    dirs[:] = [d for d in dirs if d not in EXCLUDED]
    for name in names:
        path = Path(base) / name
        files.append(path.relative_to(ROOT).as_posix())

def exists(path):
    return path in files

def matches_suffix(suffix):
    return [f for f in files if f.endswith(suffix) and not f.startswith(".github/scripts/")]

manifest_files = [
    f for f in files
    if f.endswith("package.json")
    or f.endswith("pyproject.toml")
    or f.endswith("Cargo.toml")
]

project_types = {
    "javascript": bool(matches_suffix(".js") or matches_suffix(".mjs") or matches_suffix(".cjs")),
    "typescript": bool(matches_suffix(".ts") or matches_suffix(".tsx")),
    "python": bool(matches_suffix(".py")),
    "rust": bool(matches_suffix(".rs") or exists("Cargo.toml")),
    "static_web": bool(
        exists("index.html") or
        exists("src/index.html")
    ),
    "docker": bool(
        exists("Dockerfile") or
        any(f.endswith("/Dockerfile") for f in files)
    ),
    "docker_compose": bool(
        exists("docker-compose.yml") or
        exists("docker-compose.yaml") or
        exists("compose.yml") or
        exists("compose.yaml")
    ),
    "nextjs": False,
    "monorepo": bool(
        exists("pnpm-workspace.yaml") or
        exists("lerna.json") or
        exists("nx.json")
    )
}

for manifest in [f for f in files if f.endswith("package.json")]:
    try:
        data = json.loads((ROOT / manifest).read_text())
        if "next" in data.get("dependencies", {}) or "next" in data.get("devDependencies", {}):
            project_types["nextjs"] = True
    except Exception:
        pass

configs = []
resources = {
    "workers": [],
    "durable_objects": [],
    "d1": [],
    "kv": [],
    "r2": [],
    "pages": []
}

for config_name in ["wrangler.toml", "wrangler.json", "wrangler.jsonc"]:
    if not exists(config_name):
        continue

    config_path = ROOT / config_name
    configs.append(config_name)
    data = {}

    try:
        if config_name.endswith(".toml") and tomllib:
            data = tomllib.loads(config_path.read_text())
        elif config_name.endswith(".json"):
            data = json.loads(config_path.read_text())
    except Exception as exc:
        print(f"CONFIG WARNING: {config_name}: {exc}", file=sys.stderr)

    if data.get("main"):
        resources["workers"].append({
            "config": config_name,
            "entrypoint": data["main"]
        })

    bindings = data.get("durable_objects", {}).get("bindings", [])
    for binding in bindings:
        resources["durable_objects"].append({
            "binding": binding.get("name"),
            "class_name": binding.get("class_name"),
            "config": config_name
        })

    migrations = data.get("migrations", [])
    for migration in migrations:
        for class_name in migration.get("new_classes", []):
            resources["durable_objects"].append({
                "migration_tag": migration.get("tag"),
                "class_name": class_name,
                "type": "new_classes"
            })
        for class_name in migration.get("new_sqlite_classes", []):
            resources["durable_objects"].append({
                "migration_tag": migration.get("tag"),
                "class_name": class_name,
                "type": "new_sqlite_classes"
            })

    for db in data.get("d1_databases", []):
        resources["d1"].append({
            "binding": db.get("binding"),
            "database_name": db.get("database_name")
        })

    for kv in data.get("kv_namespaces", []):
        resources["kv"].append({
            "binding": kv.get("binding")
        })

    for bucket in data.get("r2_buckets", []):
        resources["r2"].append({
            "binding": bucket.get("binding"),
            "bucket_name": bucket.get("bucket_name")
        })

    if data.get("pages_build_output_dir"):
        resources["pages"].append({
            "config": config_name,
            "directory": data["pages_build_output_dir"]
        })

if exists("src/index.html"):
    resources["pages"].append({
        "source": "src",
        "type": "static_client_candidate"
    })

routes = []

if resources["workers"]:
    routes.append("CLOUDFLARE_WORKER")

if resources["pages"] or project_types["static_web"]:
    routes.append("STATIC_CLIENT")

if project_types["python"]:
    routes.append("PYTHON_BUILD_TEST")

if project_types["rust"]:
    routes.append("RUST_BUILD_TEST")

if project_types["docker"]:
    routes.append("CONTAINER_VALIDATION")

plan = {
    "schema_version": "1.0.0",
    "repository": ROOT.name,
    "project_types": project_types,
    "configurations": configs,
    "cloudflare_resources": resources,
    "routing_targets": routes,
    "policy": {
        "discovery_only": True,
        "deployment_authorized": False,
        "production_mutation_authorized": False,
        "secrets_access_authorized": False
    }
}

output = ROOT / ".github" / "routing-plan.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(plan, indent=2) + "\n")

print("=== STRUCTURED ROUTING PLAN ===")
print(json.dumps(plan, indent=2))
print(f"\nPLAN FILE: {output.relative_to(ROOT)}")
print("Deployment authorization: DENIED (discovery-only)")
