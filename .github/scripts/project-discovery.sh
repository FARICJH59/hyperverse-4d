#!/usr/bin/env bash
set -eu

ROOT="${1:-.}"
cd "$ROOT"

detect() {
  [ -e "$1" ] && printf 'YES' || printf 'NO'
}

echo "=== AUTONOMOUS PROJECT DISCOVERY ==="
echo "Repository: $(basename "$(pwd)")"
echo "Commit: $(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
echo

echo "=== PROJECT TYPES ==="
echo "Static web: $(detect index.html)"
echo "Static src web: $(detect src/index.html)"
echo "JavaScript: $(detect package.json)"
echo "TypeScript: $(detect tsconfig.json)"
echo "Python: $(detect pyproject.toml)"
echo "Python requirements: $(detect requirements.txt)"
echo "Rust: $(detect Cargo.toml)"
echo "Docker: $(detect Dockerfile)"
echo "Docker Compose: $(detect docker-compose.yml)"
echo "Next.js indicator: $(grep -rl '"next"[[:space:]]*:' --include=package.json . 2>/dev/null | head -n 1 || true)"
echo "Monorepo indicator: $(detect pnpm-workspace.yaml)"
echo

echo "=== CLOUDFLARE RESOURCES ==="
echo "Wrangler TOML: $(detect wrangler.toml)"
echo "Wrangler JSON: $(detect wrangler.json)"
echo "Wrangler JSONC: $(detect wrangler.jsonc)"
echo "Worker source: $(detect worker/index.js)"
echo "Pages source directory: $(detect src)"
echo "Durable Object migration: $(grep -rl 'new_sqlite_classes\|new_classes\|new_sqlite_class' --include='wrangler.toml' --include='wrangler.json' --include='wrangler.jsonc' . 2>/dev/null | head -n 1 || true)"
echo "D1 indicators: $(grep -rl 'binding.*D1\|database_id\|d1_databases' --include='wrangler.toml' --include='wrangler.json' --include='wrangler.jsonc' . 2>/dev/null | head -n 1 || true)"
echo "KV indicators: $(grep -rl 'kv_namespaces' --include='wrangler.toml' --include='wrangler.json' --include='wrangler.jsonc' . 2>/dev/null | head -n 1 || true)"
echo "R2 indicators: $(grep -rl 'r2_buckets' --include='wrangler.toml' --include='wrangler.json' --include='wrangler.jsonc' . 2>/dev/null | head -n 1 || true)"
echo

echo "=== MIGRATION FILES ==="
find . -maxdepth 4 -type f \( \
  -iname '*migration*' -o \
  -path '*/migrations/*' \
\) ! -path './.git/*' -print

echo
echo "=== PROJECT ROUTING RESULT ==="
if [ -f worker/index.js ] && [ -f wrangler.toml ]; then
  echo "ROUTE: CLOUDFLARE_WORKER"
fi

if [ -f src/index.html ]; then
  echo "ROUTE: STATIC_CLIENT"
fi

if [ -f Cargo.toml ]; then
  echo "ROUTE: RUST_BUILD_TEST"
fi

if [ -f pyproject.toml ] || [ -f requirements.txt ]; then
  echo "ROUTE: PYTHON_BUILD_TEST"
fi

if [ -f Dockerfile ]; then
  echo "ROUTE: CONTAINER_VALIDATION"
fi

echo
echo "=== DISCOVERY COMPLETE ==="
echo "This script is read-only; no deployment or resource mutation performed."
