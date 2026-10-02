import os from "node:os";
import path from "node:path";

export function defaultHome() {
  return process.env.RAG_CORPUS_HOME
    ? path.resolve(expandHome(process.env.RAG_CORPUS_HOME))
    : path.join(os.homedir(), ".rag-corpus");
}

export function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

export function corporaDir(home = defaultHome()) {
  return path.join(home, "corpora");
}
