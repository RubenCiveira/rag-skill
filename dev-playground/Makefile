SHELL := /usr/bin/env bash

.PHONY: help reset tools overview detail relevance search models model-ollama model-embedding model-embedding-openai run-translation run-categorization run-embedding ollama-status ollama-install ollama-setup ocr-status ocr-install ocr-setup sqlite-status sqlite-install

QUERY ?= coordinator stalled tasks
CATEGORY ?=
TEXT ?= Agent coordinators monitor stalled tasks and reassign work.

help:
	@printf "Available targets:\n"
	@printf "  make reset                         Recreate the synthetic corpus from ../local-playground/docs\n"
	@printf "  make tools                         List MCP tools\n"
	@printf "  make overview                      Show corpus topic overview\n"
	@printf "  make detail CATEGORY='agent coordination'\n"
	@printf "  make relevance QUERY='learning objectives feedback'\n"
	@printf "  make search QUERY='stalled tasks verification'\n"
	@printf "  make models                        Show effective model configuration\n"
	@printf "  make model-ollama                  Configure local Ollama examples\n"
	@printf "  make model-embedding               Configure local Transformers multilingual embeddings\n"
	@printf "  make model-embedding-openai        Configure OpenAI-compatible embeddings example\n"
	@printf "  make run-translation TEXT='hello'  Run configured translation model\n"
	@printf "  make run-categorization TEXT='...' Run configured categorization model\n"
	@printf "  make run-embedding TEXT='...'      Run configured embeddings model\n"
	@printf "  make ollama-status                 Check local Ollama status\n"
	@printf "  make ollama-install                Print Ollama install instructions\n"
	@printf "  make ollama-setup                  Configure translation with local Ollama\n"
	@printf "  make ocr-status                    Check OCR native tool status\n"
	@printf "  make ocr-install                   Print OCR install commands\n"
	@printf "  make ocr-setup                     Configure native Tesseract OCR\n"
	@printf "  make sqlite-status                 Check SQLite driver availability\n"
	@printf "  make sqlite-install                Print native SQLite driver instructions\n"

reset:
	@./scripts/reset.sh

tools:
	@./scripts/mcp-tools.sh | ./scripts/pretty-mcp.js

overview:
	@./scripts/mcp-overview.sh | ./scripts/pretty-mcp.js

detail:
	@./scripts/mcp-detail.sh "$(CATEGORY)" | ./scripts/pretty-mcp.js

relevance:
	@./scripts/mcp-relevance.sh "$(QUERY)" | ./scripts/pretty-mcp.js

search:
	@./scripts/mcp-search.sh "$(QUERY)" | ./scripts/pretty-mcp.js

raw-tools:
	@./scripts/mcp-tools.sh

raw-overview:
	@./scripts/mcp-overview.sh

raw-detail:
	@./scripts/mcp-detail.sh "$(CATEGORY)"

raw-relevance:
	@./scripts/mcp-relevance.sh "$(QUERY)"

raw-search:
	@./scripts/mcp-search.sh "$(QUERY)"

models:
	@./scripts/models-show.sh

model-ollama:
	@./scripts/models-set-ollama.sh

model-embedding:
	@./scripts/models-set-transformers-embedding.sh

model-embedding-openai:
	@./scripts/models-set-embedding.sh

run-translation:
	@./scripts/models-run.sh translation "$(TEXT)"

run-categorization:
	@./scripts/models-run.sh categorization "$(TEXT)"

run-embedding:
	@./scripts/models-run.sh embeddings "$(TEXT)"

ollama-status:
	@./scripts/ollama-status.sh

ollama-install:
	@./scripts/ollama-install.sh

ollama-setup:
	@./scripts/ollama-setup.sh

ocr-status:
	@./scripts/ocr-status.sh

ocr-install:
	@./scripts/ocr-install.sh

ocr-setup:
	@./scripts/ocr-setup.sh

sqlite-status:
	@./scripts/sqlite-status.sh

sqlite-install:
	@./scripts/sqlite-install.sh
