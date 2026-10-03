#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
MODEL="${MODEL:-qwen2.5:7b}"

node "$ROOT/bin/rag-corpus.js" ollama setup --task translation --model "$MODEL"
