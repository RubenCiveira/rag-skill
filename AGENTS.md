# Agent Guide

This repository contains `rag-corpus`, a JavaScript/npm CLI and stdio MCP command for managing global local RAG corpora.

## Project Purpose

- Build and query local RAG corpora stored outside project repositories.
- Store corpus data under `~/.rag-corpus/corpora/<name>/` by default.
- Expose each corpus to coding agents through a corpus-specific stdio MCP command.
- Use semantic embeddings as the primary retrieval path, with SQLite FTS/BM25 as fallback.

## Repository Structure

```text
bin/
  rag-corpus.js        # npm binary entrypoint

config/
  embeddings.yaml     # default embeddings configuration
  ingestion.yaml      # extraction/OCR defaults
  retrieval.yaml      # retrieval/storage defaults

lib/
  cli.js              # command routing
  corpus.js           # corpus metadata and lifecycle helpers
  index-store.js      # ingestion pipeline and index writes
  search.js           # semantic and lexical retrieval
  sqlite-store.js     # SQLite schema and driver abstraction
  mcp-server.js       # stdio MCP server
  taxonomy.js         # compact topic tree and relevance helpers
  model-config.js     # global/corpus model configuration
  model-executor.js   # model provider execution
  ollama-local.js     # local Ollama helper commands
  ocr-local.js        # OCR status/setup guidance
  extract.js          # document text extraction
  chunk.js            # chunking logic
  paths.js            # corpus home/path resolution
  fs-utils.js         # filesystem utilities

dev-playground/
  Makefile            # tracked manual testing entrypoint
  scripts/            # tracked playground scripts

local-playground/     # ignored runtime playground data
```

## Runtime Data

- Do not store generated corpora in this repository.
- Default real corpus home is `~/.rag-corpus`.
- Development playground data is ignored under `local-playground/`.
- Use `RAG_CORPUS_HOME` or `--home` for tests that should not touch the user's real corpus home.
- Corpus indexes are SQLite databases at `index/corpus.sqlite`.

## Main Commands

```bash
rag-corpus init
rag-corpus create <name> --description "..." --tag tag
rag-corpus add <name> <file-or-directory> [--recursive]
rag-corpus search <name> "query" --top 5
rag-corpus validate [name]
rag-corpus describe <name>
rag-corpus list
```

MCP commands:

```bash
rag-corpus mcp config <corpus>
rag-corpus mcp register <corpus> --project .
rag-corpus mcp stdio <corpus>
```

Advanced/status commands:

```bash
rag-corpus models show [--corpus name]
rag-corpus sqlite status
rag-corpus ocr status
rag-corpus ollama status
```

## MCP Design

- MCP is stdio command-line only; it is not a daemon.
- Each registered MCP command is bound to one corpus.
- MCP tools do not accept a corpus argument.
- If `rag-corpus mcp stdio` is started without a corpus, it should report that no corpus is registered and expose no useful tools.
- Write operations belong in the CLI, not in MCP tools.

Current MCP tools:

- `corpus_overview`
- `detail_category`
- `has_relevant_context`
- `describe_corpus`
- `search_corpus`

## Retrieval And Storage

- Primary retrieval is semantic cosine similarity over stored embeddings.
- SQLite FTS/BM25 is fallback when embeddings are unavailable.
- Default embeddings provider is Transformers.js.
- Default embeddings model is `Xenova/paraphrase-multilingual-MiniLM-L12-v2` with `384` dimensions.
- Default SQLite driver is Node's built-in `node:sqlite`.
- Optional native SQLite driver is `better-sqlite3`, selected with `RAG_CORPUS_SQLITE_DRIVER=better-sqlite3`.

## OCR And PDFs

- Normal PDFs are extracted with `pdf-parse`.
- Scanned PDFs are detected and reported with OCR setup guidance.
- OCR execution for scanned PDFs is staged and should not silently index empty text.
- Native OCR configuration is exposed through `rag-corpus ocr ...` commands.

## Development Workflow

Install dependencies:

```bash
npm install
```

Run the CLI directly during development:

```bash
node bin/rag-corpus.js --help
```

Use the playground for manual MCP and corpus checks:

```bash
cd dev-playground
make help
make reset
make overview
make search QUERY="stalled executor reassignment"
```

Useful lightweight verification:

```bash
node bin/rag-corpus.js --help
node bin/rag-corpus.js sqlite status
npm pack --dry-run
```

## Editing Guidelines

- Keep changes small and direct.
- Keep user-facing CLI messages in English.
- Prefer updating existing modules over adding new abstractions.
- Do not add backward-compatibility code unless there is a concrete need.
- Do not commit generated corpus data, local playground data, SQLite sidecars, `node_modules`, or model caches.
- Preserve `local-playground/` as ignored runtime data.
- If adding package files that should be published, update `package.json` `files` when needed.
