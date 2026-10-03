import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chunkPages } from "./chunk.js";
import { extractText, supportedExtensions } from "./extract.js";
import { ensureDir, exists, walk, writeJson } from "./fs-utils.js";
import { buildTaxonomy } from "./taxonomy.js";
import { runModelTask } from "./model-executor.js";
import { getDocumentBySha, insertChunk, insertDocument, insertEmbedding, openCorpusDb, readSqliteIndex, saveTaxonomy } from "./sqlite-store.js";

export async function ingestFile(corpus, filePath) {
  const absolute = path.resolve(filePath);
  const ext = path.extname(absolute).toLowerCase();
  if (!supportedExtensions.has(ext)) throw new Error(`Unsupported document: ${absolute}`);
  const hash = await sha256File(absolute);
  const db = await openCorpusDb(corpus);
  const existing = getDocumentBySha(db, hash);
  if (existing) {
    db.close();
    return { status: "unchanged", document_id: existing.id, title: existing.title };
  }

  const title = path.basename(absolute, ext).replaceAll("-", " ").replaceAll("_", " ").trim() || path.basename(absolute);
  const home = path.dirname(path.dirname(corpus.root));
  const pages = await extractText(absolute, { home, corpus });
  const chunks = chunkPages(pages, title);
  const sourceDir = path.join(corpus.sourcesDir, hash.slice(0, 12));
  await ensureDir(sourceDir);
  const copiedSource = path.join(sourceDir, path.basename(absolute));
  if (!(await exists(copiedSource))) await fs.copyFile(absolute, copiedSource);

  const document = {
    sha256: hash,
    title,
    sourcePath: copiedSource,
    kind: ext.slice(1),
    originalPath: absolute,
    createdAt: new Date().toISOString(),
  };
  const documentId = insertDocument(db, document);
  const insertedChunks = [];
  for (const chunk of chunks) {
    const chunkId = insertChunk(db, documentId, chunk);
    const inserted = { id: chunkId, documentId, ...chunk };
    insertedChunks.push(inserted);
  }
  const embeddings = await embedChunks(home, corpus, insertedChunks);
  for (const embedding of embeddings) insertEmbedding(db, embedding);
  const index = readSqliteIndex(db);
  index.taxonomy = buildTaxonomy(index);
  saveTaxonomy(db, index.taxonomy);
  await writeManifest(corpus, index);
  db.close();
  return { status: "indexed", document_id: documentId, title, chunks: chunks.length, embeddings: embeddings.length };
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
  const db = await openCorpusDb(corpus);
  const index = readSqliteIndex(db);
  db.close();
  index.embeddings = index.embeddings || [];
  if (!index.taxonomy) index.taxonomy = buildTaxonomy(index);
  return index;
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
    embeddings: index.embeddings?.length || 0,
    retrieval: { primary: "semantic-cosine", fallback: "javascript-bm25" },
    storage: { engine: "sqlite", path: "index/corpus.sqlite" },
  });
}

async function embedChunks(home, corpus, chunks) {
  const embeddings = [];
  for (const chunk of chunks) {
    const text = `${chunk.breadcrumb}\n\n${chunk.text}`;
    const result = await runModelTask(home, corpus, "embeddings", { text });
    if (result.embedding?.length) {
      embeddings.push({
        chunk_id: chunk.id,
        provider: result.provider,
        model: result.model,
        dimensions: result.dimensions,
        vector: result.embedding,
      });
    }
  }
  return embeddings;
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(await fs.readFile(filePath));
  return hash.digest("hex");
}
