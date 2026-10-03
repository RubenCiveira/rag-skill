import fs from "node:fs/promises";
import path from "node:path";
import { corporaDir, defaultHome } from "./paths.js";
import { ensureDir, exists, readJson, writeJson } from "./fs-utils.js";

export function normalizeCorpusName(name) {
  const normalized = name.trim().toLowerCase().replaceAll(" ", "-");
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalized)) {
    throw new Error("Corpus name must use lowercase letters, numbers, dashes, or underscores, and start with a letter or number.");
  }
  return normalized;
}

export async function initHome(home = defaultHome()) {
  await ensureDir(corporaDir(home));
  const configPath = path.join(home, "config.json");
  if (!(await exists(configPath))) {
      await writeJson(configPath, {
        schema_version: 1,
        corpora_dir: "corpora",
        ai: {
          generation: null,
          translation: null,
          categorization: null,
          embeddings: {
            provider: "transformers",
            model: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
            dimensions: 384,
          },
        },
        ocr: {
          provider: null,
          languages: ["eng"],
          pdf_renderer: "poppler",
          min_text_chars: 80,
        },
      });
  }
  return home;
}

export function corpusPath(name, home = defaultHome()) {
  return path.join(corporaDir(home), normalizeCorpusName(name));
}

export async function createCorpus(name, { description = "", tags = [], home = defaultHome() } = {}) {
  await initHome(home);
  const normalized = normalizeCorpusName(name);
  const root = corpusPath(normalized, home);
  if (await exists(root)) throw new Error(`Corpus already exists: ${normalized}`);
  for (const child of ["inbox", "sources", "extracted", "normalized", "index"]) {
    await ensureDir(path.join(root, child));
  }
  const metadata = {
    schema_version: 1,
    name: normalized,
    title: name.trim(),
    description: description.trim() || `Corpus named ${normalized}.`,
    tags,
    language: "auto",
    ai: {},
  };
  await writeJson(path.join(root, "corpus.json"), metadata);
  await fs.writeFile(path.join(root, "CORPUS.md"), defaultCorpusDetail(metadata), "utf8");
  return corpus(normalized, home);
}

export async function getCorpus(name, home = defaultHome()) {
  const normalized = normalizeCorpusName(name);
  const root = corpusPath(normalized, home);
  if (!(await exists(root))) throw new Error(`Corpus does not exist: ${normalized}`);
  return corpus(normalized, home);
}

export async function listCorpora(home = defaultHome()) {
  const root = corporaDir(home);
  if (!(await exists(root))) return [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  const corpora = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = corpus(entry.name, home);
    if (await exists(candidate.metadataPath)) corpora.push(candidate);
  }
  return corpora.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readMetadata(corpus) {
  return readJson(corpus.metadataPath, {});
}

export async function describeCorpus(corpus) {
  const metadata = await readMetadata(corpus);
  const detail = (await exists(corpus.detailPath)) ? await fs.readFile(corpus.detailPath, "utf8") : "";
  const tags = Array.isArray(metadata.tags) && metadata.tags.length ? `\n\nTags: ${metadata.tags.join(", ")}` : "";
  return [`# ${metadata.title || corpus.name}`, "", metadata.description || "", tags.trim(), detail.trim()].filter(Boolean).join("\n\n") + "\n";
}

export function corpus(name, home = defaultHome()) {
  const root = corpusPath(name, home);
  return {
    name: normalizeCorpusName(name),
    root,
    metadataPath: path.join(root, "corpus.json"),
    detailPath: path.join(root, "CORPUS.md"),
    sourcesDir: path.join(root, "sources"),
    indexDir: path.join(root, "index"),
    indexPath: path.join(root, "index", "index.json"),
    manifestPath: path.join(root, "index", "manifest.json"),
  };
}

function defaultCorpusDetail(metadata) {
  return `# Corpus Summary\n\n## Purpose\n\n${metadata.description}\n\n## Current Coverage\n\n- Add the main domains, themes, and source families covered by this corpus.\n\n## Retrieval Hints\n\n- Add useful query formulations for this corpus.\n\n## Limits\n\n- Add exclusions or cases where this corpus should not be used.\n`;
}
