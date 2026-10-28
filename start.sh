#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"
PORT="${PORT:-3000}"
export PORT

WEB_DIR="${OPENCODE_WEB_DIR:-${RUNNER_TEMP:-/tmp}/omgithub-web}"
mkdir -p "$WEB_DIR"

run() {
  echo "== $*"
  /usr/bin/time -p "$@"
}

deps_stamp="$WEB_DIR/jogofutebol-deps.sha256"
lock_file="package-lock.json"
hash_input="package.json"
if [[ -f "$lock_file" ]]; then
  hash_input="$hash_input $lock_file"
fi
# shellcheck disable=SC2086
current_hash="$(sha256sum $hash_input | sha256sum | cut -d' ' -f1)"
saved_hash=""
if [[ -f "$deps_stamp" ]]; then
  saved_hash="$(cat "$deps_stamp")"
fi

if [[ ! -d node_modules/three ]] || [[ ! -d node_modules/vite ]] || [[ "$saved_hash" != "$current_hash" ]]; then
  if [[ -f "$lock_file" ]]; then
    run npm ci --no-audit --no-fund
  else
    run npm install --no-audit --no-fund
  fi
  printf '%s' "$current_hash" > "$deps_stamp"
else
  echo "== dependencies already installed ($current_hash)"
fi

run npm run build

DIST_DIR="$PROJECT_DIR/dist"
if [[ ! -f "$DIST_DIR/index.html" ]]; then
  echo "Build did not produce $DIST_DIR/index.html" >&2
  exit 1
fi

PROJECT_DIR="$PROJECT_DIR" DIST_DIR="$DIST_DIR" WEB_DIR="$WEB_DIR" run node --input-type=module -e '
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
const out = join(process.env.WEB_DIR, "deployment-output.json")
mkdirSync(process.env.WEB_DIR, { recursive: true })
writeFileSync(out, JSON.stringify({
  project: process.env.PROJECT_DIR,
  directory: process.env.DIST_DIR
}) + "\n")
console.log(out)
'

echo "== serving $DIST_DIR on port $PORT"
exec /usr/bin/time -p node server.mjs
