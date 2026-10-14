#!/usr/bin/env node
// The program `npx github:kodhama/ogham#v<version> <command>` runs. It prints
// a command's lines, to standard error when the command failed, and exits
// with its code. An error no command expected, such as a file it could not
// read before writing anything, is printed as one line and exits 1.

import { run } from "../src/cli.mjs";

/** @type {import("../src/apply.mjs").Outcome} */
const { code, lines } = await run(process.argv.slice(2), process.cwd()).catch(
  (/** @type {unknown} */ error) => ({
    code: 1,
    lines: [
      `ogham stopped: ${error instanceof Error ? error.message : String(error)}`,
    ],
  }),
);
for (const line of lines) {
  if (code === 0) console.log(line);
  else console.error(line);
}
process.exitCode = code;
