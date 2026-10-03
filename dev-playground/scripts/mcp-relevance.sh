#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
QUERY="${1:-coordinator stalled tasks}"

node -e 'const query = process.argv.slice(1).join(" "); process.stdout.write(JSON.stringify({jsonrpc:"2.0", id:1, method:"tools/call", params:{name:"has_relevant_context", arguments:{query}}}) + "\n")' "$QUERY" \
  | node "$ROOT/bin/rag-corpus.js" mcp stdio synthetic
