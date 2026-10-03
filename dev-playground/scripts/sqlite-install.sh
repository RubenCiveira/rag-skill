#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

node "$ROOT/bin/rag-corpus.js" sqlite install
