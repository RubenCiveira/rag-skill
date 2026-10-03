const MAX_CHILDREN = 8;
const MAX_DEPTH = 3;
const MIN_TERM_LENGTH = 4;

const STOPWORDS = new Set([
  "about", "above", "after", "again", "against", "also", "because", "before", "being", "between", "could", "during", "each", "from", "have", "into", "more", "most", "note", "notes", "other", "over", "should", "some", "such", "than", "that", "their", "then", "there", "these", "they", "this", "through", "under", "using", "very", "were", "when", "where", "which", "while", "with", "would",
  "como", "para", "pero", "porque", "sobre", "entre", "desde", "hasta", "tambien", "cuando", "donde", "estos", "estas", "este", "esta", "esto", "tiene", "tienen", "puede", "pueden", "hacer", "cada", "otros", "otras", "todo", "toda", "todos", "todas", "forma", "manera", "nota", "notas", "sera", "ser", "son", "con", "por", "que", "del", "las", "los", "una", "uno", "unos", "unas", "mas", "muy", "sin", "sus", "se", "su", "al", "el", "la", "lo", "en", "y", "o", "a", "de",
]);

export function buildTaxonomy(index, { maxChildren = MAX_CHILDREN, maxDepth = MAX_DEPTH } = {}) {
  const chunks = index.chunks || [];
  const root = {
    name: "root",
    label: "Corpus",
    path: [],
    chunk_count: chunks.length,
    document_count: index.documents?.length || 0,
    terms: topTerms(chunks).slice(0, maxChildren).map((term) => term.term),
    children: [],
  };
  root.children = buildLevel(chunks, [], 1, maxChildren, maxDepth);
  return {
    schema_version: 1,
    max_children_per_level: maxChildren,
    generated_at: new Date().toISOString(),
    root,
  };
}

export function taxonomyOverview(index) {
  const taxonomy = ensureTaxonomy(index);
  const topics = taxonomy.root.children.map((child) => child.label);
  return {
    message: `I am a RAG corpus you can use to retrieve contextual information. I currently have information about these topics: ${topics.join(", ") || "no categories yet"}. If you want to be more specific, ask for details about any topic with detail_category.`,
    topics: taxonomy.root.children.map(summaryNode),
  };
}

export function detailCategory(index, categoryPath = "") {
  const taxonomy = ensureTaxonomy(index);
  const parts = splitPath(categoryPath);
  const node = findNode(taxonomy.root, parts);
  if (!node) {
    return { found: false, path: parts, message: `Category not found: ${categoryPath}` };
  }
  return {
    found: true,
    category: summaryNode(node),
    subcategories: node.children.map(summaryNode),
    message: node.children.length
      ? `Category ${node.label} is split into: ${node.children.map((child) => child.label).join(", ")}. You can request details for any of these subcategories by using its full path, for example: ${node.children.map((child) => child.path.join("/")).slice(0, 3).join(" | ")}.`
      : `Category ${node.label} does not have enough subcategories. Representative terms: ${node.terms.join(", ")}.`,
  };
}

export function assessRelevance(index, query) {
  const results = relevanceResults(index, query, 5);
  const queryTerms = new Set(tokenize(query));
  const taxonomy = ensureTaxonomy(index);
  const categoryMatches = [];
  for (const node of flattenNodes(taxonomy.root.children)) {
    const nodeTerms = [...new Set(tokenize([node.label, ...(node.terms || [])].join(" ")))];
    const overlap = nodeTerms.filter((term) => queryTerms.has(term)).length;
    if (overlap) categoryMatches.push({ path: node.path.join("/"), label: node.label, overlap, chunk_count: node.chunk_count });
  }
  const topScore = results[0]?.score || 0;
  const relevant = topScore > 0 || categoryMatches.length > 0;
  return {
    relevant,
    confidence: Math.min(1, Number((topScore / 3 + Math.min(categoryMatches.length, 3) * 0.15).toFixed(3))),
    message: relevant
      ? "The corpus appears to contain potentially relevant information for this query."
      : "No clear lexical signals indicate that this corpus covers the query.",
    category_matches: categoryMatches.sort((a, b) => b.overlap - a.overlap).slice(0, 8),
    top_results: results,
  };
}

