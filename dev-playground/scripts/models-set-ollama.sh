#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

node "$ROOT/bin/rag-corpus.js" models set translation --provider ollama --model qwen2.5:7b --base-url http://localhost:11434
node "$ROOT/bin/rag-corpus.js" models set categorization --corpus synthetic --provider ollama --model llama3.2:3b --base-url http://localhost:11434
