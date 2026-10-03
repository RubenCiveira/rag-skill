import { readIndex } from "./index-store.js";
import { runModelTask } from "./model-executor.js";
import path from "node:path";

export async function searchCorpus(corpus, query, topK = 6) {
  const index = await readIndex(corpus);
  const semantic = await semanticSearch(corpus, index, query, topK);
  if (semantic.length) return semantic;

  return lexicalSearch(index, query, topK);
}

async function semanticSearch(corpus, index, query, topK) {
  if (!index.embeddings?.length || !index.chunks.length) return [];
  const home = path.dirname(path.dirname(corpus.root));
  const queryEmbedding = await runModelTask(home, corpus, "embeddings", { text: query });
  if (!queryEmbedding.embedding?.length) return [];

  const documentsById = new Map(index.documents.map((document) => [document.id, document]));
  const chunksById = new Map(index.chunks.map((chunk) => [chunk.id, chunk]));
  return index.embeddings
    .map((embedding) => {
      const chunk = chunksById.get(embedding.chunk_id);
      if (!chunk) return null;
      const document = documentsById.get(chunk.documentId) || {};
      const score = cosine(queryEmbedding.embedding, embedding.vector);
      return formatResult(chunk, document, score, `cosine=${score.toFixed(4)}`);
    })
    .filter(Boolean)
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function lexicalSearch(index, query, topK) {
  const queryTerms = tokenize(query);
  if (!queryTerms.length || !index.chunks.length) return [];

  const documentsById = new Map(index.documents.map((document) => [document.id, document]));
  const tokenizedChunks = index.chunks.map((chunk) => ({ chunk, terms: tokenize(`${chunk.title} ${chunk.breadcrumb} ${chunk.text}`) }));
  const avgLength = tokenizedChunks.reduce((sum, item) => sum + item.terms.length, 0) / tokenizedChunks.length || 1;
  const docFreq = new Map();
  for (const term of new Set(queryTerms)) {
    docFreq.set(term, tokenizedChunks.filter((item) => item.terms.includes(term)).length);
  }

  const scored = [];
  for (const item of tokenizedChunks) {
    const score = bm25(queryTerms, item.terms, docFreq, tokenizedChunks.length, avgLength);
    if (score <= 0) continue;
    scored.push(formatResult(item.chunk, documentsById.get(item.chunk.documentId) || {}, score, `bm25=${score.toFixed(4)}`));
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

function formatResult(chunk, document, score, signals) {
  return {
    chunk_id: chunk.id,
    document_title: document.title || "unknown",
    chunk_title: chunk.title,
    breadcrumb: chunk.breadcrumb,
    page_start: chunk.pageStart,
    page_end: chunk.pageEnd,
    text: chunk.text,
    score,
    signals,
  };
}

function cosine(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function bm25(queryTerms, documentTerms, docFreq, totalDocuments, avgLength) {
  const k1 = 1.5;
  const b = 0.75;
  const termCounts = new Map();
  for (const term of documentTerms) termCounts.set(term, (termCounts.get(term) || 0) + 1);
  let score = 0;
  for (const term of queryTerms) {
    const tf = termCounts.get(term) || 0;
    if (!tf) continue;
    const df = docFreq.get(term) || 0;
    const idf = Math.log(1 + (totalDocuments - df + 0.5) / (df + 0.5));
    score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (documentTerms.length / avgLength))));
  }
  return score;
}

export function tokenize(text) {
  return text.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9_]+/g) || [];
}
