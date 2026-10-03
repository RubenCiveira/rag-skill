import path from "node:path";
import { ensureDir } from "./fs-utils.js";

const DRIVER_ENV = "RAG_CORPUS_SQLITE_DRIVER";

export async function sqliteStatus() {
  return {
    selected_driver: process.env[DRIVER_ENV] || "auto",
    node_sqlite: await driverAvailable("node"),
    better_sqlite3: await driverAvailable("better-sqlite3"),
    install: sqliteInstallInstructions(),
  };
}

export function sqliteInstallInstructions() {
  return {
    default: "Use Node.js with built-in node:sqlite support when available.",
    native: [
      "Install the native optional driver in the project that runs rag-corpus:",
      "npm install better-sqlite3",
      "Then run with: RAG_CORPUS_SQLITE_DRIVER=better-sqlite3 rag-corpus ...",
    ],
  };
}

export async function openCorpusDb(corpus) {
  await ensureDir(corpus.indexDir);
  const dbPath = corpus.sqlitePath;
  const selected = process.env[DRIVER_ENV] || "auto";
  const db = selected === "better-sqlite3"
    ? await openBetterSqlite(dbPath)
    : await openNodeSqlite(dbPath).catch(async (error) => {
      if (selected === "node") throw error;
      return openBetterSqlite(dbPath);
    });
  initSchema(db);
  return db;
}

export async function driverAvailable(driver) {
  try {
    if (driver === "node") await import("node:sqlite");
    else if (driver === "better-sqlite3") await import("better-sqlite3");
    else return false;
    return true;
  } catch {
    return false;
  }
}

async function openNodeSqlite(dbPath) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(dbPath);
  return wrapDatabase(database, "node");
}

async function openBetterSqlite(dbPath) {
  const imported = await import("better-sqlite3");
  const Database = imported.default || imported;
  const database = new Database(dbPath);
  return wrapDatabase(database, "better-sqlite3");
}

function wrapDatabase(database, driver) {
  return {
    driver,
    path: database.filename,
    exec: (sql) => database.exec(sql),
    run: (sql, params = []) => database.prepare(sql).run(...params),
    get: (sql, params = []) => database.prepare(sql).get(...params),
    all: (sql, params = []) => database.prepare(sql).all(...params),
    close: () => database.close?.(),
  };
}

function initSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY,
      sha256 TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      source_path TEXT NOT NULL,
      original_path TEXT,
      kind TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      title TEXT,
      breadcrumb TEXT,
      page_start INTEGER,
      page_end INTEGER,
      text TEXT NOT NULL,
      token_count INTEGER,
      UNIQUE(document_id, chunk_index)
    );

    CREATE TABLE IF NOT EXISTS chunk_embeddings (
      chunk_id INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      vector_json TEXT NOT NULL,
      PRIMARY KEY(chunk_id, provider, model)
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      title,
      breadcrumb,
      text
    );

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export function insertDocument(db, document) {
  const result = db.run(
    `INSERT INTO documents(sha256, title, source_path, original_path, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [document.sha256, document.title, document.sourcePath, document.originalPath, document.kind, document.createdAt],
  );
  return Number(result.lastInsertRowid);
}

export function insertChunk(db, documentId, chunk) {
  const result = db.run(
    `INSERT INTO chunks(document_id, chunk_index, title, breadcrumb, page_start, page_end, text, token_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [documentId, chunk.chunkIndex, chunk.title, chunk.breadcrumb, chunk.pageStart, chunk.pageEnd, chunk.text, chunk.tokenCount],
  );
  const chunkId = Number(result.lastInsertRowid);
  db.run(`INSERT INTO chunks_fts(rowid, title, breadcrumb, text) VALUES (?, ?, ?, ?)`, [chunkId, chunk.title, chunk.breadcrumb, chunk.text]);
  return chunkId;
}

export function insertEmbedding(db, embedding) {
  db.run(
    `INSERT OR REPLACE INTO chunk_embeddings(chunk_id, provider, model, dimensions, vector_json) VALUES (?, ?, ?, ?, ?)`,
    [embedding.chunk_id, embedding.provider, embedding.model, embedding.dimensions, JSON.stringify(embedding.vector)],
  );
}

export function getDocumentBySha(db, sha256) {
  return db.get(`SELECT * FROM documents WHERE sha256 = ?`, [sha256]);
}

export function saveTaxonomy(db, taxonomy) {
  db.run(`INSERT OR REPLACE INTO metadata(key, value) VALUES ('taxonomy', ?)`, [JSON.stringify(taxonomy)]);
}

export function readSqliteIndex(db) {
  const documents = db.all(`SELECT id, sha256, title, source_path AS sourcePath, original_path AS originalPath, kind, created_at AS createdAt FROM documents ORDER BY id`);
  const chunks = db.all(`
    SELECT id, document_id AS documentId, chunk_index AS chunkIndex, title, breadcrumb, page_start AS pageStart, page_end AS pageEnd, text, token_count AS tokenCount
    FROM chunks
    ORDER BY id
  `);
  const embeddings = db.all(`SELECT chunk_id, provider, model, dimensions, vector_json FROM chunk_embeddings ORDER BY chunk_id`).map((row) => ({
    chunk_id: row.chunk_id,
    provider: row.provider,
    model: row.model,
    dimensions: row.dimensions,
    vector: JSON.parse(row.vector_json),
  }));
  const taxonomyRow = db.get(`SELECT value FROM metadata WHERE key = 'taxonomy'`);
  return {
    schema_version: 1,
    documents,
    chunks,
    embeddings,
    taxonomy: taxonomyRow ? JSON.parse(taxonomyRow.value) : null,
  };
}

export function searchFts(db, query, limit) {
  try {
    return db.all(`SELECT rowid AS chunk_id, bm25(chunks_fts) AS rank FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?`, [query, limit]);
  } catch {
    const safeQuery = query.split(/\s+/).filter(Boolean).join(" OR ");
    if (!safeQuery) return [];
    return db.all(`SELECT rowid AS chunk_id, bm25(chunks_fts) AS rank FROM chunks_fts WHERE chunks_fts MATCH ? ORDER BY rank LIMIT ?`, [safeQuery, limit]);
  }
}
