# Development Playground

This directory contains tracked helper scripts for local development.

Runtime data is intentionally kept outside git under `../local-playground/`:

- `../local-playground/docs/` contains documents to index.
- `../local-playground/.rag-corpus/` contains generated corpora and indexes.

Typical usage:

```bash
cd dev-playground
make reset
make overview
make search QUERY="stalled executor reassignment"
```

`local-playground/` is ignored by git so you can put private PDFs and generated indexes there.
