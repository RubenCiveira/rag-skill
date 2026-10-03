import { resolveModelConfig } from "./model-config.js";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";

export async function runModelTask(home, corpus, task, { text, instruction = "" } = {}) {
  const config = await resolveModelConfig(home, corpus, task);
  if (!config) {
    throw new Error(`No model configured for task '${task}'. Use: rag-corpus models set ${task} --provider <provider> --model <model>`);
  }
  if (task === "embeddings") return embed(config, text);
  const prompt = buildPrompt(task, text, instruction);
  return generate(config, prompt);
}

export async function generate(config, prompt) {
  if (config.provider === "ollama") return ollamaGenerate(config, prompt);
  if (config.provider === "openai" || config.provider === "openai-compatible") return openAiGenerate(config, prompt);
  if (config.provider === "transformers") throw new Error("Provider 'transformers' currently supports embeddings only.");
  throw new Error(`Unsupported generation provider: ${config.provider}`);
}

export async function embed(config, text) {
  if (config.provider === "transformers") return transformersEmbed(config, text);
  if (config.provider === "ollama") return ollamaEmbed(config, text);
  if (config.provider === "openai" || config.provider === "openai-compatible") return openAiEmbed(config, text);
  throw new Error(`Unsupported embeddings provider: ${config.provider}`);
}

function buildPrompt(task, text, instruction) {
  if (instruction) return `${instruction}\n\n${text}`;
  if (task === "translation") {
    return `Translate the following technical text. Preserve terminology, acronyms, lists, and code identifiers. Return only the translation.\n\n${text}`;
  }
  if (task === "categorization") {
    return `Extract a compact topic taxonomy from the following text. Return concise category labels only, one per line.\n\n${text}`;
  }
  return text;
}

async function ollamaGenerate(config, prompt) {
  const baseUrl = stripTrailingSlash(config.base_url || DEFAULT_OLLAMA_URL);
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: config.model, prompt, stream: false }),
  });
  const data = await parseJsonResponse(response);
  return {
    task_type: "text",
    provider: config.provider,
    model: config.model,
    text: data.response || "",
    raw: data,
  };
}

async function ollamaEmbed(config, text) {
  const baseUrl = stripTrailingSlash(config.base_url || DEFAULT_OLLAMA_URL);
  const response = await fetch(`${baseUrl}/api/embeddings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: config.model, prompt: text }),
  });
  const data = await parseJsonResponse(response);
  const vector = data.embedding || [];
  return {
    task_type: "embedding",
    provider: config.provider,
    model: config.model,
    dimensions: vector.length,
    embedding: vector,
  };
}

async function openAiGenerate(config, prompt) {
  const baseUrl = stripTrailingSlash(config.base_url || "https://api.openai.com/v1");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: openAiHeaders(config),
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    }),
  });
  const data = await parseJsonResponse(response);
  return {
    task_type: "text",
    provider: config.provider,
    model: config.model,
    text: data.choices?.[0]?.message?.content || "",
    raw: data,
  };
}

async function openAiEmbed(config, text) {
  const baseUrl = stripTrailingSlash(config.base_url || "https://api.openai.com/v1");
  const response = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: openAiHeaders(config),
    body: JSON.stringify({ model: config.model, input: text }),
  });
  const data = await parseJsonResponse(response);
  const vector = data.data?.[0]?.embedding || [];
  return {
    task_type: "embedding",
    provider: config.provider,
    model: config.model,
    dimensions: vector.length,
    embedding: vector,
  };
}

async function transformersEmbed(config, text) {
  let pipeline;
  try {
    ({ pipeline } = await import("@xenova/transformers"));
  } catch (error) {
    throw new Error("Local Transformers embeddings require optional dependency: npm install @xenova/transformers");
  }
  const extractor = await pipeline("feature-extraction", config.model);
  const output = await extractor(text, { pooling: "mean", normalize: true });
  const vector = Array.from(output.data || []);
  return {
    task_type: "embedding",
    provider: config.provider,
    model: config.model,
    dimensions: vector.length,
    embedding: vector,
  };
}

function openAiHeaders(config) {
  const headers = { "content-type": "application/json" };
  if (config.api_key_env) {
    const apiKey = process.env[config.api_key_env];
    if (!apiKey) throw new Error(`Missing API key environment variable: ${config.api_key_env}`);
    headers.authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function parseJsonResponse(response) {
  const body = await response.text();
  let data;
  try {
    data = body ? JSON.parse(body) : {};
  } catch {
    data = { text: body };
  }
  if (!response.ok) {
    const message = data.error?.message || data.message || body || `${response.status} ${response.statusText}`;
    throw new Error(`Model provider request failed: ${message}`);
  }
  return data;
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}
