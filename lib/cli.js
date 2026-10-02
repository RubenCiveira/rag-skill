import fs from "node:fs/promises";
import path from "node:path";
import { createCorpus, describeCorpus, getCorpus, initHome, listCorpora, readMetadata } from "./corpus.js";
import { defaultHome } from "./paths.js";
import { documentPaths, ingestFile, readIndex } from "./index-store.js";
import { searchCorpus } from "./search.js";
import { serveMcp } from "./mcp-server.js";
import { exists, readJson, writeJson } from "./fs-utils.js";
import { modelConfigReport, setCorpusModel, setGlobalModel } from "./model-config.js";
import { runModelTask } from "./model-executor.js";
import { installOllama, listOllamaModels, ollamaStatus, pullOllamaModel, startOllama } from "./ollama-local.js";

export async function main(argv) {
  const { args, home } = parseGlobalArgs(argv);
  const command = args.shift();
  try {
    if (!command || command === "--help" || command === "-h") return help();
    if (command === "init") return cmdInit(home);
    if (command === "create") return cmdCreate(args, home);
    if (command === "list") return cmdList(home);
    if (command === "describe") return cmdDescribe(args, home);
    if (command === "add") return cmdAdd(args, home);
    if (command === "search") return cmdSearch(args, home);
    if (command === "validate") return cmdValidate(args, home);
    if (command === "models") return cmdModels(args, home);
    if (command === "ollama") return cmdOllama(args, home);
    if (command === "mcp") return cmdMcp(args, home);
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 1;
  }
}

function parseGlobalArgs(argv) {
  const args = [...argv];
  let home = defaultHome();
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--home") {
      home = path.resolve(args[index + 1]);
      args.splice(index, 2);
      index -= 1;
    }
  }
  return { args, home };
}

async function cmdInit(home) {
  console.log(`Initialized ${await initHome(home)}`);
  return 0;
}

async function cmdCreate(args, home) {
  const name = required(args.shift(), "Missing corpus name.");
  const options = readOptions(args);
  const corpus = await createCorpus(name, { description: options.description || "", tags: options.tag || [], home });
  console.log(`Created corpus ${corpus.name} at ${corpus.root}`);
  return 0;
}

async function cmdList(home) {
  const corpora = await listCorpora(home);
  if (!corpora.length) {
    console.log("No corpora. Create one with: rag-corpus create <name>");
    return 0;
  }
  for (const corpus of corpora) {
    const metadata = await readMetadata(corpus);
    console.log(`${corpus.name}\t${metadata.description || ""}`);
  }
  return 0;
}

async function cmdDescribe(args, home) {
  process.stdout.write(await describeCorpus(await getCorpus(required(args.shift(), "Missing corpus name."), home)));
  return 0;
}

async function cmdAdd(args, home) {
  const corpus = await getCorpus(required(args.shift(), "Missing corpus name."), home);
  const input = required(args.shift(), "Missing document or directory path.");
  const options = readOptions(args);
  const files = await documentPaths(input, Boolean(options.recursive || options.r));
  if (!files.length) {
    console.log("No supported documents found.");
    return 0;
  }
  for (const file of files) {
    console.log(JSON.stringify({ corpus: corpus.name, document: file, ...(await ingestFile(corpus, file)) }));
  }
  return 0;
}

async function cmdSearch(args, home) {
  const corpus = await getCorpus(required(args.shift(), "Missing corpus name."), home);
  const query = required(args.shift(), "Missing query.");
  const options = readOptions(args);
  const results = await searchCorpus(corpus, query, Number(options.top || 6));
  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return 0;
  }
  if (!results.length) {
    console.log("No results.");
    return 0;
  }
  for (const [index, result] of results.entries()) {
    const pages = result.page_start ? ` | pages ${result.page_start}-${result.page_end}` : "";
    console.log(`[${index + 1}] corpus=${corpus.name} score=${result.score.toFixed(4)} | chunk=${result.chunk_id} | ${result.document_title}${pages}`);
    console.log(`Breadcrumb: ${result.breadcrumb}`);
    console.log(`Signals: ${result.signals}`);
    console.log(result.text.trim().replaceAll("\n", " ").slice(0, 900));
    console.log();
  }
  return 0;
}

