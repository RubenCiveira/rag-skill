import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chunkPages } from "./chunk.js";
import { extractText, supportedExtensions } from "./extract.js";
import { ensureDir, exists, readJson, walk, writeJson } from "./fs-utils.js";
import { buildTaxonomy } from "./taxonomy.js";

export async function ingestFile(corpus, filePath) {
  const absolute = path.resolve(filePath);
  const ext = path.extname(absolute).toLowerCase();
  if (!supportedExtensions.has(ext)) throw new Error(`Unsupported document: ${absolute}`);
  const hash = await sha256File(absolute);
  const index = await readIndex(corpus);
  const existing = index.documents.find((document) => document.sha256 === hash);
  if (existing) return { status: "unchanged", document_id: existing.id, title: existing.title };

  const title = path.basename(absolute, ext).replaceAll("-", " ").replaceAll("_", " ").trim() || path.basename(absolute);
  const pages = await extractText(absolute);
  const chunks = chunkPages(pages, title);
  const sourceDir = path.join(corpus.sourcesDir, hash.slice(0, 12));
  await ensureDir(sourceDir);
  const copiedSource = path.join(sourceDir, path.basename(absolute));
  if (!(await exists(copiedSource))) await fs.copyFile(absolute, copiedSource);

  const document = {
    id: nextId(index.documents),
    sha256: hash,
    title,
    sourcePath: copiedSource,
    kind: ext.slice(1),
    originalPath: absolute,
    createdAt: new Date().toISOString(),
  };
  index.documents.push(document);
  for (const chunk of chunks) {
    index.chunks.push({ id: nextId(index.chunks), documentId: document.id, ...chunk });
  }
  index.taxonomy = buildTaxonomy(index);
  await writeIndex(corpus, index);
  await writeManifest(corpus, index);
  return { status: "indexed", document_id: document.id, title, chunks: chunks.length, embeddings: 0 };
}

export async function documentPaths(inputPath, recursive = false) {
  const absolute = path.resolve(inputPath);
  const stat = await fs.stat(absolute);
  if (stat.isFile()) return supportedExtensions.has(path.extname(absolute).toLowerCase()) ? [absolute] : [];
  if (!stat.isDirectory()) return [];
  if (!recursive) throw new Error("Path is a directory. Use --recursive to ingest a directory.");
  return (await walk(absolute)).filter((file) => supportedExtensions.has(path.extname(file).toLowerCase())).sort();
}

export async function readIndex(corpus) {
  const index = await readJson(corpus.indexPath, { schema_version: 1, documents: [], chunks: [], taxonomy: null });
  if (!index.taxonomy) index.taxonomy = buildTaxonomy(index);
  return index;
}

async function writeIndex(corpus, index) {
  await writeJson(corpus.indexPath, index);
}

async function writeManifest(corpus, index) {
  await writeJson(corpus.manifestPath, {
    schema_version: 1,
    documents: index.documents.length,
    chunks: index.chunks.length,
    taxonomy: {
      max_children_per_level: index.taxonomy?.max_children_per_level || 8,
      top_level_categories: index.taxonomy?.root?.children?.length || 0,
    },
    embeddings: 0,
    retrieval: { lexical: "javascript-bm25", semantic: null, fusion: null },
  });
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(await fs.readFile(filePath));
  return hash.digest("hex");
}

function nextId(items) {
  return items.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
}
