# rag-corpus

`rag-corpus` is a JavaScript CLI and stdio MCP command for building local RAG corpora in the user's home directory and exposing each corpus to projects as an MCP command.

```text
~/.rag-corpus/
  config.json
  corpora/
    literature/
    programming/
    psychology/
```

Projects do not own the corpora. They only register the MCP command for the corpus they want to use.

## TL;DR

Install locally while developing:

```bash
npm install
npm install -g .
```

Create a corpus and add documents:

```bash
rag-corpus init
rag-corpus create psychology --description "Corpus about psychology, cognition, learning, and behavior." --tag psychology --tag learning
rag-corpus add psychology ~/Documents/psychology-books --recursive
rag-corpus validate psychology
```

Search it from the CLI:

```bash
rag-corpus search psychology "working memory and learning" --top 5
```

Register it as an MCP in a project:

```bash
cd /path/to/project
rag-corpus mcp register psychology --project .
```

Try the development playground:

```bash
cd dev-playground
make reset
make overview
make search QUERY="stalled executor reassignment"
```

## What It Does

- Stores named corpora globally under `~/.rag-corpus/corpora/<name>`.
- Ingests Markdown, text, and PDF documents.
- Chunks documents and stores them in SQLite.
- Generates local multilingual embeddings by default with Transformers.js.
- Uses semantic cosine similarity as the primary retrieval strategy.
- Keeps SQLite FTS/BM25 as lexical fallback.
- Exposes corpus-specific MCP tools over stdio.
- Provides a compact topic tree so agents can inspect corpus coverage before retrieving passages.

## Common Commands

```bash
# Corpus lifecycle
rag-corpus init
rag-corpus create <name> --description "..." --tag tag
rag-corpus list
rag-corpus describe <name>
rag-corpus add <name> <file>
rag-corpus add <name> <directory> --recursive
rag-corpus search <name> "query" --top 6
rag-corpus validate [name]

# MCP
rag-corpus mcp config <corpus>
rag-corpus mcp register <corpus> --project .
rag-corpus mcp stdio <corpus>

# Status helpers
rag-corpus sqlite status
rag-corpus ocr status
rag-corpus models show [--corpus name]
```

Set a different corpus home when testing:

```bash
RAG_CORPUS_HOME=/tmp/rag-corpus-test rag-corpus list
```

## Create A Knowledge Base

1. Initialize storage:

```bash
rag-corpus init
```

2. Create a corpus:

```bash
rag-corpus create agents \
  --description "Corpus about agent design, coordination, planning, and verification." \
  --tag agents \
  --tag planning \
  --tag verification
```

3. Add documents:

```bash
rag-corpus add agents ./notes/agent-coordination.md
rag-corpus add agents ./books-and-pdfs --recursive
```

Supported inputs:

- `.md`
- `.markdown`
- `.txt`
- `.pdf`

4. Validate the result:

```bash
rag-corpus validate agents
```

5. Search the corpus:

```bash
rag-corpus search agents "task reassignment when executors stall" --top 5
```

The generated data lives here:

```text
~/.rag-corpus/corpora/agents/
  corpus.json
  CORPUS.md
  sources/
  index/
    corpus.sqlite
    manifest.json
```

`corpus.sqlite` stores documents, chunks, embeddings, SQLite FTS fallback rows, and taxonomy metadata.

## Add The MCP To A Project

`rag-corpus` runs as a stdio MCP command. It is not a daemon and does not leave a background service running.

1. Check that the corpus exists:

```bash
rag-corpus list
rag-corpus validate agents
```

2. Preview the MCP config:

```bash
rag-corpus mcp config agents
```

Example:

```json
{
  "mcpServers": {
    "rag-corpus-agents": {
      "command": "rag-corpus",
      "args": ["mcp", "stdio", "agents"]
    }
  }
}
```

3. Register it in a project:

```bash
cd /path/to/project
rag-corpus mcp register agents --project .
```

This writes or updates:

```text
.mcp.json
```

4. Test it manually:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}\n' \
  | rag-corpus mcp stdio agents