async function cmdValidate(args, home) {
  const names = args.length ? [args[0]] : (await listCorpora(home)).map((corpus) => corpus.name);
  let ok = true;
  for (const name of names) {
    const corpus = await getCorpus(name, home);
    const index = await readIndex(corpus);
    const manifestExists = await exists(corpus.manifestPath);
    const result = { corpus: corpus.name, index: corpus.indexPath, manifest_exists: manifestExists, documents: index.documents.length, chunks: index.chunks.length, embeddings: 0, ok: true };
    console.log(JSON.stringify(result, null, 2));
    ok = ok && result.ok;
  }
  return ok ? 0 : 1;
}

async function cmdMcp(args, home) {
  const subcommand = args.shift();
  if (subcommand === "stdio" || subcommand === "serve") return serveMcp(home, args.shift());
  if (subcommand === "config") {
    const corpus = required(args.shift(), "Missing corpus name. Usage: rag-corpus mcp config <corpus>");
    console.log(JSON.stringify({ mcpServers: { [`rag-corpus-${corpus}`]: { command: "rag-corpus", args: ["mcp", "stdio", corpus] } } }, null, 2));
    return 0;
  }
  if (subcommand === "register") {
    const corpus = required(args.shift(), "Missing corpus name. Usage: rag-corpus mcp register <corpus> --project .");
    const options = readOptions(args);
    const project = path.resolve(options.project || ".");
    await fs.mkdir(project, { recursive: true });
    const configPath = path.join(project, ".mcp.json");
    const data = await readJson(configPath, {});
    data.mcpServers = data.mcpServers || {};
    data.mcpServers[options.name || `rag-corpus-${corpus}`] = { command: options.command || "rag-corpus", args: ["mcp", "stdio", corpus] };
    await writeJson(configPath, data);
    console.log(`Registered MCP command in ${configPath}`);
    return 0;
  }
  throw new Error("Expected MCP subcommand: stdio, config, or register.");
}

async function cmdModels(args, home) {
  const subcommand = args.shift();
  if (subcommand === "show") {
    const options = readOptions(args);
    const corpus = options.corpus ? await getCorpus(options.corpus, home) : null;
    console.log(JSON.stringify(await modelConfigReport(home, corpus), null, 2));
    return 0;
  }
  if (subcommand === "set") {
    const task = required(args.shift(), "Missing task. Usage: rag-corpus models set <task> --provider <provider> --model <model>");
    const options = readOptions(args);
    const modelConfig = {
      provider: required(options.provider, "Missing --provider."),
      model: options.model,
      baseUrl: options.baseUrl,
      apiKeyEnv: options.apiKeyEnv,
      dimensions: options.dimensions,
    };
    if (options.corpus) {
      const corpus = await getCorpus(options.corpus, home);
      console.log(JSON.stringify({ corpus: corpus.name, task, config: await setCorpusModel(corpus, task, modelConfig) }, null, 2));
    } else {
      console.log(JSON.stringify({ scope: "global", task, config: await setGlobalModel(home, task, modelConfig) }, null, 2));
    }
    return 0;
  }
  if (subcommand === "run") {
    const task = required(args.shift(), "Missing task. Usage: rag-corpus models run <task> --text <text>");
    const options = readOptions(args);
    const corpus = options.corpus ? await getCorpus(options.corpus, home) : null;
    const text = required(options.text || options.prompt, "Missing --text.");
    const result = await runModelTask(home, corpus, task, { text, instruction: options.instruction || "" });
    console.log(JSON.stringify(formatModelRunResult(result), null, 2));
    return 0;
  }
  throw new Error("Expected models subcommand: show, set, or run.");
}

