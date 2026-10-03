import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { readJson, writeJson } from "./fs-utils.js";

export const DEFAULT_OCR_CONFIG = {
  provider: null,
  languages: ["eng"],
  pdf_renderer: "poppler",
  min_text_chars: 80,
};

export async function readOcrConfig(home) {
  const config = await readJson(path.join(home, "config.json"), {});
  return { ...DEFAULT_OCR_CONFIG, ...(config.ocr || {}) };
}

export async function setOcrConfig(home, ocrConfig) {
  const configPath = path.join(home, "config.json");
  const config = await readJson(configPath, {});
  config.schema_version = config.schema_version || 1;
  config.corpora_dir = config.corpora_dir || "corpora";
  config.ocr = {
    provider: ocrConfig.provider,
    languages: ocrConfig.languages || DEFAULT_OCR_CONFIG.languages,
    pdf_renderer: ocrConfig.pdfRenderer || ocrConfig.pdf_renderer || DEFAULT_OCR_CONFIG.pdf_renderer,
    min_text_chars: Number(ocrConfig.minTextChars || ocrConfig.min_text_chars || DEFAULT_OCR_CONFIG.min_text_chars),
  };
  await writeJson(configPath, config);
  return config.ocr;
}

export async function ocrStatus(home) {
  const config = await readOcrConfig(home);
  return {
    config,
    tesseract: binaryStatus("tesseract", ["--version"]),
    poppler: binaryStatus("pdftoppm", ["-v"]),
    install: ocrInstallInstructions(),
  };
}

export function ocrInstallInstructions() {
  const platform = os.platform();
  if (platform === "darwin") {
    return {
      platform,
      commands: [
        "brew install tesseract",
        "brew install tesseract-lang",
        "brew install poppler",
      ],
      notes: [
        "tesseract is required for OCR.",
        "tesseract-lang installs additional language packs such as Spanish.",
        "poppler provides pdftoppm for rendering scanned PDF pages to images.",
      ],
    };
  }
  if (platform === "linux") {
    return {
      platform,
      commands: [
        "sudo apt-get update",
        "sudo apt-get install -y tesseract-ocr tesseract-ocr-eng tesseract-ocr-spa poppler-utils",
      ],
      notes: [
        "Install the tesseract-ocr-* packages for every OCR language you need.",
        "poppler-utils provides pdftoppm for rendering scanned PDF pages to images.",
      ],
    };
  }
  if (platform === "win32") {
    return {
      platform,
      commands: [
        "choco install tesseract",
        "choco install poppler",
      ],
      notes: [
        "Run the commands from an elevated PowerShell if required.",
        "Ensure tesseract.exe and pdftoppm.exe are available on PATH.",
      ],
    };
  }
  return {
    platform,
    commands: [
      "Install Tesseract OCR for your operating system.",
      "Install Poppler and ensure pdftoppm is available on PATH.",
    ],
    notes: [],
  };
}

export function scannedPdfMessage(ocrConfig = DEFAULT_OCR_CONFIG) {
  const install = ocrInstallInstructions();
  if (!ocrConfig.provider) {
    return [
      "PDF appears to contain little or no embedded text and may require OCR.",
      "Configure OCR with: rag-corpus ocr setup --provider tesseract-native --languages eng,spa",
      "Then install the required native tools for this host:",
      ...install.commands.map((command) => `  ${command}`),
    ].join("\n");
  }
  if (ocrConfig.provider === "tesseract-native") {
    const missing = [];
    if (!binaryStatus("tesseract", ["--version"]).available) missing.push("tesseract");
    if (ocrConfig.pdf_renderer === "poppler" && !binaryStatus("pdftoppm", ["-v"]).available) missing.push("pdftoppm/poppler");
    if (missing.length) {
      return [
        `OCR provider '${ocrConfig.provider}' is configured but required tools are missing: ${missing.join(", ")}.`,
        "Install the required native tools for this host:",
        ...install.commands.map((command) => `  ${command}`),
      ].join("\n");
    }
  }
  return "PDF appears to require OCR, but OCR execution is not implemented yet for this provider.";
}

function binaryStatus(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    command,
    available: !result.error && result.status === 0,
    version: !result.error && result.status === 0 ? (result.stdout || result.stderr || "").split("\n")[0].trim() : null,
    error: result.error ? result.error.message : result.status === 0 ? null : (result.stderr || result.stdout || "").trim() || null,
  };
}
