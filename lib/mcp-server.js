import readline from "node:readline";
import { describeCorpus, getCorpus } from "./corpus.js";
import { readIndex } from "./index-store.js";
import { searchCorpus } from "./search.js";
import { assessRelevance, detailCategory, taxonomyOverview } from "./taxonomy.js";

const UNREGISTERED_MESSAGE = "No corpus has been registered. Start the MCP command with: rag-corpus mcp stdio <corpus>";

export async function serveMcp(home, corpusName) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const request = JSON.parse(line);
      const response = await handleRequest(request, home, corpusName);
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: error.message } })}\n`);
    }
  }
  return 0;
}

async function handleRequest(request, home, corpusName) {
  const { id, method, params = {} } = request;
  if (method === "initialize") return result(id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: corpusName ? `rag-corpus-${corpusName}` : "rag-corpus-unregistered", version: "0.1.0" } });
  if (method === "notifications/initialized") return null;
  if (method === "tools/list") return result(id, corpusName ? { tools } : { tools: [], message: UNREGISTERED_MESSAGE });
  if (method === "tools/call") return result(id, await callTool(params.name, params.arguments || {}, home, corpusName));
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

function result(id, payload) {
  return { jsonrpc: "2.0", id, result: payload };
}

const tools = [
  { name: "corpus_overview", description: "Explain what the registered corpus appears to cover and list its top-level topics without loading source passages.", inputSchema: { type: "object", properties: {} } },
  { name: "detail_category", description: "Show subcategories and representative terms for a category path from the registered corpus taxonomy.", inputSchema: { type: "object", properties: { category: { type: "string", description: "Category path, for example 'planning' or 'planning/task allocation'. Empty means root." } } } },
  { name: "has_relevant_context", description: "Assess whether the registered corpus has context relevant to a query or topic before doing a full search.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "describe_corpus", description: "Return the human-readable description and coverage of the registered corpus.", inputSchema: { type: "object", properties: {} } },
  { name: "search_corpus", description: "Search the registered corpus using local BM25 retrieval.", inputSchema: { type: "object", properties: { query: { type: "string" }, top_k: { type: "integer", default: 6 } }, required: ["query"] } },
];

async function callTool(name, args, home, corpusName) {
  if (!corpusName) return textContent(UNREGISTERED_MESSAGE);
  const corpus = await getCorpus(corpusName, home);
  const index = await readIndex(corpus);
  if (name === "corpus_overview") return textContent(JSON.stringify(taxonomyOverview(index), null, 2));
  if (name === "detail_category") return textContent(JSON.stringify(detailCategory(index, args.category || ""), null, 2));
  if (name === "has_relevant_context") return textContent(JSON.stringify(assessRelevance(index, args.query), null, 2));
  if (name === "describe_corpus") return textContent(await describeCorpus(corpus));
  if (name === "search_corpus") return textContent(JSON.stringify(await searchCorpus(corpus, args.query, args.top_k || 6), null, 2));
  throw new Error(`Unknown tool: ${name}`);
}

function textContent(text) {
  return { content: [{ type: "text", text }] };
}
