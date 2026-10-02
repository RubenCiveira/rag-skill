import { spawn, spawnSync } from "node:child_process";
import os from "node:os";

const DEFAULT_OLLAMA_URL = "http://localhost:11434";

export async function ollamaStatus(baseUrl = DEFAULT_OLLAMA_URL) {
  const binary = commandExists("ollama");
  const service = await serviceStatus(baseUrl);
  return {
    binary_installed: binary,
    base_url: baseUrl,
    service_running: service.running,
    version: binary ? commandOutput("ollama", ["--version"]) : null,
    error: service.error || null,
  };
}

export function ollamaInstallInstructions() {
  const platform = os.platform();
  if (platform === "darwin") {
    return [
      "macOS installation options:",
      "1. Homebrew: brew install ollama",
      "2. App download: https://ollama.com/download/mac",
      "",
      "After installing, run: ollama serve",
      "Then pull a model: ollama pull qwen2.5:7b",
    ].join("\n");
  }
  if (platform === "linux") {
    return [
      "Linux installation:",
      "curl -fsSL https://ollama.com/install.sh | sh",
      "",
      "After installing, run: ollama serve",
      "Then pull a model: ollama pull qwen2.5:7b",
    ].join("\n");
  }
  return "Install Ollama from https://ollama.com/download and ensure the `ollama` command is available on PATH.";
}

export function installOllama({ method = "instructions", yes = false } = {}) {
  if (!yes || method === "instructions") {
    return { executed: false, message: ollamaInstallInstructions() };
  }
  if (method === "brew") {
    if (os.platform() !== "darwin") throw new Error("Homebrew installation is intended for macOS.");
    runChecked("brew", ["install", "ollama"]);
    return { executed: true, method };
  }
  throw new Error(`Unsupported Ollama install method: ${method}`);
}

export async function startOllama(baseUrl = DEFAULT_OLLAMA_URL) {
  const status = await ollamaStatus(baseUrl);
  if (!status.binary_installed) throw new Error("Ollama binary is not installed. Run: rag-corpus ollama install");
  if (status.service_running) return { started: false, message: "Ollama service is already running.", status };
  const child = spawn("ollama", ["serve"], { detached: true, stdio: "ignore" });
  child.unref();
  await sleep(1200);
  return { started: true, status: await ollamaStatus(baseUrl) };
}

export function pullOllamaModel(model) {
  if (!model) throw new Error("Missing Ollama model name.");
  if (!commandExists("ollama")) throw new Error("Ollama binary is not installed. Run: rag-corpus ollama install");
  runChecked("ollama", ["pull", model], { inherit: true });
  return { pulled: model };
}

export function listOllamaModels() {
  if (!commandExists("ollama")) throw new Error("Ollama binary is not installed. Run: rag-corpus ollama install");
  return commandOutput("ollama", ["list"]);
}

async function serviceStatus(baseUrl) {
  try {
    const response = await fetch(`${stripTrailingSlash(baseUrl)}/api/tags`);
    if (!response.ok) return { running: false, error: `${response.status} ${response.statusText}` };
    return { running: true };
  } catch (error) {
    return { running: false, error: error.message };
  }
}

function commandExists(command) {
  const result = spawnSync(command, ["--version"], { encoding: "utf8" });
  return !result.error && result.status === 0;
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || result.stderr || "").trim();
}

function runChecked(command, args, { inherit = false } = {}) {
  const result = spawnSync(command, args, { stdio: inherit ? "inherit" : "pipe", encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
