# rag-corpus

`rag-corpus` is a JavaScript CLI and stdio MCP command for managing multiple local RAG corpora stored in the user's home directory.

The intended model is:

```text
~/.rag-corpus/
  config.json
  corpora/
    literatura/
    programacion/
    psicologia/
```

Projects do not own the corpora. Projects register the MCP command and query whichever global corpus is relevant.

## Install

During development:

```bash
npm install -g .
```

After publishing:

```bash
npm install -g rag-corpus
npx rag-corpus init
```

The npm package runs directly on Node.js. It does not require Python.

## Quick Start

```bash
rag-corpus init
rag-corpus create psicologia --description "Corpus sobre psicologia, cognicion, aprendizaje y conducta." --tag psychology --tag learning
rag-corpus add psicologia ./books --recursive
rag-corpus search psicologia "memoria de trabajo y aprendizaje" --top 5
rag-corpus describe psicologia
```

PDF ingestion uses the optional npm dependency `pdf-parse`. Markdown and text ingestion work with Node.js built-ins only.

```bash
npm install -g rag-corpus
```

The current JavaScript index uses a local JSON index with BM25 lexical retrieval. Embeddings/hybrid retrieval can be added later behind the same CLI/MCP interface.

## Commands

```bash
rag-corpus init
rag-corpus create <name> --description "..." --tag tag
rag-corpus list
rag-corpus describe <name>
rag-corpus add <name> <file>
rag-corpus add <name> <directory> --recursive
rag-corpus search <name> "query" --top 6
rag-corpus validate [name]
rag-corpus models show [--corpus name]
rag-corpus models set <task> --provider <provider> --model <model> [--corpus name]
rag-corpus models run <task> --text "..." [--corpus name]
rag-corpus ollama status
rag-corpus ollama setup --task translation --model qwen2.5:7b --start --pull
```

Corpus names are global under `~/.rag-corpus/corpora/`. Set `RAG_CORPUS_HOME` or pass `--home` to use a different location.

## AI Model Configuration

`rag-corpus` can store model choices per task. Configuration is declarative for now and is designed to support local and remote providers for future translation, categorization, generation, and embeddings steps.

Supported task names:

- `generation`
- `translation`
- `categorization`
- `embeddings`

Global examples:

```bash
rag-corpus models set translation --provider ollama --model qwen2.5:7b --base-url http://localhost:11434
rag-corpus models set categorization --provider ollama --model llama3.2:3b
rag-corpus models set embeddings --provider openai-compatible --model text-embedding-3-small --base-url https://api.openai.com/v1 --api-key-env OPENAI_API_KEY --dimensions 1536
rag-corpus models show
```

Test a configured task:

```bash
rag-corpus models run translation --text "Task reassignment requires monitoring stalled executors."
rag-corpus models run categorization --corpus psicologia --text "Learning objectives and formative feedback improve tutoring workflows."
rag-corpus models run embeddings --text "agent coordination"
```

Corpus-specific overrides:

```bash
rag-corpus models set translation --corpus psicologia --provider ollama --model aya:8b
rag-corpus models show --corpus psicologia
```

API keys are not stored directly. Store only the environment variable name with `--api-key-env`.

Model execution uses the effective configuration for the requested task: corpus override first, then global configuration. Supported providers currently implemented are `ollama`, `openai`, and `openai-compatible`.

## Local Ollama

Ollama can be used as a local provider for generation, translation, categorization, and embeddings.

Check local status:

```bash
rag-corpus ollama status
```

Print installation instructions:

```bash
rag-corpus ollama install
```

On macOS, install with Homebrew only when explicitly requested:

```bash
rag-corpus ollama install --method brew --yes
```

Start the local Ollama service:

```bash
rag-corpus ollama start
```

Pull and list models:

```bash
rag-corpus ollama pull qwen2.5:7b
rag-corpus ollama list
```

Configure a task to use local Ollama:

```bash
rag-corpus ollama setup --task translation --model qwen2.5:7b --start --pull
rag-corpus ollama setup --task categorization --corpus psicologia --model llama3.2:3b
```

`--start` attempts to run `ollama serve` if the service is not already responding. `--pull` downloads the model before writing the `rag-corpus` model configuration.

## MCP

`rag-corpus` is intended to be used as a command-line MCP over stdio. It is not a daemon and does not keep a background service running. The harness starts the command when needed and communicates with it through stdin/stdout.

Run the stdio MCP command manually for a specific corpus:

```bash
rag-corpus mcp stdio psicologia
```

The corpus name is required for the MCP command to be useful. If it is omitted, the MCP command reports that no corpus has been registered and exposes no usable tools.

Print a generic MCP config snippet:

```bash
rag-corpus mcp config psicologia
```

Register the command in a project `.mcp.json`:

```bash
rag-corpus mcp register psicologia --project .
```

Each registered MCP command is bound to one corpus and currently exposes read-only tools:

- `corpus_overview`
- `detail_category`
- `has_relevant_context`
- `describe_corpus`
- `search_corpus`

The overview and category-detail tools expose a synthetic topic tree generated while indexing documents. The tree is intentionally compact: by default it keeps up to 8 categories per level so a consumer can inspect what the corpus appears to cover without loading source passages into context.

Use the CLI for write operations such as creating corpora, adding documents, and rebuilding indexes.

## Local Playground

For manual experiments, create or use `local-playground/`. It is ignored by git. A typical local setup can include sample documents and shell scripts that call `node bin/rag-corpus.js` by relative path and exercise MCP requests with `printf` piped to `rag-corpus mcp stdio <corpus>`.

## Corpus Layout

Each corpus lives under `~/.rag-corpus/corpora/<name>/`:

```text
corpus.json
CORPUS.md
inbox/
sources/
extracted/
normalized/
  index/
    index.json
    manifest.json
```

`corpus.json` and `CORPUS.md` are used for corpus discovery and MCP descriptions. Keep them focused on when the corpus should and should not be used.
