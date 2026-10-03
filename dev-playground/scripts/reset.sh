#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

ensure_docs_dir
rm -rf "$RAG_CORPUS_HOME"
node "$ROOT/bin/rag-corpus.js" init
node "$ROOT/bin/rag-corpus.js" create synthetic --description "Synthetic test corpus about agents, education, and programming." --tag agents --tag education --tag programming
node "$ROOT/bin/rag-corpus.js" add synthetic "$DOCS_DIR" --recursive
node "$ROOT/bin/rag-corpus.js" validate synthetic
