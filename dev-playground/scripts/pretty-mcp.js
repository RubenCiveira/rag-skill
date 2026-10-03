#!/usr/bin/env node
import process from "node:process";

const input = await readStdin();
if (!input.trim()) process.exit(0);

for (const line of input.trim().split(/\n+/)) {
  try {
    printMcp(JSON.parse(line));
  } catch {
    console.log(line);
  }
}

async function readStdin() {
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

function printMcp(message) {
  if (message.error) {
    heading("MCP Error");
    console.log(message.error.message || JSON.stringify(message.error, null, 2));
    return;
  }
  const result = message.result;
  if (!result) return console.log(JSON.stringify(message, null, 2));
  if (Array.isArray(result.tools)) {
    heading("MCP Tools");
    if (result.message) console.log(dim(result.message));
    for (const tool of result.tools) console.log(`${green(tool.name)} ${dim("- " + tool.description)}`);
    return;
  }
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (text) {
    const parsed = parseMaybeJson(text);
    return parsed !== null ? printValue(parsed) : console.log(text);
  }
  printValue(result);
}

function printValue(value) {
  if (Array.isArray(value)) {
    heading(`Results (${value.length})`);
    for (const [index, item] of value.entries()) {
      console.log(`${yellow("[" + (index + 1) + "]")} ${summary(item)}`);
      printObject(item, "  ");
    }
    return;
  }
  if (typeof value === "object" && value !== null) {
    if (value.message) {
      heading("Message");
      console.log(value.message);
      console.log();
    }
    printObject(value);
    return;
  }
  console.log(String(value));
}

function printObject(object, indent = "") {
  for (const [key, value] of Object.entries(object)) {
    if (key === "text" && typeof value === "string") {
      console.log(`${indent}${blue(key)}:`);
      console.log(wrap(value, indent + "  "));
    } else if (Array.isArray(value)) {
      console.log(`${indent}${blue(key)}:`);
      for (const item of value) console.log(`${indent}  - ${typeof item === "object" && item !== null ? summary(item) : item}`);
    } else if (typeof value === "object" && value !== null) {
      console.log(`${indent}${blue(key)}:`);
      printObject(value, indent + "  ");
    } else {
      console.log(`${indent}${blue(key)}: ${String(value)}`);
    }
  }
}

function summary(item) {
  return item.label || item.document_title || item.chunk_title || item.name || item.path || "";
}

function parseMaybeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function heading(text) { console.log(bold(text)); }
function wrap(text, indent) { return text.replace(/\s+/g, " ").match(/.{1,100}(\s|$)/g)?.map((line) => indent + line.trim()).join("\n") || indent + text; }
function bold(text) { return `\x1b[1m${text}\x1b[0m`; }
function blue(text) { return `\x1b[34m${text}\x1b[0m`; }
function green(text) { return `\x1b[32m${text}\x1b[0m`; }
function yellow(text) { return `\x1b[33m${text}\x1b[0m`; }
function dim(text) { return `\x1b[2m${text}\x1b[0m`; }
