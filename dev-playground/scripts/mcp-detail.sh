#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
CATEGORY="${1:-}"

node -e 'const category = process.argv[1] || ""; process.stdout.write(JSON.stringify({jsonrpc:"2.0", id:1, method:"tools/call", params:{name:"detail_category", arguments:{category}}}) + "\n")' "$CATEGORY" \
  | node "$ROOT/bin/rag-corpus.js" mcp stdio synthetic
