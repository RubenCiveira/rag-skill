import fs from "node:fs/promises";
import path from "node:path";

export const supportedExtensions = new Set([".md", ".markdown", ".txt", ".pdf"]);

export async function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if ([".md", ".markdown", ".txt"].includes(ext)) {
    return [{ pageNumber: null, text: await fs.readFile(filePath, "utf8") }];
  }
  if (ext === ".pdf") return extractPdf(filePath);
  throw new Error(`Unsupported file type: ${ext}`);
}

async function extractPdf(filePath) {
  let pdfParse;
  try {
    ({ default: pdfParse } = await import("pdf-parse"));
  } catch (error) {
    throw new Error("PDF ingestion requires optional npm dependency: npm install pdf-parse");
  }
  const buffer = await fs.readFile(filePath);
  const parsed = await pdfParse(buffer);
  return [{ pageNumber: null, text: parsed.text || "" }];
}
