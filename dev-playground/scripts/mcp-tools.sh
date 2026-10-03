#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

printf '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n' \
  | node "$ROOT/bin/rag-corpus.js" mcp stdio synthetic
