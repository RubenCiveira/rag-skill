#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
TASK="${1:?task required}"
TEXT="${2:-Agent coordinators monitor stalled tasks and reassign work.}"

node "$ROOT/bin/rag-corpus.js" models run "$TASK" --corpus synthetic --text "$TEXT"