```

MCP tools exposed per registered corpus:

- `corpus_overview`
- `detail_category`
- `has_relevant_context`
- `describe_corpus`
- `search_corpus`

## Dev Playground

The repository includes a tracked `dev-playground/` with helper scripts and a Makefile. Runtime files stay in ignored `local-playground/`.

```text
dev-playground/
  Makefile
  scripts/

local-playground/        # ignored by git
  docs/                  # put private Markdown/PDF test documents here
  .rag-corpus/           # generated test corpora and SQLite indexes
```

Use it like this:

```bash
cd dev-playground
make help
make reset
make tools
make overview
make detail CATEGORY="agent coordination"
make relevance QUERY="learning objectives feedback"
make search QUERY="stalled tasks verification"
```

`make reset` recreates a synthetic corpus named `synthetic` from `local-playground/docs`. If that directory does not exist, the helper creates a few small Markdown examples. You can add private PDFs to `local-playground/docs` without committing them.

Useful playground diagnostics:

```bash
make sqlite-status
make ocr-status
make models
```

## Storage Layout

Each corpus lives under `~/.rag-corpus/corpora/<name>/`:

```text
corpus.json
CORPUS.md
inbox/
sources/
extracted/
normalized/
index/
  corpus.sqlite
  manifest.json
```

`corpus.json` and `CORPUS.md` describe when the corpus is useful. `index/corpus.sqlite` stores the actual retrieval data.

## Advanced Configuration

Most users should not need this section for normal usage.

### Models

Default embeddings use local Transformers.js:

```bash
rag-corpus models show
rag-corpus models run embeddings --text "stalled task reassignment"
```

Configure model providers per task:

```bash
rag-corpus models set embeddings \
  --provider transformers \
  --model Xenova/paraphrase-multilingual-MiniLM-L12-v2 \
  --dimensions 384

rag-corpus models set translation \
  --provider ollama \
  --model qwen2.5:7b \
  --base-url http://localhost:11434

rag-corpus models set embeddings \
  --provider openai-compatible \
  --model text-embedding-3-small \
  --base-url https://api.openai.com/v1 \
  --api-key-env OPENAI_API_KEY \
  --dimensions 1536
```

Corpus-specific override:

```bash
rag-corpus models set categorization --corpus agents --provider ollama --model llama3.2:3b
rag-corpus models show --corpus agents
```

API keys are not stored directly. Store only the environment variable name with `--api-key-env`.

### SQLite Driver

By default, `rag-corpus` uses Node's built-in `node:sqlite` module.

```bash
rag-corpus sqlite status
```

To use the native `better-sqlite3` driver explicitly:

```bash
npm install better-sqlite3
RAG_CORPUS_SQLITE_DRIVER=better-sqlite3 rag-corpus sqlite status
```

### Ollama

Ollama can be used as a local provider for generation, translation, categorization, or embeddings.

```bash
rag-corpus ollama status
rag-corpus ollama install
rag-corpus ollama start
rag-corpus ollama pull qwen2.5:7b
rag-corpus ollama setup --task translation --model qwen2.5:7b --start --pull
```

`install` is safe by default and prints instructions. On macOS, Homebrew installation only runs when explicitly requested:

```bash
rag-corpus ollama install --method brew --yes
```

### OCR For Scanned PDFs

PDF text extraction uses `pdf-parse` for embedded text. If a PDF appears scanned, `rag-corpus` reports that OCR is required and prints platform-specific native tool installation commands.

```bash
rag-corpus ocr status
rag-corpus ocr install
rag-corpus ocr setup --provider tesseract-native --languages eng,spa --renderer poppler
```

Native OCR expects:

- `tesseract` for OCR.
- language packs such as `eng` and `spa`.
- `pdftoppm` from Poppler to render scanned PDF pages to images.

Typical macOS install commands:

```bash
brew install tesseract
brew install tesseract-lang
brew install poppler
```

Typical Debian/Ubuntu install commands:

```bash
sudo apt-get update
sudo apt-get install -y tesseract-ocr tesseract-ocr-eng tesseract-ocr-spa poppler-utils
```

Typical Windows Chocolatey install commands:

```powershell
choco install tesseract
choco install poppler
```

OCR execution for scanned PDFs is staged behind this configuration/status layer; scanned PDFs are detected and reported clearly instead of being indexed as empty documents.
