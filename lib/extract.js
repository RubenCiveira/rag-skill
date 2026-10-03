import fs from "node:fs/promises";
import path from "node:path";
import { readOcrConfig, scannedPdfMessage } from "./ocr-local.js";

export const supportedExtensions = new Set([".md", ".markdown", ".txt", ".pdf"]);

export async function extractText(filePath, options = {}) {
  const ext = path.extname(filePath).toLowerCase();
  if ([".md", ".markdown", ".txt"].includes(ext)) {
    return [{ pageNumber: null, text: await fs.readFile(filePath, "utf8") }];
  }
  if (ext === ".pdf") return extractPdf(filePath, options);
  throw new Error(`Unsupported file type: ${ext}`);
}

async function extractPdf(filePath, options = {}) {
  let pdfParse;
  try {
    ({ default: pdfParse } = await import("pdf-parse"));
  } catch (error) {
    throw new Error("PDF ingestion requires optional npm dependency: npm install pdf-parse");
  }
  const buffer = await fs.readFile(filePath);
  const parsed = await pdfParse(buffer);
  const text = parsed.text || "";
  const ocrConfig = options.home ? await readOcrConfig(options.home) : null;
  const minTextChars = ocrConfig?.min_text_chars ?? 80;
  if (text.trim().length < minTextChars) {
    throw new Error(scannedPdfMessage(ocrConfig || undefined));
  }
  return [{ pageNumber: null, text }];
}
