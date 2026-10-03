# Claude Instructions

Read `AGENTS.md` first. It is the source of truth for this repository's structure, runtime data rules, commands, and implementation constraints.

For this project specifically:

- Keep user-facing CLI and documentation text in English unless the user explicitly asks otherwise.
- Do not write generated corpora, indexes, playground runtime data, or model caches into git-tracked paths.
- Use `local-playground/` only as ignored development runtime data.
- Prefer lightweight verification such as `node bin/rag-corpus.js --help`, `node bin/rag-corpus.js sqlite status`, and `npm pack --dry-run`.
