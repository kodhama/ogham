#!/usr/bin/env node
// The program `npx github:kodhama/ogham#v<version> <command>` runs. It prints
// a command's lines, to standard error when the command failed, and exits
// with its code.

import { run } from "../src/cli.mjs";

const { code, lines } = await run(process.argv.slice(2), process.cwd());
for (const line of lines) {
  if (code === 0) console.log(line);
  else console.error(line);
}
process.exitCode = code;
