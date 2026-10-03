#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

node "$ROOT/bin/rag-corpus.js" models set embeddings --provider transformers --model Xenova/paraphrase-multilingual-MiniLM-L12-v2 --dimensions 384
