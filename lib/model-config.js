import path from "node:path";
import { defaultHome } from "./paths.js";
import { readJson, writeJson } from "./fs-utils.js";
import { readMetadata } from "./corpus.js";

const DEFAULT_OCR_CONFIG = {
  provider: null,
  languages: ["eng"],
  pdf_renderer: "poppler",
  min_text_chars: 80,
};

export const MODEL_TASKS = new Set(["generation", "translation", "categorization", "embeddings"]);

export const DEFAULT_AI_CONFIG = {
  schema_version: 1,
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
  ocr: DEFAULT_OCR_CONFIG,
};

export async function readGlobalConfig(home = defaultHome()) {
  const configPath = path.join(home, "config.json");
  const config = await readJson(configPath, DEFAULT_AI_CONFIG);
  return normalizeConfig(config);
}

export async function writeGlobalConfig(home, config) {
  await writeJson(path.join(home, "config.json"), normalizeConfig(config));
}

export async function setGlobalModel(home, task, modelConfig) {
  assertTask(task);
  const config = await readGlobalConfig(home);
  config.ai[task] = normalizeModelConfig(modelConfig);
  await writeGlobalConfig(home, config);
  return config.ai[task];
}

export async function setCorpusModel(corpus, task, modelConfig) {
  assertTask(task);
  const metadata = await readMetadata(corpus);
  metadata.ai = metadata.ai || {};
  metadata.ai[task] = normalizeModelConfig(modelConfig);
  await writeJson(corpus.metadataPath, metadata);
  return metadata.ai[task];
}

export async function resolveModelConfig(home, corpus, task) {
  assertTask(task);
  const globalConfig = await readGlobalConfig(home);
  const metadata = corpus ? await readMetadata(corpus) : {};
  return metadata.ai?.[task] || globalConfig.ai?.[task] || null;
}

export async function modelConfigReport(home, corpus = null) {
  const globalConfig = await readGlobalConfig(home);
  const metadata = corpus ? await readMetadata(corpus) : {};
  const report = { global: globalConfig.ai, effective: {} };
  if (corpus) report.corpus = { name: corpus.name, overrides: metadata.ai || {} };
  for (const task of MODEL_TASKS) {
    report.effective[task] = corpus ? await resolveModelConfig(home, corpus, task) : globalConfig.ai[task];
  }
  return report;
}

export function normalizeModelConfig(config) {
  if (!config.provider) throw new Error("Missing provider. Use --provider ollama|openai-compatible|openai|none.");
  if (config.provider === "none") return null;
  const normalized = {
    provider: config.provider,
    model: config.model || null,
  };
  if (!normalized.model) throw new Error("Missing model. Use --model <name>.");
  if (config.baseUrl) normalized.base_url = config.baseUrl;
  if (config.apiKeyEnv) normalized.api_key_env = config.apiKeyEnv;
  if (config.dimensions) normalized.dimensions = Number(config.dimensions);
  return normalized;
}

export function assertTask(task) {
  if (!MODEL_TASKS.has(task)) {
    throw new Error(`Unknown model task: ${task}. Expected one of: ${[...MODEL_TASKS].join(", ")}`);
  }
}

function normalizeConfig(config) {
  return {
    schema_version: config.schema_version || 1,
    corpora_dir: config.corpora_dir || "corpora",
    ocr: { ...DEFAULT_OCR_CONFIG, ...(config.ocr || {}) },
    ai: {
      generation: config.ai?.generation || null,
      translation: config.ai?.translation || null,
      categorization: config.ai?.categorization || null,
      embeddings: config.ai?.embeddings || DEFAULT_AI_CONFIG.ai.embeddings,
    },
  };
}