async function cmdOllama(args, home) {
  const subcommand = args.shift();
  const options = readOptions(args);
  const baseUrl = options.baseUrl || "http://localhost:11434";
  if (subcommand === "status") {
    console.log(JSON.stringify(await ollamaStatus(baseUrl), null, 2));
    return 0;
  }
  if (subcommand === "install") {
    console.log(JSON.stringify(installOllama({ method: options.method || "instructions", yes: Boolean(options.yes) }), null, 2));
    return 0;
  }
  if (subcommand === "start") {
    console.log(JSON.stringify(await startOllama(baseUrl), null, 2));
    return 0;
  }
  if (subcommand === "pull") {
    console.log(JSON.stringify(pullOllamaModel(required(args.shift(), "Missing model. Usage: rag-corpus ollama pull <model>")), null, 2));
    return 0;
  }
  if (subcommand === "list") {
    console.log(listOllamaModels());
    return 0;
  }
  if (subcommand === "setup") {
    const task = required(options.task, "Missing --task.");
    const model = required(options.model, "Missing --model.");
    if (options.start) await startOllama(baseUrl);
    if (options.pull) pullOllamaModel(model);
    const modelConfig = { provider: "ollama", model, baseUrl };
    if (options.corpus) {
      const corpus = await getCorpus(options.corpus, home);
      console.log(JSON.stringify({ corpus: corpus.name, task, config: await setCorpusModel(corpus, task, modelConfig) }, null, 2));
    } else {
      console.log(JSON.stringify({ scope: "global", task, config: await setGlobalModel(home, task, modelConfig) }, null, 2));
    }
    return 0;
  }
  throw new Error("Expected ollama subcommand: status, install, start, pull, list, or setup.");
}

function formatModelRunResult(result) {
  if (result.task_type === "embedding") {
    return {
      task_type: result.task_type,
      provider: result.provider,
      model: result.model,
      dimensions: result.dimensions,
      preview: result.embedding.slice(0, 8),
    };
  }
  return result;
}

function readOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--recursive" || arg === "-r") options.recursive = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--description" || arg === "-d") options.description = args[++index];
    else if (arg === "--tag") options.tag = [...(options.tag || []), args[++index]];
    else if (arg === "--top") options.top = args[++index];
    else if (arg === "--project") options.project = args[++index];
    else if (arg === "--name") options.name = args[++index];
    else if (arg === "--command") options.command = args[++index];
    else if (arg === "--corpus") options.corpus = args[++index];
    else if (arg === "--provider") options.provider = args[++index];
    else if (arg === "--model") options.model = args[++index];
    else if (arg === "--base-url") options.baseUrl = args[++index];
    else if (arg === "--api-key-env") options.apiKeyEnv = args[++index];
    else if (arg === "--dimensions") options.dimensions = args[++index];
    else if (arg === "--text") options.text = args[++index];
    else if (arg === "--prompt") options.prompt = args[++index];
    else if (arg === "--instruction") options.instruction = args[++index];
    else if (arg === "--method") options.method = args[++index];
    else if (arg === "--task") options.task = args[++index];
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--pull") options.pull = true;
    else if (arg === "--start") options.start = true;
  }
  return options;
}

function required(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function help() {
  console.log(`rag-corpus\n\nCommands:\n  init\n  create <name> --description "..." --tag tag\n  list\n  describe <name>\n  add <name> <file|directory> [--recursive]\n  search <name> "query" [--top 6] [--json]\n  validate [name]\n  models show [--corpus name]\n  models set <task> --provider <provider> --model <model> [--corpus name]\n  models run <task> --text "..." [--corpus name]\n  ollama status|install|start|pull|list|setup\n  mcp stdio <corpus>\n  mcp config <corpus>\n  mcp register <corpus> [--project .]\n`);
  return 0;
}
