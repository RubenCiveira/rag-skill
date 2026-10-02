import { readIndex } from "./index-store.js";

export async function searchCorpus(corpus, query, topK = 6) {
  const index = await readIndex(corpus);
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
    const document = documentsById.get(item.chunk.documentId) || {};
    scored.push({
      chunk_id: item.chunk.id,
      document_title: document.title || "unknown",
      chunk_title: item.chunk.title,
      breadcrumb: item.chunk.breadcrumb,
      page_start: item.chunk.pageStart,
      page_end: item.chunk.pageEnd,
      text: item.chunk.text,
      score,
      signals: `bm25=${score.toFixed(4)}`,
    });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
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
