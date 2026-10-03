#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLAYGROUND="$ROOT/local-playground"
DOCS_DIR="$PLAYGROUND/docs"
export RAG_CORPUS_HOME="$PLAYGROUND/.rag-corpus"

ensure_docs_dir() {
  if [[ ! -d "$DOCS_DIR" ]]; then
    mkdir -p "$DOCS_DIR"
    cat > "$DOCS_DIR/agents.md" <<'DOC'
# Agent Coordination Notes

Coordinators supervise executors, monitor stalled tasks, and reassign work when progress signals disappear. Useful mechanisms include task leases, heartbeat checks, explicit success criteria, and escalation rules.

Planning workflows should decompose goals into bounded subtasks. Replanning happens when execution evidence contradicts the original plan.

Verification should be separated from execution. Evaluators compare partial outputs against success criteria and preserve provenance for every decision.
DOC
    cat > "$DOCS_DIR/education.md" <<'DOC'
# Learning Design Notes

Educational systems need clear learning objectives, formative assessment, feedback loops, and scaffolding. Cognitive load should be controlled by sequencing concepts from simple to complex.

Tutoring agents should diagnose misconceptions, adapt explanations, and ask questions that reveal student understanding.
DOC
    cat > "$DOCS_DIR/programming.md" <<'DOC'
# Programming Practice Notes

Software projects benefit from small cohesive modules, automated tests, code review, and explicit interfaces. Debugging requires reproduction steps, hypotheses, instrumentation, and verification.
DOC
  fi
}
