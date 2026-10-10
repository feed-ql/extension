#!/usr/bin/env bash
# Builds a zip of the loadable extension (no tests, no scripts, no keys). Usage: scripts/pack.sh [out.zip]
set -euo pipefail
cd "$(dirname "$0")/.."
out="${1:-dist/feedql-extension.zip}"
case "$out" in /*) ;; *) out="$PWD/$out";; esac
node --test test/*.test.js >/dev/null
node scripts/icons.mjs
mkdir -p "$(dirname "$out")"
rm -f "$out"
zip -qr "$out" manifest.json src popup offscreen icons _locales -x '*.DS_Store'
echo "$out"
