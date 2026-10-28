#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "$0")"

if [[ -z "${CAPTURE_URL:-}" ]]; then
  echo "CAPTURE_URL is required" >&2
  exit 1
fi
if [[ -z "${CAPTURE_DIR:-}" ]]; then
  echo "CAPTURE_DIR is required" >&2
  exit 1
fi

mkdir -p "$CAPTURE_DIR"

echo "== capturing $CAPTURE_URL into $CAPTURE_DIR"
/usr/bin/time -p node capture.mjs
status=$?
echo "== capture exit status: $status"
exit "$status"
