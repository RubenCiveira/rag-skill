#!/usr/bin/env node
import { main } from "../lib/cli.js";

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(`error: ${error.message}`);
    process.exit(1);
  },
);
