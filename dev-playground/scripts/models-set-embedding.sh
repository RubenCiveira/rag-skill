#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

node "$ROOT/bin/rag-corpus.js" models set embeddings --provider openai-compatible --model text-embedding-3-small --base-url https://api.openai.com/v1 --api-key-env OPENAI_API_KEY --dimensions 1536