function relevanceResults(index, query, limit) {
  const queryTerms = new Set(tokenize(query));
  if (!queryTerms.size) return [];
  const documentsById = new Map((index.documents || []).map((document) => [document.id, document]));
  return (index.chunks || [])
    .map((chunk) => {
      const terms = tokenize(chunkText(chunk));
      const overlap = [...queryTerms].filter((term) => terms.includes(term));
      const score = overlap.length / Math.max(1, queryTerms.size);
      const document = documentsById.get(chunk.documentId) || {};
      return { document_title: document.title || "unknown", chunk_title: chunk.title, score, matched_terms: overlap };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function buildLevel(chunks, ancestors, depth, maxChildren, maxDepth) {
  if (depth > maxDepth || chunks.length < 1) return [];
  const ancestorTerms = new Set(ancestors.flatMap((ancestor) => tokenize(ancestor)));
  const terms = topTerms(chunks).filter((item) => !tokenize(item.term).some((term) => ancestorTerms.has(term))).slice(0, maxChildren);
  const nodes = [];
  for (const item of terms) {
    const matchingChunks = chunks.filter((chunk) => includesTerm(chunkText(chunk), item.term));
    if (!matchingChunks.length) continue;
    const path = [...ancestors, item.term];
    nodes.push({
      name: slug(item.term),
      label: item.term,
      path,
      chunk_count: matchingChunks.length,
      terms: topTerms(matchingChunks).filter((term) => term.term !== item.term).slice(0, maxChildren).map((term) => term.term),
      children: buildLevel(matchingChunks, path, depth + 1, maxChildren, maxDepth),
    });
  }
  return nodes;
}

function topTerms(chunks) {
  const scores = new Map();
  const docFreq = new Map();
  for (const chunk of chunks) {
    const candidates = candidateTerms(chunkText(chunk));
    const unique = new Set(candidates);
    for (const term of candidates) scores.set(term, (scores.get(term) || 0) + termWeight(term));
    for (const term of unique) docFreq.set(term, (docFreq.get(term) || 0) + 1);
  }
  return [...scores.entries()]
    .map(([term, score]) => {
      const df = docFreq.get(term) || 1;
      const idf = Math.log(1 + (chunks.length + 1) / (df + 0.5));
      return { term, score: score * idf };
    })
    .sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
}

function candidateTerms(text) {
  const tokens = tokenize(text).filter((token) => token.length >= MIN_TERM_LENGTH && !STOPWORDS.has(token));
  const terms = [];
  for (let index = 0; index < tokens.length; index += 1) {
    terms.push(tokens[index]);
    if (tokens[index + 1]) terms.push(`${tokens[index]} ${tokens[index + 1]}`);
    if (tokens[index + 1] && tokens[index + 2]) terms.push(`${tokens[index]} ${tokens[index + 1]} ${tokens[index + 2]}`);
  }
  return terms.filter((term) => ![...new Set(term.split(" "))].some((token) => STOPWORDS.has(token)));
}

function termWeight(term) {
  const length = term.split(" ").length;
  return length === 1 ? 1 : length === 2 ? 2.4 : 3.2;
}

function includesTerm(text, term) {
  const haystack = ` ${tokenize(text).join(" ")} `;
  return haystack.includes(` ${tokenize(term).join(" ")} `);
}

function chunkText(chunk) {
  return `${chunk.title || ""} ${chunk.breadcrumb || ""} ${chunk.text || ""}`;
}

function ensureTaxonomy(index) {
  return index.taxonomy || buildTaxonomy(index);
}

function splitPath(categoryPath) {
  if (Array.isArray(categoryPath)) return categoryPath.filter(Boolean);
  return String(categoryPath || "").split("/").map((part) => part.trim()).filter(Boolean);
}

function findNode(root, parts) {
  if (!parts.length) return root;
  let current = root;
  for (const part of parts) {
    const normalized = slug(part);
    current = current.children.find((child) => child.name === normalized || slug(child.label) === normalized || child.label === part);
    if (!current) return null;
  }
  return current;
}

function flattenNodes(nodes) {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children || [])]);
}

function summaryNode(node) {
  return {
    name: node.name,
    label: node.label,
    path: node.path.join("/"),
    chunk_count: node.chunk_count,
    terms: node.terms || [],
    subcategory_count: node.children?.length || 0,
  };
}

function slug(value) {
  return tokenize(value).join("-") || "category";
}

function tokenize(text) {
  return String(text || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9_]+/g) || [];
}
